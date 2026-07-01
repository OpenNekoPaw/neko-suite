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
    const result = await this.outputValidator.validateWithBlockInfo(
      step.content,
      readSkillValidationRequirements(context.metadata),
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
      const action = this.outputValidator.getConstraints().onValidationFail;
      if (action === 'retry') {
        queueOutputValidationRepairRequest({
          context,
          validators: readSkillValidationRequirements(context.metadata) ?? [],
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

function isArtifactValidationError(error: ValidationError): boolean {
  return (
    error.code.startsWith('storyboard-table-') ||
    error.code === 'storyboard-frontmatter-not-allowed'
  );
}

function buildArtifactValidationRepairInstruction(
  errors: readonly ValidationError[],
  warnings: readonly ValidationWarning[],
  locale: 'en' | 'zh',
): string {
  if (locale === 'zh') {
    return buildChineseArtifactValidationRepairInstruction(errors, warnings);
  }

  const lines = [
    'The previous visible assistant output failed post-stream validation. Do not hide or summarize it; produce a corrected replacement output now.',
    '',
    'Repair requirements:',
    '- Output the final target artifact directly, not a draft or simplified analysis table.',
    '- Keep the same user intent, source evidence, image/resource tokens, and useful content.',
    '- For storyboard creative tables, output exactly one Markdown table with these headers in this order:',
    '  scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf',
    '- Localized headers are allowed only when they map unambiguously to those stable fields; for Chinese you may use 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源.',
    '- Do not use simplified page-analysis headers such as 页码, 景别/构图, 节奏/情绪, page, image reference, analysis, or suggestion as the storyboard table.',
    '- Do not output YAML frontmatter, creation-document metadata, domain node JSON, or legacy transfer payloads.',
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
): string {
  const lines = [
    '上一条可见 assistant 输出没有通过流式完成后的校验。不要隐藏或总结上一条内容；现在直接输出修正后的替换结果。',
    '',
    '修复要求：',
    '- 直接输出最终目标产物，不要输出草稿或简化分析表。',
    '- 保留同一用户意图、来源证据、图片/resource token 和有用内容。',
    '- storyboard creative table 必须只输出一张 Markdown 表格，并按以下字段顺序：',
    '  scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf',
    '- 可以使用能明确映射到稳定字段的本地化表头；中文可用 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源。',
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
