/**
 * Output Validator
 *
 * Orchestrates validation of LLM output content including Mermaid diagrams and JSON schemas.
 * Uses specialized validators for each type of validation.
 */

import type {
  OutputConstraints,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  MermaidBlockValidationResult,
  JsonBlockValidationResult,
  ValidationResultWithBlocks,
} from './types';
import {
  projectNekoMarkdownExtensions,
  type NekoMarkdownCreativeTableProjection,
} from '@neko/markdown';
import {
  classifyCreativeTableHeaders,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
} from '@neko/shared';
import { DEFAULT_OUTPUT_CONSTRAINTS } from './types';

// Import specialized components
import { MermaidExtractor } from './mermaid-validator';
import { MermaidValidator } from './mermaid-validator';
import { MermaidBlockChecker } from './mermaid-validator';
import { JsonExtractor } from './json-validator';
import { JsonSchemaValidator } from './json-validator';
import { LengthValidator } from './length-validator';

interface ArtifactValidatorResult {
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

type ArtifactValidator = (content: string) => ArtifactValidatorResult;
type ArtifactValidatorApplicability = (content: string) => boolean;

interface ArtifactValidatorDefinition {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly shouldValidate?: ArtifactValidatorApplicability;
  readonly validate: ArtifactValidator;
}

const ARTIFACT_VALIDATOR_DEFINITIONS: readonly ArtifactValidatorDefinition[] = [
  {
    id: 'creative-table.storyboard',
    aliases: ['CreativeTable', 'StoryboardTable', 'storyboard', 'storyboard.creative-table'],
    shouldValidate: shouldValidateStoryboardCreativeTableOutput,
    validate: validateStoryboardCreativeTableOutput,
  },
] as const;

const ARTIFACT_VALIDATOR_REGISTRY = createArtifactValidatorRegistry(ARTIFACT_VALIDATOR_DEFINITIONS);

/**
 * OutputValidator - Orchestrates LLM output validation
 *
 * Single responsibility: Coordinate validation components
 */
export class OutputValidator {
  readonly constraints: OutputConstraints;

  // Specialized components
  private readonly mermaidExtractor = new MermaidExtractor();
  private readonly jsonExtractor = new JsonExtractor();
  private readonly mermaidValidator = new MermaidValidator();
  private readonly jsonSchemaValidator = new JsonSchemaValidator();
  private readonly lengthValidator = new LengthValidator();
  private readonly mermaidBlockChecker = new MermaidBlockChecker();

  constructor(constraints: Partial<OutputConstraints> = {}) {
    this.constraints = {
      ...DEFAULT_OUTPUT_CONSTRAINTS,
      ...constraints,
    };
  }

  /**
   * Validate output content
   */
  async validate(
    content: string,
    runtimeArtifactValidators?: readonly string[],
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check length
    if (this.constraints.maxLength !== undefined) {
      const lengthResult = this.lengthValidator.validate(content, {
        maxLength: this.constraints.maxLength,
      });
      warnings.push(...lengthResult.warnings);
    }

    // 2. Mermaid validation
    if (this.constraints.mermaidPreValidate) {
      const mermaidResult = await this.validateMermaid(content);
      errors.push(...mermaidResult.errors);
      warnings.push(...mermaidResult.warnings);
    }

    // 3. JSON Schema validation
    if (this.constraints.jsonSchema) {
      const schemaResult = await this.validateJsonSchema(content);
      errors.push(...schemaResult.errors);
      warnings.push(...schemaResult.warnings);
    }

    // 4. Artifact/table validation
    const artifactResult = this.validateArtifactValidators(
      content,
      mergeArtifactValidators(this.constraints.artifactValidators, runtimeArtifactValidators),
    );
    errors.push(...artifactResult.errors);
    warnings.push(...artifactResult.warnings);

    return { errors, warnings };
  }

  validateArtifactValidators(
    content: string,
    validators: readonly string[] | undefined,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const normalizedValidators = new Set((validators ?? []).map(normalizeValidatorId));
    for (const [validatorId, validator] of ARTIFACT_VALIDATOR_REGISTRY) {
      if (!normalizedValidators.has(validatorId)) continue;

      if (validator.shouldValidate && !validator.shouldValidate(content)) {
        continue;
      }

      const result = validator.validate(content);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return { errors, warnings };
  }

  /**
   * Validate Mermaid diagrams in content
   */
  async validateMermaid(content: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for structural issues (unclosed, malformed blocks)
    const blockCheckResult = this.mermaidBlockChecker.checkAll(content);
    errors.push(...blockCheckResult.errors);
    warnings.push(...blockCheckResult.warnings);

    // Extract and validate complete mermaid blocks
    const mermaidBlocks = this.mermaidExtractor.extract(content);

    if (mermaidBlocks.length === 0 && blockCheckResult.errors.length === 0) {
      return { errors, warnings };
    }

    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      if (!block) continue;

      const result = await this.mermaidValidator.validate(block);

      if (!result.valid) {
        errors.push({
          type: 'mermaid',
          code: 'MERMAID_SYNTAX_ERROR',
          message: `Mermaid diagram #${i + 1} has syntax error: ${result.error}`,
          details: {
            blockIndex: i,
            lineNumber: result.lineNumber,
            code: block.substring(0, 200) + (block.length > 200 ? '...' : ''),
          },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate content against JSON Schema
   */
  async validateJsonSchema(content: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!this.constraints.jsonSchema) {
      return { errors, warnings };
    }

    // Extract JSON from content
    const jsonContent = this.jsonExtractor.extractFirst(content);

    if (jsonContent === null) {
      warnings.push({
        type: 'schema',
        code: 'NO_JSON_FOUND',
        message: 'No valid JSON found in output for schema validation',
      });
      return { errors, warnings };
    }

    // Check if ajv is available
    const isAvailable = await this.jsonSchemaValidator.isLibraryAvailable();

    if (!isAvailable) {
      warnings.push({
        type: 'schema',
        code: 'AJV_UNAVAILABLE',
        message: 'JSON Schema validation skipped: ajv library not available',
      });
      return { errors, warnings };
    }

    // Validate against schema
    const result = await this.jsonSchemaValidator.validate(
      jsonContent,
      this.constraints.jsonSchema,
    );

    if (!result.valid && result.errors) {
      for (const err of result.errors) {
        errors.push({
          type: 'schema',
          code: 'SCHEMA_VALIDATION_ERROR',
          message: `Schema validation failed: ${err.message}`,
          details: { path: err.path },
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate with detailed block position info
   */
  async validateWithBlockInfo(
    content: string,
    runtimeArtifactValidators?: readonly string[],
  ): Promise<ValidationResultWithBlocks> {
    const baseResult = await this.validate(content, runtimeArtifactValidators);
    const result: ValidationResultWithBlocks = { ...baseResult };

    // Mermaid validation with block info
    if (this.constraints.mermaidPreValidate) {
      const blocks = this.mermaidExtractor.extractWithPosition(content);
      const mermaidBlocks: MermaidBlockValidationResult[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]!;
        const validationResult = await this.mermaidValidator.validate(block.content);

        mermaidBlocks.push({
          blockIndex: i,
          block,
          valid: validationResult.valid,
          error: validationResult.error,
          lineNumber: validationResult.lineNumber,
        });
      }

      result.mermaidBlocks = mermaidBlocks;
    }

    // JSON Schema validation with block info
    if (this.constraints.jsonSchema) {
      const jsonBlocks = await this.validateJsonBlocksWithPosition(content);
      result.jsonBlocks = jsonBlocks;
    }

    return result;
  }

  /**
   * Validate JSON blocks against schema with position info
   */
  private async validateJsonBlocksWithPosition(
    content: string,
  ): Promise<JsonBlockValidationResult[]> {
    const blocks = this.jsonExtractor.extractWithPosition(content);
    const results: JsonBlockValidationResult[] = [];

    if (!this.constraints.jsonSchema || blocks.length === 0) {
      return results;
    }

    const isAvailable = await this.jsonSchemaValidator.isLibraryAvailable();
    if (!isAvailable) {
      return results;
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      const validationResult = await this.jsonSchemaValidator.validate(
        block.parsed,
        this.constraints.jsonSchema,
      );

      results.push({
        blockIndex: i,
        block,
        valid: validationResult.valid,
        errors: validationResult.errors,
      });
    }

    return results;
  }

  /**
   * Extract mermaid blocks with position info
   * (Exposed for backward compatibility)
   */
  extractMermaidBlocksWithPosition(content: string) {
    return this.mermaidExtractor.extractWithPosition(content);
  }

  /**
   * Extract JSON blocks with position info
   * (Exposed for backward compatibility)
   */
  extractJsonBlocksWithPosition(content: string) {
    return this.jsonExtractor.extractWithPosition(content);
  }

  /**
   * Get current constraints
   */
  getConstraints(): OutputConstraints {
    return { ...this.constraints };
  }
}

/**
 * Factory function to create OutputValidator
 */
export function createOutputValidator(constraints?: Partial<OutputConstraints>): OutputValidator {
  return new OutputValidator(constraints);
}

function normalizeValidatorId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_.:-]+/g, '');
}

function createArtifactValidatorRegistry(
  definitions: readonly ArtifactValidatorDefinition[],
): ReadonlyMap<string, ArtifactValidatorDefinition> {
  const registry = new Map<string, ArtifactValidatorDefinition>();
  for (const definition of definitions) {
    registry.set(normalizeValidatorId(definition.id), definition);
    for (const alias of definition.aliases ?? []) {
      registry.set(normalizeValidatorId(alias), definition);
    }
  }
  return registry;
}

function mergeArtifactValidators(
  configured: readonly string[] | undefined,
  runtime: readonly string[] | undefined,
): readonly string[] | undefined {
  if ((!configured || configured.length === 0) && (!runtime || runtime.length === 0)) {
    return undefined;
  }
  return [...new Set([...(configured ?? []), ...(runtime ?? [])])];
}

function shouldValidateStoryboardCreativeTableOutput(content: string): boolean {
  return (
    hasForbiddenStoryboardDocumentMetadata(content) ||
    projectNekoMarkdownExtensions(content).creativeTables.length > 0
  );
}

function validateStoryboardCreativeTableOutput(content: string): ArtifactValidatorResult {
  const errors: ValidationError[] = [];
  const tables = projectStoryboardCreativeTables(content);

  if (hasForbiddenStoryboardDocumentMetadata(content)) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-document-metadata-forbidden',
      message:
        'Storyboard creative table output must not include YAML frontmatter or creation-document metadata.',
    });
  }

  if (tables.length === 0) {
    return { errors, warnings: [] };
  }

  if (tables.length > 1) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-single-table-required',
      message: 'Storyboard output must contain exactly one Markdown creative table.',
      details: { tableCount: tables.length },
    });
  }

  const [table] = tables;
  if (!table) {
    return { errors, warnings: [] };
  }

  const classification = classifyCreativeTableHeaders(
    STORYBOARD_CREATIVE_TABLE_PROFILE,
    table.headers,
  );
  const knownFieldIds = new Set(classification.knownFields.map((field) => field.id));
  const missingRecommendedHeaders = STORYBOARD_CREATIVE_TABLE_PROFILE.recommendedHeaders.filter(
    (fieldId) => !knownFieldIds.has(fieldId),
  );

  if (table.rows.length === 0) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-empty',
      message: 'Storyboard creative table must include at least one data row.',
    });
  }

  if (missingRecommendedHeaders.length > 0 || !classification.matchedProfile) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-required-fields-missing',
      message:
        'Storyboard creative table must use the prompt-first canonical headers: scene, shot, source, imagePrompt, videoPrompt, duration, dialogue.',
      details: {
        missingRecommendedHeaders,
        missingMinimumGroups: classification.missingMinimumGroups,
        headers: table.headers,
      },
    });
  }

  const nonCanonicalKnownHeaders = table.headers.flatMap((header) => {
    const field = resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, header);
    if (!field) return [];
    return header.trim() === field.id ? [] : [{ header, canonical: field.id }];
  });
  if (nonCanonicalKnownHeaders.length > 0) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-noncanonical-header',
      message:
        'Storyboard creative table known fields must use canonical field ids; localization is applied by the renderer.',
      details: { headers: nonCanonicalKnownHeaders },
    });
  }

  const forbiddenHeaders = table.headers.filter(isForbiddenStoryboardAnalysisHeader);
  if (forbiddenHeaders.length > 0) {
    errors.push({
      type: 'output',
      code: 'storyboard-table-forbidden-header',
      message:
        'Storyboard creative table must not be a page-analysis table with visual-analysis headers.',
      details: { headers: forbiddenHeaders },
    });
  }

  return { errors, warnings: [] };
}

function projectStoryboardCreativeTables(
  content: string,
): readonly NekoMarkdownCreativeTableProjection[] {
  return projectNekoMarkdownExtensions(content, {
    creativeTableKnownColumns: STORYBOARD_CREATIVE_TABLE_PROFILE.fields.map((field) => field.id),
  }).creativeTables;
}

function hasForbiddenStoryboardDocumentMetadata(content: string): boolean {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) return false;
  return /(^|\n)(id|kind|status|domain|referenceChain):\s*/i.test(trimmed);
}

function isForbiddenStoryboardAnalysisHeader(header: string): boolean {
  const normalized = normalizeCreativeTableHeader(header);
  return [
    '页码',
    '页码图像',
    '页面',
    '来源页',
    'page',
    'pagenumber',
    'image reference',
    'imagereference',
    '类型',
    '构图景别',
    '景别构图',
    '动画镜头建议',
    '镜头建议',
    '动作叙事功能',
    '氛围',
    '节奏情绪',
    'analysis',
    'suggestion',
  ].includes(normalized);
}
