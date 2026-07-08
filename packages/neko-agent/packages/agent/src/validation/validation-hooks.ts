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
    const artifactValidationRequirements = readArtifactValidationRequirements(context.metadata);
    const result = await this.outputValidator.validateWithBlockInfo(
      step.content,
      artifactValidationRequirements,
    );

    // Process warnings
    for (const warning of result.warnings) {
      this.options.onValidationWarning?.(warning);
    }

    // Check for errors in base result and block-level validations
    const hasMermaidErrors = result.mermaidBlocks?.some((b) => !b.valid) ?? false;
    const hasJsonErrors = result.jsonBlocks?.some((b) => !b.valid) ?? false;
    const hasErrors = result.errors.length > 0 || hasMermaidErrors || hasJsonErrors;

    // Process errors based on configured action
    if (hasErrors) {
      const action = this.outputValidator.getConstraints().onValidationFail;

      for (const error of result.errors) {
        this.options.onValidationError?.(error);
      }
      const shouldRetryArtifactOutput =
        action === 'retry' && result.errors.some(isStoryboardCreativeTableValidationError);
      this.recordAgentNativeValidationFeedback(
        context,
        result.errors,
        result.warnings,
        !shouldRetryArtifactOutput,
      );

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

        if (shouldRetryArtifactOutput) {
          queueOutputValidationRetry(context, result.errors);
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
    preserveStreamedOutput: boolean,
  ): void {
    const creation = readAgentCreationValidationContext(context.metadata);
    if (!creation || errors.length === 0) return;
    const validators = readArtifactValidationRequirements(context.metadata) ?? ['output'];
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
          preserveStreamedOutput,
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

function readArtifactValidationRequirements(
  metadata: Record<string, unknown>,
): readonly string[] | undefined {
  const value = metadata['artifactValidationRequirements'];
  if (!Array.isArray(value)) return undefined;
  const validators = value.filter((item): item is string => typeof item === 'string');
  return validators.length > 0 ? validators : undefined;
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

function isStoryboardCreativeTableValidationError(error: ValidationError): boolean {
  return error.code.startsWith('storyboard-table-');
}

function queueOutputValidationRetry(
  context: AgentContext,
  errors: readonly ValidationError[],
): void {
  const previousRetry = readOutputValidationRetry(context.metadata);
  const attempt = (previousRetry?.attempt ?? 0) + 1;
  const codes = errors.map((error) => error.code);
  context.messages.push({
    role: 'user',
    content: buildStoryboardCreativeTableRetryInstruction(errors),
  });
  context.metadata = {
    ...context.metadata,
    outputValidationRetry: {
      reason: 'artifact-validation',
      attempt,
      codes,
    },
  };
}

function readOutputValidationRetry(
  metadata: Record<string, unknown>,
): { readonly attempt: number } | undefined {
  const value = metadata['outputValidationRetry'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const attempt = (value as Record<string, unknown>)['attempt'];
  return typeof attempt === 'number' && Number.isFinite(attempt) ? { attempt } : undefined;
}

function buildStoryboardCreativeTableRetryInstruction(
  errors: readonly ValidationError[],
): string {
  const diagnostics = errors
    .map((error) => {
      const details = error.details ? ` ${JSON.stringify(error.details)}` : '';
      return `- ${error.code}: ${error.message}${details}`;
    })
    .join('\n');

  return [
    '上一版分镜表不符合 storyboard creative table 输出契约，请重写为唯一一张 storyboard creative table。',
    '必须使用规范字段 id 作为已知表头：scene, shot, source, imagePrompt, videoPrompt, duration, dialogue。可以在这些字段之后追加必要的扩展 metadata。',
    '不要输出页级分析表、资源索引、第二张“分镜结构建议”表、YAML/frontmatter、状态列表或 Canvas/领域 JSON。',
    '提示词必须是生成/编辑指导：imagePrompt 写图片生成或图片编辑步骤；videoPrompt 写 scene 级视频生成/编辑提示词，并汇总同一 scene 的镜头节拍。',
    '如果视觉证据不足以可靠写提示词，不要输出表格，改为纯文本说明视觉分析未完成。',
    '校验错误：',
    diagnostics,
  ].join('\n');
}
