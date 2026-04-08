/**
 * NekoStory Agent Capability Provider
 *
 * Provides screenplay indexing and search tools to neko-agent
 * via the AgentCapabilityProvider protocol.
 *
 * This replaces the `createNekoStoryTools()` factory function that was previously
 * maintained inside neko-agent's extension code.
 */

import * as vscode from 'vscode';
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  Tool,
  ToolGroup,
  ToolParameters,
  NekoStoryAPI,
} from '@neko/shared';
import { TOOL_NAMES_STORY } from '@neko/shared';
import { getRootLogger } from './utils/logger';

/**
 * Create the NekoStory capability provider.
 *
 * @param api The NekoStoryAPI exports from the extension activation
 */
export function createNekoStoryCapabilityProvider(api: NekoStoryAPI): AgentCapabilityProvider {
  return new NekoStoryCapabilityProviderImpl(api);
}

class NekoStoryCapabilityProviderImpl implements AgentCapabilityProvider {
  readonly id = 'neko-story';
  readonly version = '1.0.0';

  constructor(private readonly _api: NekoStoryAPI) {}

  getTools(context: AgentCapabilityContext): Tool[] {
    const api = this._api;
    const logger = getRootLogger();
    const embedFn = context.embedFn;

    return [
      // -----------------------------------------------------------------------
      // GetScriptIndex — structural index of a Fountain screenplay
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_STORY.GET_SCRIPT_INDEX,
        description:
          'Get a structured index of a Fountain screenplay (.fountain) file. ' +
          'Returns scenes with sequential IDs (S1, S2...) and 0-based line_start/line_end so you can ' +
          'fetch exact scene content with Read(offset=line_start, limit=line_end-line_start+1). ' +
          'Also returns all characters with their first appearance line and which scenes they appear in.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute file path or URI string of the .fountain screenplay file',
            },
          },
          required: ['path'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const index = api.getScriptIndex(args.path as string);
            if (!index) {
              return {
                success: false,
                error: 'Script not indexed yet. The file may not exist or has not been opened.',
              };
            }
            return { success: true, data: index };
          } catch (err) {
            return { success: false, error: `Failed to get script index: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // SearchScriptIndex — semantic or keyword search across scenes
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_STORY.SEARCH_SCRIPT_INDEX,
        description:
          'Search scenes in a Fountain screenplay by meaning or keywords. ' +
          (embedFn
            ? 'Uses semantic vector search for rich queries like "tense confrontation" or "scenes about loss". '
            : 'Uses keyword scoring (no embedding provider configured). ') +
          'Returns the top matching scenes with scene IDs, scores, and line numbers. ' +
          'Use Read(offset=line_start, limit=line_end-line_start+1) to fetch the full scene text.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute file path of the .fountain screenplay file',
            },
            query: {
              type: 'string',
              description: 'Natural language description of the scenes to find',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of results to return (default: 5, max: 20)',
            },
          },
          required: ['path', 'query'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const filePath = args.path as string;
            const query = args.query as string;
            const topK = Math.min((args.top_k as number | undefined) ?? 5, 20);

            // 1. Get structural index from the API
            const index = api.getScriptIndex(filePath);
            if (!index) {
              return {
                success: false,
                error:
                  'Script not indexed yet. Open the .fountain file in VSCode first, then retry.',
              };
            }
            if (index.scenes.length === 0) {
              return {
                success: true,
                data: { results: [], message: 'No scenes found in this screenplay.' },
              };
            }

            // 2. Read file content to extract scene body text for richer matching
            let lines: string[];
            try {
              const uri = filePath.startsWith('file://')
                ? vscode.Uri.parse(filePath)
                : vscode.Uri.file(filePath);
              const bytes = await vscode.workspace.fs.readFile(uri);
              lines = new TextDecoder('utf-8').decode(bytes).split('\n');
            } catch (err) {
              return { success: false, error: `Failed to read screenplay file: ${String(err)}` };
            }

            // 3. Build scene text inputs (heading + body lines)
            const sceneTexts = index.scenes.map((scene) => ({
              id: scene.id,
              heading: scene.heading,
              line_start: scene.line_start,
              line_end: scene.line_end,
              text: lines
                .slice(scene.line_start, scene.line_end + 1)
                .join('\n')
                .trim(),
            }));

            // 4a. Vector path — requires embedFn (preferred)
            if (embedFn) {
              try {
                // Embed all scenes + query
                const sceneTextInputs = sceneTexts.map((s) =>
                  `${s.heading}\n${s.text}`.slice(0, 2000),
                );
                const allInputs = [...sceneTextInputs, query];
                const allEmbeddings = await embedFn(allInputs);
                const queryVec = allEmbeddings[allEmbeddings.length - 1];
                if (!queryVec) {
                  return { success: false, error: 'Failed to embed query' };
                }

                // Cosine similarity search
                const scored = sceneTexts.map((scene, i) => {
                  const sceneVec = allEmbeddings[i];
                  if (!sceneVec) return { scene, score: 0 };
                  let dot = 0;
                  let normA = 0;
                  let normB = 0;
                  for (let j = 0; j < queryVec.length; j++) {
                    const a = queryVec[j] ?? 0;
                    const b = sceneVec[j] ?? 0;
                    dot += a * b;
                    normA += a * a;
                    normB += b * b;
                  }
                  const denom = Math.sqrt(normA) * Math.sqrt(normB);
                  return { scene, score: denom > 0 ? dot / denom : 0 };
                });

                const results = scored
                  .sort((a, b) => b.score - a.score)
                  .slice(0, topK)
                  .map((r) => ({
                    scene_id: r.scene.id,
                    score: parseFloat(r.score.toFixed(3)),
                    line_start: r.scene.line_start,
                    line_end: r.scene.line_end,
                    heading: r.scene.heading,
                  }));

                logger.info(
                  `SearchScriptIndex: query="${query}" topK=${topK} scenes=${index.scenes.length} results=${results.length} mode=vector`,
                );
                return { success: true, data: { results, mode: 'vector' } };
              } catch (err) {
                // Fall through to keyword search on embedding failure
                logger.warn(
                  `SearchScriptIndex: embedding failed, falling back to keyword: ${String(err)}`,
                );
              }
            }

            // 4b. TF-IDF keyword fallback
            const queryTokens = query
              .toLowerCase()
              .split(/\W+/)
              .filter((t) => t.length > 1);

            if (queryTokens.length === 0) {
              return {
                success: true,
                data: { results: [], message: 'Query produced no searchable tokens.' },
              };
            }

            const scored = sceneTexts.map((scene) => {
              const haystack = `${scene.heading} ${scene.text}`.toLowerCase();
              let score = 0;
              for (const token of queryTokens) {
                const headingHit = scene.heading.toLowerCase().includes(token);
                const bodyCount = (haystack.match(new RegExp(token, 'g')) ?? []).length;
                score += headingHit ? bodyCount + 2 : bodyCount;
              }
              return {
                scene_id: scene.id,
                score: parseFloat((score / queryTokens.length).toFixed(3)),
                line_start: scene.line_start,
                line_end: scene.line_end,
                heading: scene.heading,
              };
            });

            const results = scored
              .filter((r) => r.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, topK);

            logger.info(
              `SearchScriptIndex: query="${query}" topK=${topK} scenes=${index.scenes.length} results=${results.length} mode=tfidf`,
            );
            return {
              success: true,
              data: {
                results,
                mode: 'tfidf',
                note: 'Configure an embedding provider for semantic search.',
              },
            };
          } catch (err) {
            return { success: false, error: `Search failed: ${String(err)}` };
          }
        },
      },

      // -----------------------------------------------------------------------
      // story_apply_suggestion — present an AI edit suggestion inline
      // -----------------------------------------------------------------------
      {
        name: TOOL_NAMES_STORY.STORY_APPLY_SUGGESTION,
        description:
          'Propose a text edit to a specific range of a Fountain screenplay and let the user ' +
          'accept or reject it interactively. Opens the file, highlights the range, shows a modal ' +
          'with the suggested new text, and applies the edit only if the user accepts. ' +
          'Use this after analysing script content via GetScriptIndex and reading the relevant lines. ' +
          'Line numbers are 0-based, matching GetScriptIndex output.',
        category: 'document',
        parameters: {
          type: 'object',
          properties: {
            script_path: {
              type: 'string',
              description: 'Absolute path to the .fountain screenplay file',
            },
            start_line: {
              type: 'number',
              description: '0-based start line of the range to replace',
            },
            end_line: {
              type: 'number',
              description: '0-based end line (inclusive) of the range to replace',
            },
            new_text: {
              type: 'string',
              description: 'The replacement text (will replace the entire highlighted range)',
            },
          },
          required: ['script_path', 'start_line', 'end_line', 'new_text'],
        } satisfies ToolParameters,
        async execute(args) {
          try {
            const scriptPath = args.script_path as string;
            const startLine = args.start_line as number;
            const endLine = args.end_line as number;
            const newText = args.new_text as string;

            await vscode.commands.executeCommand('neko.story.applyInlineDiff', {
              scriptPath,
              range: {
                start: { line: startLine, character: 0 },
                end: { line: endLine, character: Number.MAX_SAFE_INTEGER },
              },
              newText,
            });

            logger.info(
              `story_apply_suggestion: presented diff for ${scriptPath} lines ${startLine}-${endLine}`,
            );
            return { success: true, data: { presented: true, scriptPath, startLine, endLine } };
          } catch (err) {
            return { success: false, error: `Failed to apply suggestion: ${String(err)}` };
          }
        },
      },
    ];
  }

  getToolGroups(): ToolGroup[] {
    return [
      {
        name: 'story-editing',
        description:
          'Screenplay editing tools for NekoStory — script, fountain, scene, character, dialogue, search',
        tools: Object.values(TOOL_NAMES_STORY),
        alwaysActive: false,
        source: 'builtin',
        enabled: true,
        loadingTier: 'eager',
      },
    ];
  }
}
