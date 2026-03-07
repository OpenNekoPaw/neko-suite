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

// Image extensions that support vision analysis
const IMAGE_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg',
]);

const SYSTEM_PROMPT_CLASSIFY = `\
You are a creative asset classifier for a video/game production pipeline.
Analyze the provided file and return ONLY valid JSON with this exact schema:
{
  "category": "character"|"creature"|"object"|"vehicle"|"environment"|"effect"|"ui"|"audio",
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

type InternalMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string | Array<{ type: string; [k: string]: unknown }>;
};

export class LLMClassifier implements IAssetClassifier {
	constructor(private readonly fallback: IAssetClassifier) {}

	async analyze(
		filePath: string,
		_options?: ClassifierOptions,
	): Promise<ClassificationResult> {
		try {
			const result = await this.callLLMForClassification(filePath);
			if (result) return result;
		} catch {
			// Fall through to fallback
		}
		return this.fallback.analyze(filePath, _options);
	}

	async suggestVariantAttributes(
		_entityId: string,
		filePath: string,
	): Promise<VariantAttributes> {
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
				const parsed = JSON.parse(this.stripJsonFences(content)) as VariantAttributes;
				return parsed;
			}
		} catch {
			// Fall through
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
				const parsed = JSON.parse(this.stripJsonFences(content)) as string[];
				if (Array.isArray(parsed)) return parsed;
			}
		} catch {
			// Fall through
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

	private async callLLMForClassification(
		filePath: string,
	): Promise<ClassificationResult | null> {
		const fileName = path.basename(filePath);
		const ext = path.extname(filePath).toLowerCase();
		const isImage = IMAGE_EXTENSIONS.has(ext);

		const userContent: Array<{ type: string; [k: string]: unknown }> = [];

		if (isImage) {
			try {
				const buffer = await fs.readFile(filePath);
				const mimeType = this.getMimeType(ext);
				const base64 = buffer.toString('base64');
				userContent.push({
					type: 'image',
					imageUrl: `data:${mimeType};base64,${base64}`,
					detail: 'low',
				});
			} catch {
				// Image read failed — fall back to text-only
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

		const parsed = JSON.parse(this.stripJsonFences(content)) as {
			category: EntityCategory;
			name: string;
			description: string;
			tags: string[];
			attributes: Partial<VariantAttributes>;
			confidence: number;
		};

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
		return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
	}

	private getMimeType(ext: string): string {
		const map: Record<string, string> = {
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.bmp': 'image/bmp',
			'.tiff': 'image/tiff',
			'.tif': 'image/tiff',
			'.svg': 'image/svg+xml',
		};
		return map[ext] ?? 'image/png';
	}
}
