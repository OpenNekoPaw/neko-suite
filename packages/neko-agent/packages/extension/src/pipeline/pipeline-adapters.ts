/**
 * Pipeline Stage Adapters — Bridges stage dependency interfaces to real services
 *
 * Each adapter wraps an existing service (MediaGenerationService, NekoCutAPI, etc.)
 * and exposes it as the interface that pipeline stages expect.
 */

import * as vscode from 'vscode';
import type { NekoCutAPI } from '@neko/shared';
import type { IDocumentReaderService } from '../services/DocumentReaderService';
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
    const storyExt = vscode.extensions.getExtension('neko.nekostory');
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
