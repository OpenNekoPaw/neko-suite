/**
 * NekoStory Agent Capability Provider
 *
 * VSCode adapter for the shared headless Story provider. Terminal-safe query,
 * planning, prompt, and reference capabilities live outside the extension
 * package; editor-bound inline diff remains here.
 */

import * as vscode from 'vscode';
import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  NekoStoryAPI,
  Tool,
  ToolParameters,
} from '@neko/shared';
import { TOOL_NAMES_STORY } from '@neko/shared';
import { createNekoStoryHeadlessCapabilityProvider } from '@neko-story/headless';
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
  private readonly headless: AgentCapabilityProvider;
  readonly id = 'neko-story';
  readonly version = '1.0.0';
  readonly hostRequirements = [{ host: 'vscode' }] as const;
  readonly requirements = { vscode: true, activeEditor: true, contentAccess: true } as const;

  constructor(api: NekoStoryAPI) {
    this.headless = createNekoStoryHeadlessCapabilityProvider(api);
  }

  getTools(context: AgentCapabilityContext): Tool[] {
    return [...this.headless.getTools(context), createStoryApplySuggestionTool()];
  }

  getToolGroups() {
    return [
      {
        name: 'story-editing',
        description:
          'Screenplay editing tools for NekoStory — script, fountain, scene, character, dialogue, search',
        tools: Object.values(TOOL_NAMES_STORY),
        alwaysActive: false,
        source: 'builtin' as const,
        enabled: true,
        loadingTier: 'eager' as const,
      },
    ];
  }

  getPromptFragments(context: AgentCapabilityContext) {
    return this.headless.getPromptFragments?.(context) ?? [];
  }

  getReferenceContributors(context: AgentCapabilityContext) {
    return this.headless.getReferenceContributors?.(context) ?? [];
  }
}

function createStoryApplySuggestionTool(): Tool {
  return {
    name: TOOL_NAMES_STORY.STORY_APPLY_SUGGESTION,
    description:
      'Propose a text edit to a specific range of a Fountain screenplay and let the user accept or reject it interactively. Opens the file, highlights the range, shows a modal with the suggested new text, and applies the edit only if the user accepts.',
    category: 'document',
    requiresConfirmation: true,
    safetyKind: 'confirmation-gated',
    requirements: { vscode: true, activeEditor: true },
    targetRequirements: {
      required: ['script_path', 'start_line', 'end_line', 'new_text'],
      allowedFallbacks: ['explicit-user-input'],
    },
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
    execute: async (args) => {
      try {
        const scriptPath = optionalString(args.script_path);
        const startLine = optionalNumber(args.start_line);
        const endLine = optionalNumber(args.end_line);
        const newText = optionalString(args.new_text);
        if (!scriptPath || startLine === undefined || endLine === undefined || !newText) {
          return {
            success: false,
            error: 'script_path, start_line, end_line, and new_text are required',
          };
        }

        await vscode.commands.executeCommand('neko.story.applyInlineDiff', {
          scriptPath,
          range: {
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: Number.MAX_SAFE_INTEGER },
          },
          newText,
        });

        getRootLogger().info(
          `story_apply_suggestion: presented diff for ${scriptPath} lines ${startLine}-${endLine}`,
        );
        return { success: true, data: { presented: true, scriptPath, startLine, endLine } };
      } catch (err) {
        return { success: false, error: `Failed to apply suggestion: ${String(err)}` };
      }
    },
  } as Tool & { readonly requirements: { readonly vscode: true; readonly activeEditor: true } };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
