/**
 * Validation Hooks
 *
 * ExecutorHooks implementation for validating LLM input and output
 *
 * Features:
 * - Input validation: Image size, format, dimensions
 * - Output validation: Mermaid syntax, JSON Schema
 * - Configurable constraints and error handling
 */

import type {
  ExecutorHooks,
  AgentContext,
  AgentStep,
  ChatMessage,
  ContentPart,
} from '@neko/shared';
import { STORYBOARD_CREATIVE_TABLE_PROFILE } from '@neko/shared';
import { AgentError } from '../errors';
import { ImageValidator, ImageValidationError } from './image-validator';
import { OutputValidator } from './output-validator';
import type {
  ValidationHooksOptions,
  ValidationError,
  ValidationWarning,
  ImageConstraints,
  OutputConstraints,
  MermaidBlockValidationResult,
  JsonBlockValidationResult,
} from './types';
import { queueOutputValidationRepairRequest } from './output-validation-repair-request';
import { normalizeAgentRuntimePromptLocale } from '../runtime/attachment-projection';
import {
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  validateStoryboardCreativeTableOutput,
} from './creative-table-validator';
import { resolveStoryboardCreativeTableHeader } from '@neko-agent/types';

/**
 * ValidationHooks - Validates LLM input and output
 *
 * Implements beforeThink for input validation and afterThink for output validation
 *
 * @example
 * ```typescript
 * const hooks = createValidationHooks({
 *   imageConstraints: {
 *     maxSizeBytes: 5 * 1024 * 1024,
 *     allowedFormats: ['image/jpeg', 'image/png'],
 *   },
 *   outputConstraints: {
 *     mermaidPreValidate: true,
 *     onValidationFail: 'warn',
 *   },
 *   onValidationWarning: (warning) => console.warn(warning.message),
 * });
 * ```
 */
export class ValidationHooks implements ExecutorHooks {
  readonly name = 'validation';

  private readonly imageValidator: ImageValidator;
  private readonly outputValidator: OutputValidator;
  private readonly options: ValidationHooksOptions;

  constructor(options: ValidationHooksOptions = {}) {
    this.options = options;
    this.imageValidator = new ImageValidator(options.imageConstraints);
    this.outputValidator = new OutputValidator(options.outputConstraints);
  }

  /**
   * beforeThink: Validate input messages before sending to LLM
   *
   * Validates:
   * - Image content parts (size, format)
   *
   * @throws AgentError if validation fails
   */
  async beforeThink(context: AgentContext): Promise<AgentContext> {
    try {
      const validatedMessages = await Promise.all(
        context.messages.map((msg) => this.validateMessage(msg)),
      );
      return { ...context, messages: validatedMessages };
    } catch (error) {
      if (error instanceof ImageValidationError) {
        // Convert to ValidationError and call callback
        this.options.onValidationError?.(error.toValidationError());

        // Re-throw as AgentError
        throw new AgentError({
          category: 'validation',
          code: error.code,
          message: error.message,
          retryable: false,
          context: error.details,
        });
      }
      throw error;
    }
  }

  /**
   * afterThink: Validate LLM output after receiving response
   *
   * Validates:
   * - Mermaid diagram syntax (if enabled)
   * - JSON Schema compliance (if configured)
   * - Output length (if configured)
   */
  async afterThink(step: AgentStep, context: AgentContext): Promise<void> {
    const skillValidationRequirements = readSkillValidationRequirements(context.metadata);
    const artifactValidators = mergeRuntimeArtifactValidators(
      this.outputValidator.getConstraints().artifactValidators,
      skillValidationRequirements,
    );
    const result = await this.outputValidator.validateWithBlockInfo(
      step.content,
      skillValidationRequirements,
    );
    result.errors.push(
      ...validateStoryboardSourceResourceContext(step.content, context, artifactValidators),
    );

    // Process warnings
    for (const warning of result.warnings) {
      this.options.onValidationWarning?.(warning);
    }

    // Check for errors in base result and block-level validations
    const hasMermaidErrors = result.mermaidBlocks?.some((b) => !b.valid) ?? false;
    const hasJsonErrors = result.jsonBlocks?.some((b) => !b.valid) ?? false;
    const hasErrors = result.errors.length > 0 || hasMermaidErrors || hasJsonErrors;

    // Artifact validators are Skill output contracts. They run after the
    // complete assistant output has streamed. In retry mode the visible output
    // stays in the transcript, and the next model iteration receives a focused
    // repair request instead of this hook deleting or blocking streamed text.
    const firstArtifactError = result.errors.find((error) => isArtifactValidationError(error));
    if (firstArtifactError) {
      for (const error of result.errors) {
        this.options.onValidationError?.(error);
      }
      this.recordAgentNativeValidationFeedback(context, result.errors, result.warnings);
      const action = this.outputValidator.getConstraints().onValidationFail;
      if (action === 'retry') {
        queueOutputValidationRepairRequest({
          context,
          validators: artifactValidators,
          errors: result.errors,
          warnings: result.warnings,
          instruction: buildArtifactValidationRepairInstruction(
            result.errors,
            result.warnings,
            readRuntimePromptLocale(context.metadata),
          ),
        });
        return;
      }
      if (action === 'warn' || action === 'silent') {
        return;
      }
      throw new AgentError({
        category: 'validation',
        code: firstArtifactError.code,
        message: firstArtifactError.message,
        retryable: true,
        context: firstArtifactError.details,
      });
    }

    // Process errors based on configured action
    if (hasErrors) {
      const action = this.outputValidator.getConstraints().onValidationFail;

      for (const error of result.errors) {
        this.options.onValidationError?.(error);
      }
      this.recordAgentNativeValidationFeedback(context, result.errors, result.warnings);

      if (action === 'error') {
        const firstError = result.errors[0];
        if (firstError) {
          throw new AgentError({
            category: 'validation',
            code: firstError.code,
            message: firstError.message,
            retryable: false,
            context: firstError.details,
          });
        }
      } else if (action === 'retry') {
        let content = step.content || '';

        // Replace error mermaid blocks with fix prompts
        if (hasMermaidErrors && result.mermaidBlocks) {
          content = this.replaceMermaidErrorBlocks(content, result.mermaidBlocks);
        }

        // Replace error JSON blocks with fix prompts
        if (hasJsonErrors && result.jsonBlocks) {
          content = this.replaceJsonErrorBlocks(content, result.jsonBlocks);
        }

        step.content = content;
      }
      // 'warn' and 'silent' modes don't throw or modify content
    }
  }

  private recordAgentNativeValidationFeedback(
    context: AgentContext,
    errors: readonly ValidationError[],
    warnings: readonly ValidationWarning[],
  ): void {
    const creation = readAgentCreationValidationContext(context.metadata);
    if (!creation || errors.length === 0) return;
    const validators = readSkillValidationRequirements(context.metadata) ?? ['output'];
    for (const validatorId of validators) {
      this.options.creationFeedback?.recordValidationFeedback({
        creationId: creation.creationId,
        iterationId: creation.iterationId,
        validatorId,
        status: 'failed',
        diagnostics: errors.map((error) => ({
          severity: 'error',
          code: error.code,
          message: error.message,
          ...(error.details ? { metadata: error.details } : {}),
        })),
        metadata: {
          feedbackAction: 'revise',
          preserveStreamedOutput: true,
          warningCount: warnings.length,
        },
      });
    }
  }

  /**
   * Replace error mermaid blocks with fix prompts, keeping surrounding text
   */
  private replaceMermaidErrorBlocks(
    content: string,
    blocks: MermaidBlockValidationResult[],
  ): string {
    // Sort by startIndex descending to replace from end to start (avoid index shift)
    const errorBlocks = blocks
      .filter((b) => !b.valid)
      .sort((a, b) => b.block.startIndex - a.block.startIndex);

    let result = content;

    for (const { block } of errorBlocks) {
      // Simple fix prompt - just ask LLM to regenerate the diagram
      const fixPrompt = ['```mermaid', block.content, '```'].join('\n');

      // Replace the error block with fix prompt
      result = result.slice(0, block.startIndex) + fixPrompt + result.slice(block.endIndex);
    }

    return result;
  }

  /**
   * Replace error JSON blocks with fix prompts, keeping surrounding text
   */
  private replaceJsonErrorBlocks(content: string, blocks: JsonBlockValidationResult[]): string {
    // Sort by startIndex descending to replace from end to start (avoid index shift)
    const errorBlocks = blocks
      .filter((b) => !b.valid)
      .sort((a, b) => b.block.startIndex - a.block.startIndex);

    let result = content;

    for (const { block, errors } of errorBlocks) {
      // Build error hint as JSON comment (not standard but LLM understands)
      const errorHint = errors?.map((e) => `${e.path}: ${e.message}`).join(', ') || '';

      // Simple fix prompt
      const fixPrompt = block.inCodeBlock
        ? ['```json', block.content, '```'].join('\n')
        : `/* FIX: ${errorHint} */ ${block.content}`;

      // Replace the error block with fix prompt
      result = result.slice(0, block.startIndex) + fixPrompt + result.slice(block.endIndex);
    }

    return result;
  }

  /**
   * Validate a single message
   */
  private async validateMessage(message: ChatMessage): Promise<ChatMessage> {
    // Only process messages with content parts (multimodal)
    if (typeof message.content === 'string') {
      return message;
    }

    const validatedContent = await Promise.all(
      message.content.map((part) => this.validateContentPart(part)),
    );

    return { ...message, content: validatedContent };
  }

  /**
   * Validate a content part
   */
  private async validateContentPart(part: ContentPart): Promise<ContentPart> {
    if (part.type === 'image') {
      return this.imageValidator.validate(part);
    }
    return part;
  }

  /**
   * Get image validator instance
   */
  getImageValidator(): ImageValidator {
    return this.imageValidator;
  }

  /**
   * Get output validator instance
   */
  getOutputValidator(): OutputValidator {
    return this.outputValidator;
  }

  /**
   * Get current image constraints
   */
  getImageConstraints(): ImageConstraints {
    return this.imageValidator.getConstraints();
  }

  /**
   * Get current output constraints
   */
  getOutputConstraints(): OutputConstraints {
    return this.outputValidator.getConstraints();
  }

  /**
   * Validate a single image URL (utility method)
   */
  async validateImage(imageUrl: string): Promise<{ valid: boolean; error?: ValidationError }> {
    try {
      await this.imageValidator.validate({ type: 'image', imageUrl });
      return { valid: true };
    } catch (error) {
      if (error instanceof ImageValidationError) {
        return { valid: false, error: error.toValidationError() };
      }
      throw error;
    }
  }

  /**
   * Validate output content (utility method)
   */
  async validateOutput(
    content: string,
    artifactValidators?: readonly string[],
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
    return this.outputValidator.validate(content, artifactValidators);
  }
}

/**
 * Factory function to create ValidationHooks
 */
export function createValidationHooks(options?: ValidationHooksOptions): ValidationHooks {
  return new ValidationHooks(options);
}

function readSkillValidationRequirements(
  metadata: Record<string, unknown>,
): readonly string[] | undefined {
  const value = metadata['skillValidationRequirements'];
  if (!Array.isArray(value)) return undefined;
  const validators = value.filter((item): item is string => typeof item === 'string');
  return validators.length > 0 ? validators : undefined;
}

function readRuntimePromptLocale(metadata: Record<string, unknown>): 'en' | 'zh' {
  const value = metadata['locale'];
  return normalizeAgentRuntimePromptLocale(typeof value === 'string' ? value : undefined);
}

function readAgentCreationValidationContext(
  metadata: Record<string, unknown>,
): { readonly creationId: string; readonly iterationId: string } | null {
  const value = metadata['agentCreation'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record['creationId'] === 'string' &&
    record['creationId'].trim().length > 0 &&
    typeof record['iterationId'] === 'string' &&
    record['iterationId'].trim().length > 0
    ? { creationId: record['creationId'], iterationId: record['iterationId'] }
    : null;
}

function mergeRuntimeArtifactValidators(
  configured: readonly string[] | undefined,
  runtime: readonly string[] | undefined,
): readonly string[] {
  return [...(configured ?? []), ...(runtime ?? [])];
}

function isStoryboardCreativeTableValidatorEnabled(validators: readonly string[]): boolean {
  const storyboardValidatorIds = new Set(
    [
      STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
      'StoryboardCreativeTable',
      ...STORYBOARD_CREATIVE_TABLE_PROFILE.aliases,
    ].map(normalizeValidatorId),
  );
  return validators.some((validator) =>
    storyboardValidatorIds.has(normalizeValidatorId(validator)),
  );
}

function normalizeValidatorId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '.');
}

function isArtifactValidationError(error: ValidationError): boolean {
  return (
    error.code.startsWith('storyboard-table-') ||
    error.code === 'storyboard-frontmatter-not-allowed'
  );
}

function validateStoryboardSourceResourceContext(
  content: string,
  context: AgentContext,
  artifactValidators: readonly string[],
): readonly ValidationError[] {
  if (!isStoryboardCreativeTableValidatorEnabled(artifactValidators)) return [];
  const table = validateStoryboardCreativeTableOutput(content).table;
  if (!table) return [];

  const sourceColumnIndexes = table.headers
    .map((header, index) =>
      resolveStoryboardCreativeTableHeader(header) === 'source' ? index : -1,
    )
    .filter((index) => index >= 0);
  if (sourceColumnIndexes.length === 0) return [];

  const sourceTokens = uniqueStrings(
    table.rows.flatMap((row) =>
      sourceColumnIndexes.flatMap((columnIndex) =>
        extractStoryboardSourceResourceTokens(row.cells[columnIndex] ?? ''),
      ),
    ),
  );
  if (sourceTokens.length === 0) return [];

  const errors: ValidationError[] = [];
  if (!hasImageResourceContext(context)) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-source-resource-context-missing',
      message:
        'Storyboard creative table uses source resource tokens, but the conversation has no image resource context from ReadDocument.imageInfo, ReadImage.images, attachments, or perception cards.',
      details: {
        headerLine: table.headerLine,
        tokens: sourceTokens.slice(0, 12),
      },
    });
  }

  if (!hasVisualImageEvidenceContext(context)) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-visual-evidence-missing',
      message:
        'Storyboard creative table uses source resource tokens, but the conversation has no visual image evidence from ReadImage.images, image attachments, or perception cards. ReadDocument.imageInfo only binds resources and does not inspect pixels.',
      details: {
        headerLine: table.headerLine,
        tokens: sourceTokens.slice(0, 12),
      },
    });
  }

  return errors;
}

const STORYBOARD_SOURCE_TOKEN_RE =
  /`?([A-Za-z][A-Za-z0-9_.-]{0,80})(?:#[A-Za-z][A-Za-z0-9_.:-]{0,80})?`?/g;

const IGNORED_STORYBOARD_SOURCE_TOKENS = new Set([
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  'unbound',
  'pending',
  'needs-resource-binding',
  'resource-binding-required',
  '无',
  '未绑定',
  '待绑定',
]);

function extractStoryboardSourceResourceTokens(value: string): readonly string[] {
  const stripped = value.trim();
  if (!stripped || stripped === '-' || stripped === '—') return [];
  const tokens = Array.from(stripped.matchAll(STORYBOARD_SOURCE_TOKEN_RE))
    .map((match) => stripMarkdownToken(match[1] ?? match[0]))
    .filter((token) => token.length > 0)
    .filter((token) => !IGNORED_STORYBOARD_SOURCE_TOKENS.has(token.toLowerCase()))
    .filter(isLikelyStoryboardSourceToken);
  return uniqueStrings(tokens);
}

function isLikelyStoryboardSourceToken(token: string): boolean {
  return (
    /^p\d+$/i.test(token) ||
    /^page[_-]?\d+$/i.test(token) ||
    /^image[_-]?\d+$/i.test(token) ||
    /^read-image-[a-z0-9_.-]+$/i.test(token) ||
    /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(token)
  );
}

function hasImageResourceContext(context: AgentContext): boolean {
  return (
    context.toolResults.some(toolResultHasImageResourceContext) ||
    context.messages.some((message) => messageHasImageResourceContext(message))
  );
}

function hasVisualImageEvidenceContext(context: AgentContext): boolean {
  return (
    context.toolResults.some(toolResultHasVisualImageEvidenceContext) ||
    context.messages.some((message) => messageHasVisualImageEvidenceContext(message))
  );
}

function messageHasImageResourceContext(message: ChatMessage): boolean {
  if (message.role !== 'tool' || typeof message.content !== 'string') return false;
  const parsed = parseJsonRecord(message.content);
  return parsed ? toolResultPayloadHasImageResourceContext(parsed) : false;
}

function messageHasVisualImageEvidenceContext(message: ChatMessage): boolean {
  if (Array.isArray(message.content) && message.content.some((part) => part.type === 'image')) {
    return true;
  }
  if (message.role !== 'tool' || typeof message.content !== 'string') return false;
  const parsed = parseJsonRecord(message.content);
  return parsed ? toolResultPayloadHasVisualImageEvidenceContext(parsed) : false;
}

function toolResultHasImageResourceContext(result: unknown): boolean {
  return toolResultPayloadHasImageResourceContext(result);
}

function toolResultHasVisualImageEvidenceContext(result: unknown): boolean {
  return toolResultPayloadHasVisualImageEvidenceContext(result);
}

function toolResultPayloadHasImageResourceContext(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  if (readRecordArray(record, 'imageInfo').length > 0) return true;
  if (readRecordArray(record, 'images').length > 0) return true;
  if (readRecordArray(record, 'attachments').some(isImageAttachmentRecord)) return true;
  if (readRecordArray(record, 'perceptionCards').length > 0) return true;
  return (
    toolResultPayloadHasImageResourceContext(record['data']) ||
    toolResultPayloadHasImageResourceContext(record['excerpt'])
  );
}

function toolResultPayloadHasVisualImageEvidenceContext(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  if (readRecordArray(record, 'images').length > 0) return true;
  if (readRecordArray(record, 'attachments').some(isImageAttachmentRecord)) return true;
  if (readRecordArray(record, 'perceptionCards').length > 0) return true;
  return (
    toolResultPayloadHasVisualImageEvidenceContext(record['data']) ||
    toolResultPayloadHasVisualImageEvidenceContext(record['excerpt'])
  );
}

function isImageAttachmentRecord(value: Record<string, unknown>): boolean {
  return value['type'] === 'image';
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function readRecordArray(
  record: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripMarkdownToken(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1).trim() : trimmed;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function buildArtifactValidationRepairInstruction(
  errors: readonly ValidationError[],
  warnings: readonly ValidationWarning[],
  locale: 'en' | 'zh',
): string {
  const requiresEvidenceToolRepair = hasStoryboardEvidenceToolRepair(errors);
  if (locale === 'zh') {
    return buildChineseArtifactValidationRepairInstruction(
      errors,
      warnings,
      requiresEvidenceToolRepair,
    );
  }

  const lines = [
    requiresEvidenceToolRepair
      ? 'The previous visible assistant output failed post-stream validation because required storyboard image evidence is missing. Do not hide or summarize it; call the required evidence tools before producing a corrected replacement output.'
      : 'The previous visible assistant output failed post-stream validation. Do not hide or summarize it; produce a corrected replacement output now.',
    '',
    'Repair requirements:',
    ...formatEvidenceToolRepairRequirements(errors, 'en'),
    ...(requiresEvidenceToolRepair
      ? [
          '- After the required tool results are present, output the final target artifact directly, not a draft or simplified analysis table.',
        ]
      : ['- Output the final target artifact directly, not a draft or simplified analysis table.']),
    '- Keep the same user intent, source evidence, image/resource tokens, and useful content that remains backed by the conversation.',
    '- For storyboard creative tables, output exactly one Markdown table. Recommended stable field order:',
    `  ${formatStoryboardStableHeaderOrder()}`,
    '- Localized headers are allowed only when they map unambiguously to those stable fields; for Chinese you may use:',
    `  ${formatStoryboardLocalizedHeaderOrder('zh-cn')}`,
    '- Prompt slots are model-aware: imagePrompt/imageEditPrompt are for shot image generation/editing, shotVideoPrompt/videoEditPrompt are for shot video generation/editing, and sceneStylePrompt/sceneVideoPrompt/sceneVideoEditPrompt are for scene-level style/video continuity.',
    '- If source cells use tokens such as P1, page_1, or read-image-* they must be backed by ReadDocument.imageInfo, ReadImage.images, image attachments, or perception cards in this conversation. ReadDocument.imageInfo only binds stable image resources; it is not visual pixel evidence. For comic storyboard claims, call ReadImage with the returned imageInfo entries before writing visual, character, dialogue/OCR, panel, or prompt details. If binding cannot be completed, leave source empty and mark reviewStatus=needs-resource-binding with nextAction explaining the binding work.',
    '- Do not use simplified page-analysis headers such as 页码, 景别/构图, 节奏/情绪, page, image reference, analysis, or suggestion as the storyboard table.',
    '- Do not output YAML frontmatter, creation-document metadata, domain node JSON, or retired transfer payloads.',
    '- Preserve valid CommonMark image/resource tokens exactly; do not invent filenames, resourceRef values, Webview URIs, blob URLs, cache paths, or absolute paths.',
    '',
    'Validation errors:',
    ...errors.map((error) => `- ${error.code}: ${error.message}`),
  ];

  if (warnings.length > 0) {
    lines.push(
      '',
      'Validation warnings:',
      ...warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
    );
  }

  return lines.join('\n');
}

function buildChineseArtifactValidationRepairInstruction(
  errors: readonly ValidationError[],
  warnings: readonly ValidationWarning[],
  requiresEvidenceToolRepair: boolean,
): string {
  const lines = [
    requiresEvidenceToolRepair
      ? '上一条可见 assistant 输出没有通过流式完成后的校验，因为分镜表缺少必要的图片证据。不要隐藏或总结上一条内容；先调用必要的证据工具，再输出修正后的替换结果。'
      : '上一条可见 assistant 输出没有通过流式完成后的校验。不要隐藏或总结上一条内容；现在直接输出修正后的替换结果。',
    '',
    '修复要求：',
    ...formatEvidenceToolRepairRequirements(errors, 'zh'),
    ...(requiresEvidenceToolRepair
      ? ['- 必要工具结果出现后，再直接输出最终目标产物，不要输出草稿或简化分析表。']
      : ['- 直接输出最终目标产物，不要输出草稿或简化分析表。']),
    '- 保留同一用户意图、来源证据、图片/resource token 和仍被对话支撑的有用内容。',
    '- storyboard creative table 必须只输出一张 Markdown 表格。推荐稳定字段顺序：',
    `  ${formatStoryboardStableHeaderOrder()}`,
    '- 可以使用能明确映射到稳定字段的本地化表头；中文可用：',
    `  ${formatStoryboardLocalizedHeaderOrder('zh-cn')}`,
    '- 提示词槽必须按模型用途区分：imagePrompt/imageEditPrompt 用于单镜头图像生成/编辑，shotVideoPrompt/videoEditPrompt 用于单镜头视频生成/编辑，sceneStylePrompt/sceneVideoPrompt/sceneVideoEditPrompt 用于场景级风格、视频连续性或场景视频生成/编辑。',
    '- 如果 source/来源 单元格使用 P1、page_1 或 read-image-* 等 token，必须有本轮 ReadDocument.imageInfo、ReadImage.images、图片 attachments 或 perception cards 支撑。ReadDocument.imageInfo 只负责绑定稳定图片资源，不是视觉像素证据。漫画分镜涉及画面、人物、对白/OCR、分格或提示词判断时，必须先把返回的 imageInfo 条目传给 ReadImage。若无法完成绑定，则 source 留空，并在 reviewStatus 写 needs-resource-binding，在 nextAction 说明绑定工作。',
    '- 不要把 页码、景别/构图、节奏/情绪、page、image reference、analysis 或 suggestion 这类简化页级分析表头当作分镜表。',
    '- 不要输出 YAML frontmatter、创作文档元数据、领域节点 JSON 或旧 transfer payload。',
    '- 保留有效的 CommonMark 图片/resource token；不要编造文件名、resourceRef、Webview URI、blob URL、缓存路径或绝对路径。',
    '',
    '校验错误：',
    ...errors.map((error) => `- ${error.code}: ${error.message}`),
  ];

  if (warnings.length > 0) {
    lines.push(
      '',
      '校验警告：',
      ...warnings.map((warning) => `- ${warning.code}: ${warning.message}`),
    );
  }

  return lines.join('\n');
}

function hasStoryboardEvidenceToolRepair(errors: readonly ValidationError[]): boolean {
  return errors.some((error) => isStoryboardEvidenceToolRepairErrorCode(error.code));
}

function isStoryboardEvidenceToolRepairErrorCode(code: string): boolean {
  return (
    code === 'storyboard-table-source-resource-context-missing' ||
    code === 'storyboard-table-visual-evidence-missing'
  );
}

function formatEvidenceToolRepairRequirements(
  errors: readonly ValidationError[],
  locale: 'en' | 'zh',
): readonly string[] {
  if (!hasStoryboardEvidenceToolRepair(errors)) return [];

  const hasMissingResourceContext = errors.some(
    (error) => error.code === 'storyboard-table-source-resource-context-missing',
  );
  const hasMissingVisualEvidence = errors.some(
    (error) => error.code === 'storyboard-table-visual-evidence-missing',
  );

  if (locale === 'zh') {
    const lines = [
      '- 不要继续输出替换表格。先补齐缺失的 ReadDocument/ReadImage 证据，再生成修正后的 storyboard creative table。',
    ];
    if (hasMissingResourceContext) {
      lines.push(
        '- 先调用 ReadDocument mode="content"、mode="next" 或 mode="range"，并请求 include_images/max_images，直到请求页范围返回 ReadDocument.imageInfo；如果尝试后仍无法绑定，source 留空，在 reviewStatus 写 needs-resource-binding，并在 nextAction 说明绑定工作。',
      );
    }
    if (hasMissingVisualEvidence) {
      lines.push(
        '- 先调用 ReadImage，把 ReadDocument.imageInfo 返回的条目原样作为 images[] 传入；ReadImage 返回前，不要写画面、人物、对白/OCR、分格、imagePrompt 或 video prompt 判断。',
      );
    }
    lines.push(
      '- ReadDocument.imageInfo 只负责绑定稳定图片资源，不是视觉像素证据；ReadImage.images、图片 attachments 或 perception cards 才能支撑视觉判断。',
    );
    return lines;
  }

  const lines = [
    '- Do not continue outputting a replacement table. First complete the missing ReadDocument/ReadImage evidence, then produce the corrected storyboard creative table.',
  ];
  if (hasMissingResourceContext) {
    lines.push(
      '- First call ReadDocument mode="content", mode="next", or mode="range" with include_images/max_images until the requested page window returns ReadDocument.imageInfo. If binding still cannot be completed after attempting the requested range, leave source empty and mark reviewStatus=needs-resource-binding with nextAction explaining the binding work.',
    );
  }
  if (hasMissingVisualEvidence) {
    lines.push(
      '- First call ReadImage with the returned ReadDocument.imageInfo entries passed through unchanged as images[]. Before ReadImage returns, do not write visual, character, dialogue/OCR, panel, imagePrompt, or video prompt judgments.',
    );
  }
  lines.push(
    '- ReadDocument.imageInfo only binds stable image resources; it is not visual pixel evidence. ReadImage.images, image attachments, or perception cards are required for visual storyboard judgments.',
  );
  return lines;
}

function formatStoryboardStableHeaderOrder(): string {
  return STORYBOARD_CREATIVE_TABLE_PROFILE.recommendedHeaders.join(' | ');
}

function formatStoryboardLocalizedHeaderOrder(locale: 'zh-cn'): string {
  return STORYBOARD_CREATIVE_TABLE_PROFILE.recommendedHeaders
    .map((fieldId) => {
      const field = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find((item) => item.id === fieldId);
      return field?.labels[locale] ?? fieldId;
    })
    .join(' | ');
}
