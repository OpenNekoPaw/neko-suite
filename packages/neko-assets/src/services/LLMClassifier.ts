/**
 * LLM Classifier
 *
 * Implements IAssetClassifier by calling neko-agent's LLM via the
 * 'neko.agent.internalChat' cross-extension command.
 * Falls back to the injected fallback classifier on any error.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IAssetClassifier } from '@neko/asset';
import type {
  ClassificationResult,
  SuggestedEntity,
  VariantAttributes,
  EntityCategory,
  ClassifierOptions,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('LLMClassifier');

// Image extensions and their MIME types — serves as both membership test and MIME lookup
const IMAGE_MIME_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.tiff', 'image/tiff'],
  ['.tif', 'image/tiff'],
  ['.svg', 'image/svg+xml'],
]);

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB

// ---------------------------------------------------------------------------
// Runtime guards for JSON.parse results
// ---------------------------------------------------------------------------

function isValidClassifyResult(val: unknown): val is {
  category: EntityCategory;
  name: string;
  description: string;
  tags: string[];
  attributes: Record<string, string | undefined>;
  confidence: number;
} {
  if (typeof val !== 'object' || val === null) return false;
  const v = val as Record<string, unknown>;
  return (
    typeof v['category'] === 'string' &&
    typeof v['name'] === 'string' &&
    typeof v['description'] === 'string' &&
    Array.isArray(v['tags']) &&
    typeof v['confidence'] === 'number'
  );
}

function isVariantAttributesShape(val: unknown): val is Record<string, string | undefined> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

const SYSTEM_PROMPT_CLASSIFY = `\
You are a creative asset classifier for a video/game production pipeline.
Analyze the provided file and return ONLY valid JSON with this exact schema:
{
  "category": "character"|"creature"|"object"|"vehicle"|"environment"|"effect"|"ui"|"audio"|"document",
  "name": "human-readable name without extension",
  "description": "one sentence description",
  "tags": ["tag1", "tag2"],
  "attributes": {
    "view": "front"|"back"|"left"|"right"|"top"|"bottom"|"isometric"|"3/4" (optional),
    "expression": "neutral"|"happy"|"sad"|"angry"|"surprised"|"talking"|"sleeping" (optional),
    "action": "idle"|"walk"|"run"|"jump"|"attack"|"sit"|"lie" (optional)
  },
  "confidence": 0.0 to 1.0
}
Return only the JSON object, no markdown fences, no explanation.`;

const SYSTEM_PROMPT_TAGS = `\
You are a creative asset tagger. Given a file name, return ONLY a JSON array of relevant tags.
Example: ["character", "female", "warrior", "fantasy", "idle"]
Return only the JSON array, no markdown, no explanation.`;

const SYSTEM_PROMPT_ATTRIBUTES = `\
You are a creative asset analyzer. Given a file name, return ONLY a JSON object of variant attributes.
Schema: { "view"?: string, "expression"?: string, "action"?: string }
Return only the JSON object, no markdown, no explanation.`;

// Local message type mirrors ChatMessage from @neko/platform without introducing
// a cross-extension dependency. The neko.agent.internalChat command accepts any
// structurally-compatible message shape via VSCode's dynamically-typed command API.
type InternalMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; [k: string]: unknown }>;
};

export class LLMClassifier implements IAssetClassifier {
  constructor(private readonly fallback: IAssetClassifier) {}

  async analyze(filePath: string, _options?: ClassifierOptions): Promise<ClassificationResult> {
    try {
      const result = await this.callLLMForClassification(filePath);
      if (result) return result;
    } catch (err) {
      logger.debug('LLM classification failed, falling back:', err);
    }
    return this.fallback.analyze(filePath, _options);
  }

  async suggestVariantAttributes(_entityId: string, filePath: string): Promise<VariantAttributes> {
    try {
      const fileName = path.basename(filePath);
      const content = await this.internalChat(
        [
          { role: 'system', content: SYSTEM_PROMPT_ATTRIBUTES },
          { role: 'user', content: `File: ${fileName}` },
        ],
        { maxTokens: 200 },
      );
      if (content) {
        const parsed: unknown = JSON.parse(this.stripJsonFences(content));
        if (!isVariantAttributesShape(parsed)) {
          throw new Error('Invalid variant attributes response');
        }
        return parsed as VariantAttributes;
      }
    } catch (err) {
      logger.debug('LLM suggestVariantAttributes failed, falling back:', err);
    }
    return this.fallback.suggestVariantAttributes(_entityId, filePath);
  }

  async suggestTags(filePath: string): Promise<string[]> {
    try {
      const fileName = path.basename(filePath);
      const content = await this.internalChat(
        [
          { role: 'system', content: SYSTEM_PROMPT_TAGS },
          { role: 'user', content: `File: ${fileName}` },
        ],
        { maxTokens: 200 },
      );
      if (content) {
        const parsed: unknown = JSON.parse(this.stripJsonFences(content));
        if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
          throw new Error('Invalid tags response');
        }
        return parsed;
      }
    } catch (err) {
      logger.debug('LLM suggestTags failed, falling back:', err);
    }
    return this.fallback.suggestTags(filePath);
  }

  async findSimilarEntities(
    _filePath: string,
    _options?: ClassifierOptions,
  ): Promise<SuggestedEntity[]> {
    // Vector/semantic search is out of scope
    return [];
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private async callLLMForClassification(filePath: string): Promise<ClassificationResult | null> {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isImage = IMAGE_MIME_TYPES.has(ext);

    const userContent: Array<{ type: string; [k: string]: unknown }> = [];

    if (isImage) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_IMAGE_SIZE) {
          // Skip image loading for oversized files, fall through to text-only
          logger.debug(`Skipping image load for oversized file (${stat.size} bytes): ${fileName}`);
        } else {
          const buffer = await fs.readFile(filePath);
          const mimeType = IMAGE_MIME_TYPES.get(ext)!;
          const base64 = buffer.toString('base64');
          userContent.push({
            type: 'image',
            imageUrl: `data:${mimeType};base64,${base64}`,
            detail: 'low',
          });
        }
      } catch (err) {
        // Image read failed — fall back to text-only
        logger.debug('Image read failed, continuing text-only:', err);
      }
    }

    userContent.push({
      type: 'text',
      text: `Classify this asset file: ${fileName}`,
    });

    const content = await this.internalChat(
      [
        { role: 'system', content: SYSTEM_PROMPT_CLASSIFY },
        { role: 'user', content: userContent },
      ],
      { maxTokens: 800 },
    );

    if (!content) return null;

    const parsed: unknown = JSON.parse(this.stripJsonFences(content));
    if (!isValidClassifyResult(parsed)) return null; // triggers fallback

    return {
      suggestedCategory: parsed.category,
      confidence: parsed.confidence ?? 0.8,
      detectedAttributes: parsed.attributes ?? {},
      description: parsed.description,
      suggestedName: parsed.name,
      suggestedTags: parsed.tags ?? [],
    };
  }

  private async internalChat(
    messages: InternalMessage[],
    options?: { maxTokens?: number },
  ): Promise<string | null> {
    return vscode.commands.executeCommand<string | null>(
      'neko.agent.internalChat',
      messages,
      options,
    );
  }

  private stripJsonFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
  }
}
