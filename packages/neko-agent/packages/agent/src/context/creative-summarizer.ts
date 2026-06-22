/**
 * Creative-Domain Summarizer
 *
 * Implements ISummarizer with priority-based layered summarisation
 * tailored for image/text/audio/video creative workflows.
 *
 * Strategy:
 *  1. Classify messages by CreativeInfoType (P1–P7)
 *  2. P1 user messages → preserved verbatim (never summarised)
 *  3. P2–P6 → each category gets its own summary with dedicated token budget
 *  4. P7 → discarded
 */

import type {
  ChatMessage,
  CreativeCompressionConfig,
  CreativeInfoType,
  CreativeSummaryBudget,
  ISummarizer,
  IMessageClassifier,
  IService,
  MessageClassification,
  SummarizationRequest,
  SummarizationResult,
} from '@neko/shared';
import { DEFAULT_CREATIVE_COMPRESSION_CONFIG } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('CreativeSummarizer');

/** Simple token estimator (1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Creative-domain summariser configuration
 */
export interface CreativeSummarizerConfig {
  /** LLM provider override for summarisation calls */
  provider?: string;
  /** LLM model override for summarisation calls */
  model?: string;
  /** Temperature for summarisation (lower = more factual) */
  temperature: number;
  /** Maximum retries on LLM failure */
  maxRetries: number;
}

const DEFAULT_SUMMARIZER_CFG: CreativeSummarizerConfig = {
  temperature: 0.3,
  maxRetries: 2,
};

/**
 * Category-specific system prompts for layered summarisation
 */
const CATEGORY_PROMPTS: Record<string, string> = {
  creative_decision: `You are summarising creative direction decisions from a design conversation.
Extract and preserve:
- Confirmed style, tone, color palette, composition choices
- Character designs, narrative structure, music style decisions
- Any constraints or rules the user established
Output as a compact bullet list. Keep exact quoted terms.`,

  version_anchor: `You are summarising version checkpoints from a creative iteration.
Extract and preserve:
- Which versions the user approved ("looks good", "keep this")
- Key parameters of approved versions (model, seed, prompt, settings)
- User satisfaction signals and their context
Output as a numbered version list with approval status.`,

  iteration_chain: `You are summarising a creative iteration chain.
Extract and preserve:
- The progression: initial prompt → adjustments → results
- Parameter changes between iterations (model, seed, CFG, sampler, etc.)
- User feedback at each step and resulting modifications
Output as a chronological chain showing evolution.`,

  asset_state: `You are summarising asset/canvas/timeline state changes.
Extract and preserve:
- Layer additions, removals, reorderings
- Timeline edits (clip moves, transitions, cuts)
- Canvas transformations (resize, crop, composition changes)
Output as a structural diff showing current state.`,

  aesthetic_pref: `You are summarising aesthetic preferences accumulated during a creative session.
Extract and preserve:
- What the user liked (accepted) and disliked (rejected)
- Specific adjustments requested (brighter, warmer, more contrast, etc.)
- Implicit style preferences derived from accept/reject patterns
Output as a preference profile with accept/reject categories.`,
};

/**
 * Extract text content from a ChatMessage
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
 * Group classified messages by their info type
 */
function groupByType(classified: MessageClassification[]): Map<CreativeInfoType, ChatMessage[]> {
  const groups = new Map<CreativeInfoType, ChatMessage[]>();
  for (const item of classified) {
    const existing = groups.get(item.infoType);
    if (existing) {
      existing.push(item.message);
    } else {
      groups.set(item.infoType, [item.message]);
    }
  }
  return groups;
}

/**
 * Budget key mapping from CreativeInfoType to CreativeSummaryBudget field
 */
const BUDGET_KEY_MAP: Partial<Record<CreativeInfoType, keyof CreativeSummaryBudget>> = {
  creative_decision: 'creativeDecisions',
  version_anchor: 'versionAnchors',
  iteration_chain: 'iterationChains',
  asset_state: 'assetStates',
  aesthetic_pref: 'aestheticPrefs',
};

interface CreativeCategorySummary {
  text: string;
  keyPoints: string[];
  entities: string[];
  source: 'llm' | 'fallback';
  degraded: boolean;
}

/**
 * Creative-domain summariser.
 * Classifies messages, then summarises each category independently.
 */
export class CreativeSummarizer implements ISummarizer {
  private service?: IService;
  private classifier: IMessageClassifier;
  private creativeConfig: CreativeCompressionConfig;
  private summarizerConfig: CreativeSummarizerConfig;

  constructor(
    classifier: IMessageClassifier,
    options?: {
      service?: IService;
      creativeConfig?: Partial<CreativeCompressionConfig>;
      summarizerConfig?: Partial<CreativeSummarizerConfig>;
    },
  ) {
    this.classifier = classifier;
    this.service = options?.service;
    this.creativeConfig = {
      ...DEFAULT_CREATIVE_COMPRESSION_CONFIG,
      ...options?.creativeConfig,
    };
    this.summarizerConfig = {
      ...DEFAULT_SUMMARIZER_CFG,
      ...options?.summarizerConfig,
    };
  }

  /**
   * Set the LLM service (can be injected after construction)
   */
  setService(service: IService): void {
    this.service = service;
  }

  /**
   * Main summarisation entry point (ISummarizer interface)
   */
  async summarize(request: SummarizationRequest): Promise<SummarizationResult> {
    const { messages, maxTokens } = request;

    // Step 1: classify
    const classified = this.classifier.classify(messages);
    const groups = groupByType(classified);

    // Step 2: collect user messages verbatim (P1)
    const userMessages = groups.get('user_message') ?? [];
    const userTexts = userMessages.map((m) => `[User]: ${extractText(m)}`);
    const userSection = userTexts.join('\n');
    const userTokens = estimateTokens(userSection);

    // Step 3: compute remaining budget for P2–P6 categories
    const remainingBudget = Math.max(0, maxTokens - userTokens);
    const totalConfigBudget = Object.values(this.creativeConfig.summaryBudget).reduce(
      (a, b) => a + b,
      0,
    );
    // Scale budgets proportionally if remaining budget is smaller than configured total
    const budgetScale =
      totalConfigBudget > 0 ? Math.min(1, remainingBudget / totalConfigBudget) : 0;

    // Step 4: summarise each category
    const categorySummaries: CreativeCategorySummary[] = [];
    const allKeyPoints: string[] = [];
    const allEntities: string[] = [];

    const categoriesToProcess: CreativeInfoType[] = [
      'creative_decision',
      'version_anchor',
      'iteration_chain',
      'asset_state',
      'aesthetic_pref',
    ];

    for (const category of categoriesToProcess) {
      const categoryMessages = groups.get(category);
      if (!categoryMessages || categoryMessages.length === 0) continue;

      const budgetKey = BUDGET_KEY_MAP[category];
      if (!budgetKey) continue;

      const categoryBudget = Math.floor(this.creativeConfig.summaryBudget[budgetKey] * budgetScale);
      if (categoryBudget <= 0) continue;

      const summary = await this.summarizeCategory(category, categoryMessages, categoryBudget);
      if (summary) {
        categorySummaries.push(summary);
        allKeyPoints.push(...summary.keyPoints);
        allEntities.push(...summary.entities);
      }
    }

    // Step 5: assemble final summary
    const parts: string[] = [];

    if (userSection.length > 0) {
      parts.push('## User Messages (verbatim)\n' + userSection);
    }

    for (const summary of categorySummaries) {
      parts.push(summary.text);
    }

    const fullSummary = parts.join('\n\n');
    const hasDegradedCategory = categorySummaries.some((summary) => summary.degraded);
    const hasLlmCategory = categorySummaries.some((summary) => summary.source === 'llm');
    const summarySource: SummarizationResult['source'] = hasDegradedCategory
      ? 'fallback'
      : hasLlmCategory
        ? 'llm'
        : undefined;

    return {
      summary: fullSummary,
      ...(summarySource
        ? {
            source: summarySource,
            degraded: summarySource === 'fallback',
          }
        : {}),
      tokenCount: estimateTokens(fullSummary),
      keyPoints: allKeyPoints,
      entities: [...new Set(allEntities)],
    };
  }

  /**
   * Summarise a single category of messages
   */
  private async summarizeCategory(
    category: CreativeInfoType,
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<CreativeCategorySummary | null> {
    const categoryLabel = category.replace(/_/g, ' ');
    const header = `## ${categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1)}`;

    // Format messages for the LLM
    const conversationText = messages.map((m) => `[${m.role}]: ${extractText(m)}`).join('\n\n');

    // Try LLM summarisation
    if (this.service) {
      const systemPrompt =
        CATEGORY_PROMPTS[category] ?? `Summarise the following conversation messages concisely.`;

      const userPrompt = [
        `Target length: ~${maxTokens} tokens (${maxTokens * 4} characters).`,
        '',
        'Conversation:',
        '---',
        conversationText,
        '---',
        '',
        'Include a "Key Points:" section at the end.',
      ].join('\n');

      for (let attempt = 0; attempt <= this.summarizerConfig.maxRetries; attempt++) {
        try {
          const response = await this.service.chat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            {
              temperature: this.summarizerConfig.temperature,
              maxTokens: maxTokens + 200,
              providerId: this.summarizerConfig.provider,
              modelId: this.summarizerConfig.model,
            },
          );

          const content =
            typeof response.message.content === 'string' ? response.message.content : '';

          const { keyPoints, entities } = this.extractStructured(content);

          // Truncate if needed
          let text = content;
          if (estimateTokens(text) > maxTokens) {
            text = text.substring(0, maxTokens * 4) + '...';
          }

          return {
            text: `${header}\n${text}`,
            keyPoints,
            entities,
            source: 'llm',
            degraded: false,
          };
        } catch (error) {
          logger.warn(`Category summarisation failed for ${category}`, {
            attempt: attempt + 1,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Fallback: truncated raw messages
    return this.createFallbackCategorySummary(header, messages, maxTokens);
  }

  /**
   * Extract key points and entities from LLM output
   */
  private extractStructured(content: string): { keyPoints: string[]; entities: string[] } {
    const keyPoints: string[] = [];
    const entities: string[] = [];

    const kpMatch = content.match(/Key Points?:?\s*([\s\S]*?)(?=Entities?:|$)/i);
    if (kpMatch) {
      const points = kpMatch[1].match(/[-•*]\s*(.+)/g);
      if (points) {
        keyPoints.push(...points.map((p) => p.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    const entMatch = content.match(/Entities?:?\s*([\s\S]*?)$/i);
    if (entMatch) {
      const items = entMatch[1].match(/[-•*]\s*(.+)/g);
      if (items) {
        entities.push(...items.map((e) => e.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    return { keyPoints, entities };
  }

  /**
   * Fallback category summary without LLM
   */
  private createFallbackCategorySummary(
    header: string,
    messages: ChatMessage[],
    maxTokens: number,
  ): CreativeCategorySummary {
    const parts: string[] = [];
    let tokens = 0;

    for (const msg of messages) {
      const text = extractText(msg);
      const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
      const line = `- [${msg.role}]: ${preview}`;
      const lineTokens = estimateTokens(line);

      if (tokens + lineTokens > maxTokens) break;

      parts.push(line);
      tokens += lineTokens;
    }

    return {
      text: `${header}\n${parts.join('\n')}`,
      keyPoints: [],
      entities: [],
      source: 'fallback',
      degraded: true,
    };
  }
}

/**
 * Factory function
 */
export function createCreativeSummarizer(
  classifier: IMessageClassifier,
  options?: {
    service?: IService;
    creativeConfig?: Partial<CreativeCompressionConfig>;
    summarizerConfig?: Partial<CreativeSummarizerConfig>;
  },
): ISummarizer {
  return new CreativeSummarizer(classifier, options);
}
