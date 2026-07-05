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

type CreativeSummarizerLocale = 'en' | 'zh';

const DEFAULT_SUMMARIZER_CFG: CreativeSummarizerConfig = {
  temperature: 0.3,
  maxRetries: 2,
};

/**
 * Category-specific system prompts for layered summarisation
 */
const CATEGORY_PROMPTS: Record<CreativeInfoType, string> = {
  user_message: '',
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
  other: '',
};

const CATEGORY_PROMPTS_ZH: Record<CreativeInfoType, string> = {
  user_message: '',
  creative_decision: `你正在总结设计对话中的创作方向决策。
请提取并保留：
- 已确认的风格、基调、色彩 palette、构图选择
- 角色设计、叙事结构、音乐风格决策
- 用户建立的任何约束或规则
输出紧凑的项目符号列表。保留用户的精确引用词。`,

  version_anchor: `你正在总结创作迭代中的版本检查点。
请提取并保留：
- 用户批准了哪些版本（例如“不错”“保留这个”）
- 已批准版本的关键参数（model、seed、prompt、settings）
- 用户满意信号及其上下文
输出带批准状态的编号版本列表。`,

  iteration_chain: `你正在总结创作迭代链路。
请提取并保留：
- 进展过程：初始提示词 → 调整 → 结果
- 迭代之间的参数变化（model、seed、CFG、sampler 等）
- 每一步的用户反馈和对应修改
按时间顺序输出演化链。`,

  asset_state: `你正在总结 asset/canvas/timeline 的状态变化。
请提取并保留：
- 图层新增、删除、重排
- 时间线编辑（clip 移动、转场、剪切）
- 画布变换（resize、crop、composition changes）
输出结构化 diff，说明当前状态。`,

  aesthetic_pref: `你正在总结创作会话中累积的审美偏好。
请提取并保留：
- 用户喜欢（接受）和不喜欢（拒绝）的内容
- 用户要求的具体调整（更亮、更暖、更多对比等）
- 从接受/拒绝模式推导出的隐含风格偏好
输出带接受/拒绝分类的偏好档案。`,
  other: '',
};

const CATEGORY_LABELS_ZH: Partial<Record<CreativeInfoType, string>> = {
  creative_decision: '创作方向决策',
  version_anchor: '版本检查点',
  iteration_chain: '迭代链路',
  asset_state: '资源状态',
  aesthetic_pref: '审美偏好',
};

const ROLE_LABELS_ZH: Partial<Record<ChatMessage['role'], string>> = {
  system: '系统',
  user: '用户',
  assistant: '助手',
  tool: '工具',
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
  private locale: CreativeSummarizerLocale;

  constructor(
    classifier: IMessageClassifier,
    options?: {
      service?: IService;
      creativeConfig?: Partial<CreativeCompressionConfig>;
      summarizerConfig?: Partial<CreativeSummarizerConfig>;
      locale?: string;
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
    this.locale = normalizeCreativeSummarizerLocale(options?.locale);
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
    const locale = normalizeCreativeSummarizerLocale(request.locale ?? this.locale);
    const roleLabels = getRoleLabels(locale);

    // Step 1: classify
    const classified = this.classifier.classify(messages);
    const groups = groupByType(classified);

    // Step 2: collect user messages verbatim (P1)
    const userMessages = groups.get('user_message') ?? [];
    const userTexts = userMessages.map((m) => `[${roleLabels.user}]: ${extractText(m)}`);
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

      const summary = await this.summarizeCategory(
        category,
        categoryMessages,
        categoryBudget,
        locale,
      );
      if (summary) {
        categorySummaries.push(summary);
        allKeyPoints.push(...summary.keyPoints);
        allEntities.push(...summary.entities);
      }
    }

    // Step 5: assemble final summary
    const parts: string[] = [];

    if (userSection.length > 0) {
      parts.push(
        (locale === 'zh' ? '## 用户消息（原文保留）' : '## User Messages (verbatim)') +
          '\n' +
          userSection,
      );
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
    locale: CreativeSummarizerLocale,
  ): Promise<CreativeCategorySummary | null> {
    const header = formatCreativeSummaryHeader(category, locale);
    const roleLabels = getRoleLabels(locale);

    // Format messages for the LLM
    const conversationText = messages
      .map((m) => `[${roleLabels[m.role] ?? m.role}]: ${extractText(m)}`)
      .join('\n\n');

    // Try LLM summarisation
    if (this.service) {
      const systemPrompt =
        getCreativeCategoryPrompt(category, locale) ??
        (locale === 'zh'
          ? '请简洁总结以下对话消息。'
          : 'Summarise the following conversation messages concisely.');

      const userPrompt = formatCreativeSummarizerUserPrompt(
        conversationText,
        maxTokens,
        locale,
      );

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
    return this.createFallbackCategorySummary(header, messages, maxTokens, locale);
  }

  /**
   * Extract key points and entities from LLM output
   */
  private extractStructured(content: string): { keyPoints: string[]; entities: string[] } {
    const keyPoints: string[] = [];
    const entities: string[] = [];

    const kpMatch = content.match(
      /(?:Key Points?|关键点)[:：]?\s*([\s\S]*?)(?=Entities?:|实体[:：]?|$)/i,
    );
    if (kpMatch) {
      const points = kpMatch[1].match(/[-•*]\s*(.+)/g);
      if (points) {
        keyPoints.push(...points.map((p) => p.replace(/^[-•*]\s*/, '').trim()));
      }
    }

    const entMatch = content.match(/(?:Entities?|实体)[:：]?\s*([\s\S]*?)$/i);
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
    locale: CreativeSummarizerLocale,
  ): CreativeCategorySummary {
    const parts: string[] = [];
    let tokens = 0;
    const roleLabels = getRoleLabels(locale);

    for (const msg of messages) {
      const text = extractText(msg);
      const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
      const line = `- [${roleLabels[msg.role] ?? msg.role}]: ${preview}`;
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

function normalizeCreativeSummarizerLocale(locale: string | undefined): CreativeSummarizerLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function getCreativeCategoryPrompt(
  category: CreativeInfoType,
  locale: CreativeSummarizerLocale,
): string | undefined {
  const prompt = locale === 'zh' ? CATEGORY_PROMPTS_ZH[category] : CATEGORY_PROMPTS[category];
  return prompt.trim().length > 0 ? prompt : undefined;
}

function formatCreativeSummaryHeader(
  category: CreativeInfoType,
  locale: CreativeSummarizerLocale,
): string {
  if (locale === 'zh') {
    return `## ${CATEGORY_LABELS_ZH[category] ?? category}`;
  }
  const categoryLabel = category.replace(/_/g, ' ');
  return `## ${categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1)}`;
}

function getRoleLabels(locale: CreativeSummarizerLocale): Record<ChatMessage['role'], string> {
  if (locale === 'zh') {
    return {
      system: ROLE_LABELS_ZH.system ?? 'system',
      user: ROLE_LABELS_ZH.user ?? 'user',
      assistant: ROLE_LABELS_ZH.assistant ?? 'assistant',
      tool: ROLE_LABELS_ZH.tool ?? 'tool',
    };
  }
  return {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
    tool: 'tool',
  };
}

function formatCreativeSummarizerUserPrompt(
  conversationText: string,
  maxTokens: number,
  locale: CreativeSummarizerLocale,
): string {
  if (locale === 'zh') {
    return [
      `目标长度：约 ${maxTokens} tokens（${maxTokens * 4} 字符）。`,
      '',
      '对话：',
      '---',
      conversationText,
      '---',
      '',
      '在末尾包含“关键点：”小节。',
    ].join('\n');
  }

  return [
    `Target length: ~${maxTokens} tokens (${maxTokens * 4} characters).`,
    '',
    'Conversation:',
    '---',
    conversationText,
    '---',
    '',
    'Include a "Key Points:" section at the end.',
  ].join('\n');
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
    locale?: string;
  },
): ISummarizer {
  return new CreativeSummarizer(classifier, options);
}
