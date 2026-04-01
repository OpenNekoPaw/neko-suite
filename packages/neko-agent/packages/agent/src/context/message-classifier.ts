/**
 * Message Classifier for Creative-Domain Context Compression
 *
 * Classifies conversation messages by creative information type
 * using keyword matching, role detection, and tool call analysis.
 */

import type {
  ChatMessage,
  CreativeCompressionConfig,
  CreativeInfoType,
  IMessageClassifier,
  MessageClassification,
} from '@neko/shared';
import { DEFAULT_CREATIVE_COMPRESSION_CONFIG } from '@neko/shared';

/** Priority mapping for each info type */
const PRIORITY_MAP: Record<CreativeInfoType, number> = {
  user_message: 1,
  creative_decision: 2,
  version_anchor: 3,
  iteration_chain: 4,
  asset_state: 5,
  aesthetic_pref: 6,
  other: 7,
};

/** Retention hint for each info type */
const RETENTION_MAP: Record<CreativeInfoType, 'keep' | 'summarize' | 'discard'> = {
  user_message: 'keep',
  creative_decision: 'keep',
  version_anchor: 'keep',
  iteration_chain: 'summarize',
  asset_state: 'summarize',
  aesthetic_pref: 'summarize',
  other: 'discard',
};

/** Tool names that indicate generation pipeline calls */
const GENERATION_TOOL_PATTERNS = [
  'generate',
  'render',
  'export',
  'compose',
  'synthesize',
  'create_image',
  'create_video',
  'create_audio',
  'text_to_',
  'img2img',
  'inpaint',
  'upscale',
  'denoise',
];

/** Tool names that indicate asset state operations */
const ASSET_TOOL_PATTERNS = [
  'layer',
  'timeline',
  'canvas',
  'track',
  'keyframe',
  'transform',
  'resize',
  'crop',
  'merge',
  'split',
  'move',
  'reorder',
];

/**
 * Extract text content from a ChatMessage for keyword matching
 */
function extractText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map((part) => ('text' in part ? part.text : ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * Check if text contains any keyword from the list (case-insensitive)
 */
function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if any tool call name matches patterns
 */
function matchesToolPatterns(message: ChatMessage, patterns: string[]): boolean {
  if (!message.toolCalls) return false;
  return message.toolCalls.some((call) => {
    const name = call.function.name.toLowerCase();
    return patterns.some((p) => name.includes(p));
  });
}

/**
 * Rule-based message classifier for creative workflows.
 *
 * Classification precedence (first match wins):
 * 1. role === 'user'             → user_message (P1)
 * 2. creative decision keywords  → creative_decision (P2)
 * 3. version anchor keywords     → version_anchor (P3)
 * 4. generation tool calls       → iteration_chain (P4)
 * 5. asset operation tool calls  → asset_state (P5)
 * 6. aesthetic pref keywords     → aesthetic_pref (P6)
 * 7. fallback                    → other (P7)
 */
export class MessageClassifier implements IMessageClassifier {
  private config: CreativeCompressionConfig;

  constructor(config?: Partial<CreativeCompressionConfig>) {
    this.config = { ...DEFAULT_CREATIVE_COMPRESSION_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  configure(config: Partial<CreativeCompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Classify an array of messages
   */
  classify(messages: ChatMessage[]): MessageClassification[] {
    return messages.map((message) => this.classifyOne(message));
  }

  /**
   * Classify a single message
   */
  private classifyOne(message: ChatMessage): MessageClassification {
    const infoType = this.detectInfoType(message);
    return {
      message,
      infoType,
      priority: PRIORITY_MAP[infoType],
      retentionHint: RETENTION_MAP[infoType],
    };
  }

  /**
   * Detect the creative info type of a message
   */
  private detectInfoType(message: ChatMessage): CreativeInfoType {
    // P1: All user messages
    if (message.role === 'user') {
      return 'user_message';
    }

    const text = extractText(message);

    // P2: Creative direction decisions (check assistant responses for decisions)
    if (
      message.role === 'assistant' &&
      containsKeyword(text, this.config.creativeDecisionKeywords)
    ) {
      return 'creative_decision';
    }

    // P3: Version anchors — typically in tool results or assistant confirmations
    if (containsKeyword(text, this.config.versionAnchorKeywords)) {
      return 'version_anchor';
    }

    // P4: Generation pipeline tool calls
    if (message.role === 'assistant' && matchesToolPatterns(message, GENERATION_TOOL_PATTERNS)) {
      return 'iteration_chain';
    }

    // P4: Tool results from generation calls
    if (message.role === 'tool' && this.looksLikeGenerationResult(text)) {
      return 'iteration_chain';
    }

    // P5: Asset state operation tool calls
    if (message.role === 'assistant' && matchesToolPatterns(message, ASSET_TOOL_PATTERNS)) {
      return 'asset_state';
    }

    // P5: Tool results from asset operations
    if (message.role === 'tool' && this.looksLikeAssetResult(text)) {
      return 'asset_state';
    }

    // P6: Aesthetic preference signals (in assistant responses)
    if (message.role === 'assistant' && containsKeyword(text, this.config.aestheticPrefKeywords)) {
      return 'aesthetic_pref';
    }

    // P7: Everything else
    return 'other';
  }

  /**
   * Heuristic: does this tool result look like a generation output?
   */
  private looksLikeGenerationResult(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('"model"') ||
      lower.includes('"prompt"') ||
      lower.includes('"seed"') ||
      lower.includes('"cfg') ||
      lower.includes('"sampler"') ||
      lower.includes('generated') ||
      lower.includes('rendered')
    );
  }

  /**
   * Heuristic: does this tool result look like an asset operation?
   */
  private looksLikeAssetResult(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('"layer') ||
      lower.includes('"track') ||
      lower.includes('"timeline') ||
      lower.includes('"canvas') ||
      lower.includes('"keyframe')
    );
  }
}

/**
 * Factory function
 */
export function createMessageClassifier(
  config?: Partial<CreativeCompressionConfig>,
): IMessageClassifier {
  return new MessageClassifier(config);
}
