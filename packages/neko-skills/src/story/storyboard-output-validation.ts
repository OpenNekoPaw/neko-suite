import {
  classifyCreativeTableHeaders,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  type AgentOutputValidationAdapter,
  type AgentOutputValidationDiagnostic,
  type AgentOutputValidationResult,
} from '@neko/shared';
import {
  projectNekoMarkdownExtensions,
  type NekoMarkdownCreativeTableProjection,
} from '@neko/markdown';

export function createStoryboardOutputValidationAdapter(): AgentOutputValidationAdapter {
  return {
    id: 'creative-table.storyboard',
    aliases: [
      'canonical-storyboard',
      'CreativeTable',
      'StoryboardTable',
      'storyboard',
      'storyboard.creative-table',
    ],
    shouldValidate: shouldValidateStoryboardOutput,
    validate: validateStoryboardOutput,
    buildRetryInstruction: buildStoryboardRetryInstruction,
  };
}

function shouldValidateStoryboardOutput(content: string): boolean {
  return (
    hasForbiddenStoryboardDocumentMetadata(content) ||
    projectNekoMarkdownExtensions(content).creativeTables.length > 0
  );
}

function validateStoryboardOutput(content: string): AgentOutputValidationResult {
  const errors: AgentOutputValidationDiagnostic[] = [];
  const tables = projectStoryboardCreativeTables(content);

  if (hasForbiddenStoryboardDocumentMetadata(content)) {
    errors.push({
      code: 'storyboard-table-document-metadata-forbidden',
      message:
        'Storyboard creative table output must not include YAML frontmatter or creation-document metadata.',
    });
  }

  if (tables.length === 0) return { errors, warnings: [] };

  if (tables.length > 1) {
    errors.push({
      code: 'storyboard-table-single-table-required',
      message: 'Storyboard output must contain exactly one Markdown creative table.',
      details: { tableCount: tables.length },
    });
  }

  const [table] = tables;
  if (!table) return { errors, warnings: [] };

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
      code: 'storyboard-table-empty',
      message: 'Storyboard creative table must include at least one data row.',
    });
  }

  if (missingRecommendedHeaders.length > 0 || !classification.matchedProfile) {
    errors.push({
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
      code: 'storyboard-table-noncanonical-header',
      message:
        'Storyboard creative table known fields must use canonical field ids; localization is applied by the renderer.',
      details: { headers: nonCanonicalKnownHeaders },
    });
  }

  const forbiddenHeaders = table.headers.filter(isForbiddenStoryboardAnalysisHeader);
  if (forbiddenHeaders.length > 0) {
    errors.push({
      code: 'storyboard-table-forbidden-header',
      message:
        'Storyboard creative table must not be a page-analysis table with visual-analysis headers.',
      details: { headers: forbiddenHeaders },
    });
  }

  return { errors, warnings: [] };
}

function buildStoryboardRetryInstruction(
  errors: readonly AgentOutputValidationDiagnostic[],
  locale?: string,
): string | undefined {
  const storyboardErrors = errors.filter((error) => error.code.startsWith('storyboard-table-'));
  if (storyboardErrors.length === 0) return undefined;

  const diagnostics = storyboardErrors
    .map((error) => {
      const details = error.details ? ` ${JSON.stringify(error.details)}` : '';
      return `- ${error.code}: ${error.message}${details}`;
    })
    .join('\n');

  if (locale?.toLowerCase().startsWith('zh')) {
    return [
      '上一版分镜表不符合 Storyboard 输出契约，请重写为唯一一张 Storyboard creative table。',
      '已知表头必须使用规范字段 id：scene, shot, source, imagePrompt, videoPrompt, duration, dialogue；必要的扩展 metadata 放在这些字段之后。',
      '不要输出页级分析表、资源索引、第二张建议表、YAML/frontmatter、状态列表或领域 JSON。',
      '如果视觉证据不足以可靠写提示词，不要输出表格，改为纯文本说明当前阻塞。',
      '校验错误：',
      diagnostics,
    ].join('\n');
  }

  return [
    'The previous Storyboard does not satisfy the canonical output contract. Rewrite it as exactly one Storyboard creative table.',
    'Use canonical field ids for known headers: scene, shot, source, imagePrompt, videoPrompt, duration, dialogue; append only necessary extension metadata after them.',
    'Do not output page-analysis tables, resource indexes, a second suggestion table, YAML/frontmatter, status lists, or domain JSON.',
    'If visual evidence is insufficient for reliable prompts, return a plain-text blocked explanation instead of a table.',
    'Validation errors:',
    diagnostics,
  ].join('\n');
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
