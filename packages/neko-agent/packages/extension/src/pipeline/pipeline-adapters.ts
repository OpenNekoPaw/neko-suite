/**
 * Pipeline Stage Adapters — Bridges stage dependency interfaces to real services
 *
 * Each adapter wraps an existing service (MediaGenerationService, NekoCutAPI, etc.)
 * and exposes it as the interface that pipeline stages expect.
 */

import * as vscode from 'vscode';
import {
  createStoryboardPayload,
  type CreatedCanvasStoryboard,
  type NekoCanvasAPI,
  type NekoCutAPI,
  type NekoStoryAPI,
  type StoryScenePlan,
} from '@neko/shared';
import { resolveCharacterBindingsForNames } from '@neko/shared/vscode/extension';
import type { IDocumentReaderService } from '../services/DocumentReaderService';
import { EngineClient } from '@neko/neko-client';
import type { IAudioAnalyzer, IFrameExtractor } from '../tools/qualityCheckTools';
import { getLogger } from '../base';

// Inline stage dependency interfaces to avoid cross-package import issues.
// These mirror the interfaces defined in @neko/agent/src/pipeline/stages/*.ts

interface StoryboardScene {
  index: number;
  heading: string;
  description: string;
  dialogue: string[];
  estimatedDuration: number;
  suggestedPrompt: string;
}

export interface IFileReader {
  readFile(filePath: string): Promise<string>;
}

export interface IDocumentReader {
  read(filePath: string): Promise<{ text: string; metadata?: Record<string, unknown> }>;
  supports(filePath: string): boolean;
}

export interface IStoryParser {
  parseToScenes(content: string): StoryboardScene[];
}

export interface IStructuredStoryPlanner {
  plan(ctx: {
    source?: string;
    sourceFormat?: 'fountain' | 'freeform' | 'document';
    globalStyle?: string;
    stageParams?: Record<string, Record<string, unknown>>;
  }): Promise<{ scenes: StoryboardScene[]; scenePlans: readonly StoryScenePlan[] } | undefined>;
}

export interface IStoryboardCanvasSink {
  importStoryboard(ctx: {
    source?: string;
    sourceFormat?: 'fountain' | 'freeform' | 'document';
    scenePlans?: readonly StoryScenePlan[];
    stageParams?: Record<string, Record<string, unknown>>;
  }): Promise<CreatedCanvasStoryboard | undefined>;
}

export interface ILLMAnalyzer {
  extractScenes(text: string, style?: string): Promise<StoryboardScene[]>;
}

export interface IPromptOptimizer {
  optimizePrompt(scene: StoryboardScene, globalStyle?: string): Promise<string>;
}

export interface IMediaGenerator {
  generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }>;
}

export interface MediaGenerateOptions {
  type?: 'image' | 'video';
  duration?: number;
  resolution?: string;
  style?: string;
  aspectRatio?: string;
}

export interface ITimelineArranger {
  addElement(config: {
    type: 'video' | 'image' | 'audio';
    source: string;
    startTime: number;
    duration?: number;
    trackName?: string;
  }): Promise<string>;
  setTransition?(config: { elementId: string; type: string; duration: number }): Promise<void>;
}

const logger = getLogger('PipelineAdapters');

// =============================================================================
// IFileReader → vscode.workspace.fs
// =============================================================================

export class VSCodeFileReader implements IFileReader {
  async readFile(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf-8');
  }
}

// =============================================================================
// IDocumentReader → DocumentReaderService
// =============================================================================

export class DocumentReaderAdapter implements IDocumentReader {
  constructor(private readonly service: IDocumentReaderService) {}

  async read(filePath: string): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    const result = await this.service.read(filePath);
    return {
      text: result.text,
      metadata: {
        ...result.metadata,
        pageCount: result.pageCount,
        imagePaths: result.imagePaths,
      },
    };
  }

  supports(filePath: string): boolean {
    return this.service.supports(filePath);
  }
}

// =============================================================================
// IStoryParser → neko-story extension API
// =============================================================================

export class StoryParserAdapter implements IStoryParser {
  parseToScenes(content: string): StoryboardScene[] {
    // Synchronous: call neko-story parser directly
    // neko-story extension exposes parseScript() via API
    const storyExt = vscode.extensions.getExtension('neko.neko-story');
    if (!storyExt?.isActive) {
      logger.warn('neko-story extension not active, using fallback parser');
      return this.fallbackParse(content);
    }

    try {
      const api = storyExt.exports as { parseScript: (text: string) => unknown };
      const doc = api.parseScript(content) as {
        elements: Array<{
          type: string;
          raw?: string;
          text?: string;
          location?: string;
          time?: string;
        }>;
      };

      return this.fountainDocToScenes(doc);
    } catch (error) {
      logger.warn('Failed to use neko-story parser, using fallback', { error });
      return this.fallbackParse(content);
    }
  }

  private fountainDocToScenes(doc: {
    elements: Array<{
      type: string;
      raw?: string;
      text?: string;
      location?: string;
      time?: string;
    }>;
  }): StoryboardScene[] {
    const scenes: StoryboardScene[] = [];
    let currentScene: StoryboardScene | null = null;
    let sceneIndex = 0;

    for (const el of doc.elements) {
      if (el.type === 'scene_heading') {
        // Save previous scene
        if (currentScene) {
          scenes.push(currentScene);
        }
        // Start new scene
        const heading = el.raw ?? `${el.location ?? ''} - ${el.time ?? ''}`.trim();
        currentScene = {
          index: sceneIndex++,
          heading,
          description: '',
          dialogue: [],
          estimatedDuration: 3, // Will be updated
          suggestedPrompt: heading,
        };
      } else if (currentScene) {
        if (el.type === 'action') {
          currentScene.description += (currentScene.description ? ' ' : '') + (el.text ?? '');
          currentScene.estimatedDuration += 2;
        } else if (el.type === 'dialogue') {
          currentScene.dialogue.push(el.text ?? '');
          currentScene.estimatedDuration += 1.5;
        }
      }
    }

    // Push last scene
    if (currentScene) {
      scenes.push(currentScene);
    }

    // Generate initial prompts from scene content
    for (const scene of scenes) {
      scene.suggestedPrompt = this.sceneToPrompt(scene);
    }

    return scenes;
  }

  private sceneToPrompt(scene: StoryboardScene): string {
    const parts = [scene.heading];
    if (scene.description) {
      parts.push(scene.description);
    }
    return parts.join('. ').slice(0, 500);
  }

  private fallbackParse(content: string): StoryboardScene[] {
    // Simple fallback: split by empty lines, each paragraph = scene
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    return paragraphs.map((text, index) => ({
      index,
      heading: `Scene ${index + 1}`,
      description: text,
      dialogue: [],
      estimatedDuration: Math.max(3, Math.ceil(text.length / 100) * 2),
      suggestedPrompt: text.slice(0, 500),
    }));
  }
}

// =============================================================================
// IStructuredStoryPlanner → neko-story extension API
// =============================================================================

export class StructuredStoryPlannerAdapter implements IStructuredStoryPlanner {
  async plan(ctx: {
    source?: string;
    sourceFormat?: 'fountain' | 'freeform' | 'document';
    globalStyle?: string;
    stageParams?: Record<string, Record<string, unknown>>;
  }): Promise<{ scenes: StoryboardScene[]; scenePlans: readonly StoryScenePlan[] } | undefined> {
    if (ctx.sourceFormat !== 'fountain' || !ctx.source || ctx.source.includes('\n')) {
      return undefined;
    }

    const storyExt = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    if (!storyExt) {
      logger.warn('neko-story extension not installed, skipping structured scene planning');
      return undefined;
    }

    const api = storyExt.isActive
      ? storyExt.exports
      : ((await storyExt.activate()) as NekoStoryAPI);

    const sceneIdsRaw = ctx.stageParams?.['parseStoryboard']?.['sceneIds'];
    const sceneIds = Array.isArray(sceneIdsRaw)
      ? sceneIdsRaw.filter((value): value is string => typeof value === 'string')
      : undefined;

    const scenePlans = api.generateScenePlans(ctx.source, sceneIds);
    const scriptIndex = api.getScriptIndex(ctx.source);
    if (!scenePlans || !scriptIndex) {
      logger.warn(
        'neko-story ScriptIndex unavailable, falling back to parser-based scene extraction',
      );
      return undefined;
    }

    const scenes = scenePlans.map((scenePlan, index) => {
      const scene = scriptIndex.scenes.find((entry) => entry.sceneId === scenePlan.sceneId);
      const description =
        scenePlan.summary || scene?.actionSummary || scenePlan.sceneTitle || 'Scene';
      const suggestedPrompt = scenePlan.shotPlans
        ?.map((shotPlan) => shotPlan.visualDescription)
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(' ')
        .slice(0, 500);

      return {
        index,
        sceneId: scenePlan.sceneId,
        heading: scene?.heading ?? scenePlan.sceneTitle ?? `Scene ${index + 1}`,
        description,
        dialogue:
          scenePlan.shotPlans
            ?.map((shotPlan) => shotPlan.dialogue)
            .filter((value): value is string => Boolean(value && value.trim())) ?? [],
        estimatedDuration:
          scenePlan.shotPlans?.reduce((total, shotPlan) => total + (shotPlan.duration ?? 0), 0) ??
          scene?.estimatedDuration ??
          3,
        suggestedPrompt:
          suggestedPrompt && suggestedPrompt.length > 0
            ? suggestedPrompt
            : [scene?.sceneTitle, description].filter(Boolean).join('. ').slice(0, 500),
        shotPlans: scenePlan.shotPlans,
      } satisfies StoryboardScene;
    });

    return { scenes, scenePlans };
  }
}

export class CanvasStoryboardSinkAdapter implements IStoryboardCanvasSink {
  async importStoryboard(ctx: {
    source?: string;
    sourceFormat?: 'fountain' | 'freeform' | 'document';
    scenePlans?: readonly StoryScenePlan[];
    stageParams?: Record<string, Record<string, unknown>>;
  }): Promise<CreatedCanvasStoryboard | undefined> {
    if (
      ctx.sourceFormat !== 'fountain' ||
      !ctx.source ||
      !ctx.scenePlans ||
      ctx.scenePlans.length === 0
    ) {
      return undefined;
    }

    const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
    const storyExt = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    if (!canvasExt || !storyExt) {
      logger.warn(
        'importStoryboardToCanvas: neko-story or neko-canvas extension is unavailable, skipping canvas import',
      );
      return undefined;
    }

    const canvasApi = canvasExt.isActive
      ? canvasExt.exports
      : ((await canvasExt.activate()) as NekoCanvasAPI);
    const storyApi = storyExt.isActive
      ? storyExt.exports
      : ((await storyExt.activate()) as NekoStoryAPI);

    const scriptIndex = storyApi.getScriptIndex(ctx.source);
    if (!scriptIndex) {
      throw new Error(
        'importStoryboardToCanvas: ScriptIndex unavailable. Open the screenplay first.',
      );
    }

    const sceneIds = new Set(ctx.scenePlans.map((plan) => plan.sceneId));
    const filteredIndex = {
      ...scriptIndex,
      scenes: scriptIndex.scenes.filter((scene) => sceneIds.has(scene.sceneId)),
    };

    const stageParams = ctx.stageParams?.['importStoryboardToCanvas'] ?? {};
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const characterBindings = await resolveCharacterBindingsForNames(
      filteredIndex.characters.map((character) => character.name),
      {
        workspaceRoot,
        uriOrPath: ctx.source,
        characterResolver: storyApi,
      },
    );
    const payload = createStoryboardPayload(filteredIndex, {
      mode: 'semantic',
      scenesLimit: filteredIndex.scenes.length,
      scenePlans: ctx.scenePlans,
      characterBindings,
    });

    return canvasApi.storyboard.import(payload, {
      startX: stageParams['startX'] as number | undefined,
      startY: stageParams['startY'] as number | undefined,
    });
  }
}

// =============================================================================
// ILLMAnalyzer → vscode command neko.agent.internalChat
// =============================================================================

export class LLMAnalyzerAdapter implements ILLMAnalyzer {
  async extractScenes(text: string, style?: string): Promise<StoryboardScene[]> {
    const systemPrompt = `You are a storyboard analyst. Extract visual scenes from the text.
Return a JSON array of scenes. Each scene: { "heading": "...", "description": "...", "dialogue": [], "estimatedDuration": N, "suggestedPrompt": "..." }
${style ? `Visual style: ${style}` : ''}
Only return valid JSON array, no markdown fences.`;

    const response = await vscode.commands.executeCommand<string | null>(
      'neko.agent.internalChat',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.slice(0, 8000) },
      ],
      { maxTokens: 4000 },
    );

    if (!response) {
      throw new Error('LLM analysis failed: no response');
    }

    try {
      // Strip markdown fences if present
      const cleaned = response
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const scenes = JSON.parse(cleaned) as StoryboardScene[];
      return scenes.map((s, i) => ({ ...s, index: i }));
    } catch {
      throw new Error('LLM analysis failed: could not parse response as JSON');
    }
  }
}

// =============================================================================
// IPromptOptimizer → vscode command neko.agent.internalChat
// =============================================================================

export class PromptOptimizerAdapter implements IPromptOptimizer {
  async optimizePrompt(scene: StoryboardScene, globalStyle?: string): Promise<string> {
    const systemPrompt = `You are a video generation prompt engineer. Optimize the scene description into a concise, vivid prompt for AI video generation (Sora/Runway/Kling style).
Focus on: camera angle, lighting, movement, atmosphere. Max 200 words.
${globalStyle ? `Style: ${globalStyle}` : ''}
Return only the optimized prompt text, nothing else.`;

    const userContent = `Scene: ${scene.heading}\nDescription: ${scene.description}\nDialogue: ${scene.dialogue.join('; ')}`;

    const response = await vscode.commands.executeCommand<string | null>(
      'neko.agent.internalChat',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 500 },
    );

    return response ?? scene.suggestedPrompt;
  }
}

// =============================================================================
// IMediaGenerator → MediaGenerationService (via Platform)
// =============================================================================

export class MediaGeneratorAdapter implements IMediaGenerator {
  constructor(
    private readonly generateFn: (
      prompt: string,
      options: MediaGenerateOptions,
    ) => Promise<{ path: string; duration?: number }>,
  ) {}

  async generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }> {
    return this.generateFn(prompt, options);
  }
}

// =============================================================================
// ITimelineArranger → NekoCutAPI
// =============================================================================

export class TimelineArrangerAdapter implements ITimelineArranger {
  private api: NekoCutAPI | null = null;

  private async getAPI(): Promise<NekoCutAPI> {
    if (this.api) return this.api;

    const ext = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');
    if (!ext) {
      throw new Error('NekoCut extension not installed');
    }

    this.api = ext.isActive ? ext.exports : await ext.activate();
    return this.api;
  }

  async addElement(config: {
    type: 'video' | 'image' | 'audio';
    source: string;
    startTime: number;
    duration?: number;
    trackName?: string;
  }): Promise<string> {
    const api = await this.getAPI();

    // Find or use first track
    const elements = await api.timeline.listElements();
    const trackId = ((elements[0] as Record<string, unknown>)?.['trackId'] as string) ?? 'track-0';

    return api.timeline.addElement({
      type: config.type === 'video' ? 'video' : config.type,
      trackId,
      startTime: config.startTime,
      duration: config.duration ?? 4,
      source: config.source,
    });
  }

  async setTransition(config: {
    elementId: string;
    type: string;
    duration: number;
  }): Promise<void> {
    const api = await this.getAPI();
    await api.timeline.updateElement(config.elementId, {
      transitionIn: {
        type: config.type,
        duration: config.duration,
      },
    });
  }
}

// =============================================================================
// IAudioAnalyzer → EngineClient.analyzeLoudness
// =============================================================================

const ENGINE_EXTENSION_ID = 'neko.nekoengine';

/** Lazy EngineClient singleton shared by quality check adapters */
let _engineClient: EngineClient | null = null;
async function getEngineClient(): Promise<EngineClient> {
  if (_engineClient) return _engineClient;

  const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
  if (!ext) {
    throw new Error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
  }
  if (!ext.isActive) await ext.activate();

  const result = await vscode.commands.executeCommand<{ port: number } | null>(
    'neko.engine.ensureFrameServer',
  );
  if (!result?.port) {
    throw new Error('Failed to start engine frame server');
  }
  _engineClient = new EngineClient(result.port, { timeout: 300_000 });
  return _engineClient;
}

export class EngineAudioAnalyzerAdapter implements IAudioAnalyzer {
  async analyzeLoudness(source: string, targetLufs?: number) {
    const client = await getEngineClient();
    return client.analyzeLoudness(source, targetLufs ?? -14);
  }

  async detectSilence(source: string, thresholdDbfs?: number, minDuration?: number) {
    const client = await getEngineClient();
    return client.detectSilence(source, thresholdDbfs ?? -40, minDuration ?? 0.5);
  }
}

// =============================================================================
// IFrameExtractor → EngineClient.extractFrame + probe
// =============================================================================

export class EngineFrameExtractorAdapter implements IFrameExtractor {
  async extractFrame(source: string, time: number): Promise<string | null> {
    const client = await getEngineClient();
    const buffer = await client.extractFrame(source, time);
    if (!buffer) return null;
    // Convert ArrayBuffer to base64 string
    return Buffer.from(buffer).toString('base64');
  }

  async probe(
    source: string,
  ): Promise<{ duration: number; fps: number; width: number; height: number }> {
    const client = await getEngineClient();
    const result = await client.probe('videos', source);
    return {
      duration: result.duration,
      fps: result.fps,
      width: result.width,
      height: result.height,
    };
  }
}
