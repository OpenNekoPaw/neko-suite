/**
 * Rule-based Classifier
 *
 * Simple classifier based on file names and patterns.
 * Used as fallback when AI classifier is not available.
 */

import type {
	ClassificationResult,
	SuggestedEntity,
	VariantAttributes,
	EntityCategory,
	ViewAngle,
	ExpressionState,
	ActionState,
	ClassifierOptions,
} from '@neko/shared';
import type { IAssetClassifier } from './IClassifier';

/**
 * Rule-based classifier implementation
 */
export class RuleClassifier implements IAssetClassifier {
	/**
	 * Analyze a file based on naming patterns
	 */
	async analyze(
		filePath: string,
		_options?: ClassifierOptions
	): Promise<ClassificationResult> {
		const fileName = this.extractFileName(filePath).toLowerCase();
		const category = this.detectCategory(fileName);
		const attributes = this.detectAttributes(fileName);
		const suggestedName = this.suggestName(filePath);

		return {
			suggestedCategory: category,
			confidence: 0.5, // Rule-based is less confident
			detectedAttributes: attributes,
			description: this.generateDescription(suggestedName, category, attributes),
			suggestedName,
			suggestedTags: this.extractTags(fileName),
		};
	}

	/**
	 * Suggest variant attributes based on file name
	 */
	async suggestVariantAttributes(
		_entityId: string,
		filePath: string
	): Promise<VariantAttributes> {
		const fileName = this.extractFileName(filePath).toLowerCase();
		return this.detectAttributes(fileName);
	}

	/**
	 * Suggest tags based on file name
	 */
	async suggestTags(filePath: string): Promise<string[]> {
		const fileName = this.extractFileName(filePath).toLowerCase();
		return this.extractTags(fileName);
	}

	/**
	 * Find similar entities (not supported in rule-based)
	 */
	async findSimilarEntities(
		_filePath: string,
		_options?: ClassifierOptions
	): Promise<SuggestedEntity[]> {
		// Rule-based classifier cannot find similar entities
		return [];
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	private extractFileName(filePath: string): string {
		const parts = filePath.split(/[/\\]/);
		return parts[parts.length - 1] ?? filePath;
	}

	private suggestName(filePath: string): string {
		const fileName = this.extractFileName(filePath);
		// Remove extension and common suffixes
		return fileName
			.replace(/\.[^.]+$/, '')
			.replace(/[-_](front|back|side|left|right|top|bottom)/gi, '')
			.replace(/[-_](idle|walk|run|jump|attack)/gi, '')
			.replace(/[-_](happy|sad|angry|neutral)/gi, '')
			.replace(/[-_]\d+$/, '')
			.replace(/[-_]/g, ' ')
			.trim();
	}

	private detectCategory(fileName: string): EntityCategory {
		// Character patterns
		if (
			/character|person|avatar|human|man|woman|boy|girl|face/i.test(fileName)
		) {
			return 'character';
		}

		// Creature patterns
		if (/animal|creature|monster|pet|dog|cat|bird/i.test(fileName)) {
			return 'creature';
		}

		// Vehicle patterns
		if (/car|vehicle|truck|bike|plane|ship|boat/i.test(fileName)) {
			return 'vehicle';
		}

		// Environment patterns
		if (
			/background|scene|environment|landscape|sky|ground|floor|wall/i.test(
				fileName
			)
		) {
			return 'environment';
		}

		// Effect patterns
		if (/effect|particle|fx|explosion|fire|smoke|magic/i.test(fileName)) {
			return 'effect';
		}

		// UI patterns
		if (/ui|icon|button|menu|hud|interface/i.test(fileName)) {
			return 'ui';
		}

		// Audio patterns (based on extension)
		if (/\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(fileName)) {
			return 'audio';
		}

		// Text patterns (based on extension and keywords)
		if (/\.(txt|md|json|yaml|yml|csv)$/i.test(fileName) ||
		    /description|bio|profile|script|dialogue|note/i.test(fileName)) {
			// Determine category based on content keywords
			if (/character|person|avatar|bio|profile/i.test(fileName)) {
				return 'character';
			}
			if (/creature|animal|monster/i.test(fileName)) {
				return 'creature';
			}
			if (/object|item|prop/i.test(fileName)) {
				return 'object';
			}
			if (/vehicle/i.test(fileName)) {
				return 'vehicle';
			}
			if (/environment|scene|location/i.test(fileName)) {
				return 'environment';
			}
			if (/effect/i.test(fileName)) {
				return 'effect';
			}
			if (/ui|interface/i.test(fileName)) {
				return 'ui';
			}
			if (/audio|sound|voice|music/i.test(fileName)) {
				return 'audio';
			}
		}

		// Default to object
		return 'object';
	}

	private detectAttributes(fileName: string): Partial<VariantAttributes> {
		const attrs: Partial<VariantAttributes> = {};

		// Detect view angle
		const viewPatterns: Record<string, ViewAngle> = {
			front: 'front',
			back: 'back',
			left: 'left',
			right: 'right',
			side: 'left',
			top: 'top',
			bottom: 'bottom',
			iso: 'isometric',
			isometric: 'isometric',
			'3-4': '3/4',
			'three-quarter': '3/4',
		};

		for (const [pattern, view] of Object.entries(viewPatterns)) {
			if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
				attrs.view = view;
				break;
			}
		}

		// Detect expression
		const expressionPatterns: Record<string, ExpressionState> = {
			happy: 'happy',
			smile: 'happy',
			sad: 'sad',
			angry: 'angry',
			surprised: 'surprised',
			talk: 'talking',
			speaking: 'talking',
			sleep: 'sleeping',
			neutral: 'neutral',
			normal: 'neutral',
		};

		for (const [pattern, expression] of Object.entries(expressionPatterns)) {
			if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
				attrs.expression = expression;
				break;
			}
		}

		// Detect action
		const actionPatterns: Record<string, ActionState> = {
			idle: 'idle',
			stand: 'idle',
			walk: 'walk',
			walking: 'walk',
			run: 'run',
			running: 'run',
			jump: 'jump',
			jumping: 'jump',
			attack: 'attack',
			sit: 'sit',
			sitting: 'sit',
			lie: 'lie',
			lying: 'lie',
		};

		for (const [pattern, action] of Object.entries(actionPatterns)) {
			if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
				attrs.action = action;
				break;
			}
		}

		return attrs;
	}

	private extractTags(fileName: string): string[] {
		const tags: string[] = [];

		// Extract meaningful words from file name
		const words = fileName
			.replace(/\.[^.]+$/, '') // Remove extension
			.split(/[-_\s]+/)
			.filter((w) => w.length > 2);

		// Add category-related tags
		const categoryKeywords = [
			'character',
			'person',
			'object',
			'item',
			'prop',
			'background',
			'scene',
			'effect',
			'particle',
			'ui',
			'icon',
			'animal',
			'creature',
			'vehicle',
		];

		for (const word of words) {
			if (categoryKeywords.includes(word.toLowerCase())) {
				tags.push(word.toLowerCase());
			}
		}

		// Add style-related tags
		const styleKeywords = [
			'pixel',
			'cartoon',
			'anime',
			'realistic',
			'stylized',
			'2d',
			'3d',
			'flat',
			'sketch',
		];

		for (const keyword of styleKeywords) {
			if (fileName.includes(keyword)) {
				tags.push(keyword);
			}
		}

		return [...new Set(tags)]; // Deduplicate
	}

	/**
	 * Generate a human-readable description
	 */
	private generateDescription(
		name: string,
		category: EntityCategory,
		attributes: Partial<VariantAttributes>
	): string {
		const parts: string[] = [];

		// Category description
		const categoryNames: Record<EntityCategory, string> = {
			character: 'Character asset',
			creature: 'Creature asset',
			object: 'Object asset',
			vehicle: 'Vehicle asset',
			environment: 'Environment asset',
			effect: 'Visual effect',
			ui: 'UI element',
			audio: 'Audio asset',
		};
		parts.push(categoryNames[category] || 'Asset');

		// Add name
		if (name) {
			parts.push(`"${name}"`);
		}

		// Add attribute details
		const attrDetails: string[] = [];
		if (attributes.view) {
			attrDetails.push(`${attributes.view} view`);
		}
		if (attributes.expression) {
			attrDetails.push(`${attributes.expression} expression`);
		}
		if (attributes.action) {
			attrDetails.push(`${attributes.action} action`);
		}

		if (attrDetails.length > 0) {
			parts.push(`with ${attrDetails.join(', ')}`);
		}

		return parts.join(' ');
	}
}
