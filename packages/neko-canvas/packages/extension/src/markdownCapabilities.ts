import {
  createCanvasMarkdownDiagnostic,
  getCreativeTableOperationRequirement,
  isCanvasCreativeTableFieldRole,
  isCanvasCreativeTableValueType,
  isCanvasMarkdownCapabilityId,
  isResourceRef,
  isRuntimeOnlyCanvasMarkdownResourceValue,
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  validateCanvasMarkdownCapabilityInput,
  type CanvasAgentApplyContentResult,
  type CanvasAgentContentPayload,
  type CanvasCreateCompositeRequest,
  type CanvasCreateCompositeResult,
  type CanvasCreativePromptSlot,
  type CreativeTableFieldDescriptor,
  type CanvasMarkdownCapabilityDiagnostic,
  type CanvasMarkdownCapabilityInput,
  type CanvasMarkdownCapabilityPreviewSummary,
  type CanvasMarkdownCapabilityResourceCandidate,
  type CanvasMarkdownCapabilityResult,
  type CanvasMarkdownConsumedColumn,
  type CanvasMarkdownResourceRef,
  type CanvasMarkdownResolvedKind,
  type CanvasSerializableRecord,
  type CanvasSerializableValue,
  type CanvasCreativeTableFieldRole,
  type CanvasCreativeTableValueType,
  type TableColumnDef,
} from '@neko/shared';

export interface CanvasMarkdownCapabilityOperations {
  applyAgentContent(payload: CanvasAgentContentPayload): Promise<CanvasAgentApplyContentResult>;
  createNode(
    type: 'media' | 'storyboard' | 'table',
    position: { x: number; y: number },
    data: Record<string, unknown>,
    preset?: string,
  ): Promise<string>;
  updateNode(nodeId: string, data: Record<string, unknown>): Promise<void>;
  createComposite(request: CanvasCreateCompositeRequest): Promise<CanvasCreateCompositeResult>;
}

interface MarkdownTable {
  readonly columns: readonly MarkdownTableColumn[];
  readonly rows: readonly MarkdownTableRow[];
  readonly startLine: number;
  readonly endLine: number;
}

interface MarkdownTableColumn {
  readonly id: string;
  readonly label: string;
}

interface MarkdownTableRow {
  readonly rowIndex: number;
  readonly line: number;
  readonly cells: Readonly<Record<string, string>>;
}

interface ResourceBindingSummary {
  readonly token: string;
  readonly status: 'bound' | 'missing' | 'ambiguous';
  readonly resource?: CanvasMarkdownResourceRef;
}

interface ResourceBindingResult {
  readonly bindings: readonly ResourceBindingSummary[];
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
}

type CanvasMarkdownTableProfileId = 'generic' | 'storyboard';

type CanvasMarkdownTableUnknownColumnPolicy = 'preserve' | 'reject';

type CanvasMarkdownTableProfilePhase = 'review' | 'apply';

interface CanvasMarkdownTableFieldDescriptor {
  readonly fieldId: string;
  readonly aliases: readonly string[];
  readonly role?: CanvasCreativeTableFieldRole;
  readonly valueType?: CanvasCreativeTableValueType;
  readonly resourceColumn?: boolean;
}

interface CanvasMarkdownTableProfileValidationRule {
  readonly phases: readonly CanvasMarkdownTableProfilePhase[];
  readonly fieldIds: readonly string[];
  readonly severity: CanvasMarkdownCapabilityDiagnostic['severity'];
  readonly code: string;
  readonly message: string;
}

interface CanvasMarkdownTableProfileActionDescriptor {
  readonly actionId: string;
  readonly label: string;
  readonly capabilityId: CanvasMarkdownCapabilityInput['capabilityId'];
}

interface CanvasMarkdownTableProfileDescriptor {
  readonly profileId: CanvasMarkdownTableProfileId;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly reviewKind: string;
  readonly creative: boolean;
  readonly unknownColumnPolicy: CanvasMarkdownTableUnknownColumnPolicy;
  readonly fields: readonly CanvasMarkdownTableFieldDescriptor[];
  readonly validationRules: readonly CanvasMarkdownTableProfileValidationRule[];
  readonly reviewActions: readonly CanvasMarkdownTableProfileActionDescriptor[];
}

interface CanvasMarkdownResolvedTableProfileColumns {
  readonly columnsByField: ReadonlyMap<string, MarkdownTableColumn>;
  readonly consumedColumns: readonly CanvasMarkdownConsumedColumn[];
  readonly resourceColumns: readonly MarkdownTableColumn[];
  readonly unknownColumns: readonly MarkdownTableColumn[];
}

const TABLE_COLUMN_WIDTH = 180;
const MARKDOWN_TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const COMMONMARK_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const RESOURCE_TOKEN_SPLIT_RE = /[\s,，、;；]+/g;
const RESOURCE_TOKEN_ALLOWED_RE = /^[A-Za-z0-9][A-Za-z0-9._~:@/%+-]*(?:#[A-Za-z0-9_.:-]+)?$/;
const CANVAS_GENERIC_TABLE_PROFILE: CanvasMarkdownTableProfileDescriptor = {
  profileId: 'generic',
  aliases: ['generic', 'table', 'generic-table', 'canvas.tableProfile.generic'],
  displayName: 'Generic Markdown table',
  reviewKind: 'generic-table',
  creative: false,
  unknownColumnPolicy: 'preserve',
  fields: [
    {
      fieldId: 'resource',
      valueType: 'resource-token',
      resourceColumn: true,
      aliases: [
        'image',
        'images',
        'picture',
        'pictures',
        'resource',
        'resources',
        'asset',
        'assets',
        'file',
        'files',
        'filename',
        'filenames',
        'reference',
        'references',
        'ref',
        'media',
        'source',
        'source image',
        'sourceimage',
        '图片',
        '图像',
        '资源',
        '素材',
        '参考图',
        '参考',
      ],
    },
  ],
  validationRules: [],
  reviewActions: [],
};

const STORYBOARD_PROMPT_SLOT_FIELD_IDS = STORYBOARD_CREATIVE_TABLE_PROFILE.fields
  .filter((field) => field.promptSlot)
  .map((field) => field.id);
const STORYBOARD_PRODUCTION_CONTENT_FIELD_IDS = ['visual', ...STORYBOARD_PROMPT_SLOT_FIELD_IDS];

function createCanvasProfileFieldsFromCreativeProfile(
  fields: readonly CreativeTableFieldDescriptor[],
): readonly CanvasMarkdownTableFieldDescriptor[] {
  return fields.map((field) => ({
    fieldId: field.id,
    aliases: field.aliases,
    role: field.role,
    valueType: field.valueType,
    ...(field.resourceColumn ? { resourceColumn: true } : {}),
  }));
}

const CANVAS_STORYBOARD_TABLE_PROFILE: CanvasMarkdownTableProfileDescriptor = {
  profileId: 'storyboard',
  aliases: [
    'storyboard',
    'storyboard-draft',
    'markdown-storyboard-draft',
    'canvas.tableProfile.storyboard-draft',
  ],
  displayName: 'Storyboard',
  reviewKind: 'storyboard',
  creative: true,
  unknownColumnPolicy: 'preserve',
  fields: createCanvasProfileFieldsFromCreativeProfile(STORYBOARD_CREATIVE_TABLE_PROFILE.fields),
  validationRules: [
    {
      phases: ['review'],
      fieldIds: STORYBOARD_PRODUCTION_CONTENT_FIELD_IDS,
      severity: 'warning',
      code: 'canvas-markdown-storyboard-visual-or-prompt-missing',
      message:
        'Storyboard draft table has no visual/画面内容 or prompt column; Canvas will keep it as review metadata.',
    },
    {
      phases: ['review'],
      fieldIds: ['nextAction', 'actionId'],
      severity: 'info',
      code: 'canvas-markdown-storyboard-next-action-missing',
      message:
        'Storyboard draft table has no nextAction/建议操作 or trusted actionId column; Canvas can still keep it for review.',
    },
    {
      phases: ['apply'],
      fieldIds: STORYBOARD_PRODUCTION_CONTENT_FIELD_IDS,
      severity: 'error',
      code: 'canvas-markdown-storyboard-visual-column-required',
      message: 'Production storyboard creation requires a visual/画面内容 or prompt column.',
    },
  ],
  reviewActions: [
    {
      actionId: 'create-storyboard-nodes',
      label: 'Create storyboard nodes',
      capabilityId: 'canvas.createStoryboardFromMarkdown',
    },
  ],
};

const CANVAS_MARKDOWN_TABLE_PROFILES: readonly CanvasMarkdownTableProfileDescriptor[] = [
  CANVAS_GENERIC_TABLE_PROFILE,
  CANVAS_STORYBOARD_TABLE_PROFILE,
];
const CANVAS_MARKDOWN_TABLE_PROFILE_ERRORS = validateCanvasMarkdownTableProfiles(
  CANVAS_MARKDOWN_TABLE_PROFILES,
);

if (CANVAS_MARKDOWN_TABLE_PROFILE_ERRORS.length > 0) {
  throw new Error(
    `Invalid Canvas Markdown table profile registry: ${CANVAS_MARKDOWN_TABLE_PROFILE_ERRORS.join('; ')}`,
  );
}

export async function invokeCanvasMarkdownCapability(
  input: CanvasMarkdownCapabilityInput,
  operations?: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const contractDiagnostics = validateCanvasMarkdownCapabilityInput(input);
  if (contractDiagnostics.length > 0) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: contractDiagnostics,
    };
  }

  switch (input.capabilityId) {
    case 'canvas.ingestMarkdown':
      return ingestMarkdown(input, requireOperations(input, operations));
    case 'canvas.validateMarkdownStoryboard':
      return validateMarkdownStoryboard(input);
    case 'canvas.createMarkdownNote':
      return createMarkdownNote(input, requireOperations(input, operations));
    case 'canvas.createTableFromMarkdown':
      return createTableFromMarkdown(input, requireOperations(input, operations));
    case 'canvas.createStoryboardDraftFromMarkdown':
      return createStoryboardDraftFromMarkdown(input, requireOperations(input, operations));
    case 'canvas.createStoryboardFromMarkdown':
      return createStoryboardFromMarkdown(input, requireOperations(input, operations));
    case 'canvas.attachResource':
      return attachResource(input, requireOperations(input, operations));
  }
}

async function ingestMarkdown(
  input: Extract<CanvasMarkdownCapabilityInput, { capabilityId: 'canvas.ingestMarkdown' }>,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  if (input.intentHint === 'note') {
    return projectIngestFacadeResult(
      await createMarkdownNote({ ...input, capabilityId: 'canvas.createMarkdownNote' }, operations),
    );
  }

  const parsed = parseSingleMarkdownTable(input.markdown);
  const shouldReviewAsCreativeTable =
    input.intentHint === 'creative-table' || input.operationHint !== undefined;
  if (!parsed.table && input.intentHint !== 'table' && !shouldReviewAsCreativeTable) {
    return projectIngestFacadeResult(
      await createMarkdownNote({ ...input, capabilityId: 'canvas.createMarkdownNote' }, operations),
    );
  }
  if (parsed.diagnostics.length > 0 || !parsed.table) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      resolvedKind: shouldReviewAsCreativeTable ? 'creative-table' : 'generic-table',
      diagnostics: parsed.diagnostics,
      preview: createTablePreview(input, parsed.table, [], {
        resolvedKind: shouldReviewAsCreativeTable ? 'creative-table' : 'generic-table',
      }),
    };
  }

  if (shouldReviewAsCreativeTable || input.profileHint) {
    const profileResult = resolveTableProfile(input.profileHint, 'storyboard');
    if (profileResult.profile) {
      return createProfiledTableFromParsed({
        input,
        operations,
        parsedTable: parsed.table,
        profile: profileResult.profile,
        actionCapabilityId: input.capabilityId,
        fallbackLabel: input.title ?? 'Creative Table',
        includeActions: true,
      });
    }

    const genericResult = await createProfiledTableFromParsed({
      input,
      operations,
      parsedTable: parsed.table,
      profile: CANVAS_GENERIC_TABLE_PROFILE,
      actionCapabilityId: input.capabilityId,
      extraDiagnostics: profileResult.diagnostics,
      displayFallback: true,
      fallbackLabel: input.title ?? 'Markdown Table',
      includeActions: false,
    });
    return genericResult;
  }

  return createProfiledTableFromParsed({
    input,
    operations,
    parsedTable: parsed.table,
    profile: CANVAS_GENERIC_TABLE_PROFILE,
    actionCapabilityId: input.capabilityId,
    fallbackLabel: input.title ?? 'Markdown Table',
    includeActions: false,
  });
}

function projectIngestFacadeResult(
  result: CanvasMarkdownCapabilityResult,
): CanvasMarkdownCapabilityResult {
  return {
    ...result,
    capabilityId: 'canvas.ingestMarkdown',
    resolvedKind: result.resolvedKind ?? 'markdown-note',
    preview: result.preview
      ? { ...result.preview, resolvedKind: result.preview.resolvedKind ?? 'markdown-note' }
      : { resolvedKind: 'markdown-note' },
  };
}

function requireOperations(
  input: CanvasMarkdownCapabilityInput,
  operations: CanvasMarkdownCapabilityOperations | undefined,
): CanvasMarkdownCapabilityOperations {
  if (!operations) {
    throw new Error(`Canvas Markdown capability ${input.capabilityId} requires Canvas operations.`);
  }
  return operations;
}

async function createMarkdownNote(
  input: Extract<CanvasMarkdownCapabilityInput, { capabilityId: 'canvas.createMarkdownNote' }>,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const result = await operations.applyAgentContent({
    kind: 'text',
    text: input.markdown,
    title: input.title,
    format: 'markdown',
    target: input.target,
    provenance: input.provenance,
  });
  const nodeIds = uniqueStrings([
    ...(result.nodeId ? [result.nodeId] : []),
    ...(result.createdNodeIds ?? []),
  ]);
  return {
    capabilityId: input.capabilityId,
    status: result.changed ? (nodeIds.length > 0 ? 'created' : 'changed') : 'validated',
    nodeIds,
    diagnostics: [],
    preview: {
      title: input.title,
      rowCount: countNonEmptyMarkdownLines(input.markdown),
    },
  };
}

async function createTableFromMarkdown(
  input: Extract<CanvasMarkdownCapabilityInput, { capabilityId: 'canvas.createTableFromMarkdown' }>,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const parsed = parseSingleMarkdownTable(input.markdown);
  if (parsed.diagnostics.length > 0 || !parsed.table) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: parsed.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  return createProfiledTableFromParsed({
    input,
    operations,
    parsedTable: parsed.table,
    profile: CANVAS_GENERIC_TABLE_PROFILE,
    actionCapabilityId: input.capabilityId,
    fallbackLabel: input.tableTitle ?? input.title ?? 'Markdown Table',
    includeActions: false,
  });
}

async function createStoryboardDraftFromMarkdown(
  input: Extract<
    CanvasMarkdownCapabilityInput,
    { capabilityId: 'canvas.createStoryboardDraftFromMarkdown' }
  >,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const parsed = parseSingleMarkdownTable(input.markdown);
  if (parsed.diagnostics.length > 0 || !parsed.table) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: parsed.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  const profileResult = resolveTableProfile(input.profileHint, 'storyboard-draft');
  if (profileResult.diagnostics.length > 0 || !profileResult.profile) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: profileResult.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  return createProfiledTableFromParsed({
    input,
    operations,
    parsedTable: parsed.table,
    profile: profileResult.profile,
    actionCapabilityId: input.capabilityId,
    fallbackLabel: input.title ?? 'Storyboard',
    includeActions: true,
  });
}

async function createProfiledTableFromParsed(options: {
  readonly input: CanvasMarkdownCapabilityInput & { markdown: string; title?: string };
  readonly operations: CanvasMarkdownCapabilityOperations;
  readonly parsedTable: MarkdownTable;
  readonly profile: CanvasMarkdownTableProfileDescriptor;
  readonly actionCapabilityId: CanvasMarkdownCapabilityInput['capabilityId'];
  readonly extraDiagnostics?: readonly CanvasMarkdownCapabilityDiagnostic[];
  readonly displayFallback?: boolean;
  readonly fallbackLabel?: string;
  readonly includeActions?: boolean;
}): Promise<CanvasMarkdownCapabilityResult> {
  const resolvedKind = toResolvedTableKind(options.profile, options.displayFallback);
  const profileColumns = resolveProfileColumns(options.profile, options.parsedTable);
  const operationProfileDiagnostics = validateOperationProfileMatch(options.input, options.profile);
  if (operationProfileDiagnostics.length > 0) {
    return {
      capabilityId: options.actionCapabilityId,
      status: 'blocked',
      resolvedKind,
      profileId: options.profile.profileId,
      displayFallback: Boolean(options.displayFallback),
      diagnostics: [...(options.extraDiagnostics ?? []), ...operationProfileDiagnostics],
      preview: createTablePreview(options.input, options.parsedTable, [], {
        resolvedKind,
        profile: options.profile,
        profileColumns,
        displayFallback: Boolean(options.displayFallback),
      }),
    };
  }
  const profileDiagnostics = validateTableProfile(
    options.profile,
    options.parsedTable,
    'review',
    profileColumns,
  );
  const operationDiagnostics = validateOperationRequiredFields(
    options.input,
    options.profile,
    options.parsedTable,
    profileColumns,
    'warning',
  );
  const resourceBindings = bindResources(
    options.parsedTable,
    options.input.resources ?? [],
    profileColumns.resourceColumns,
  );
  const diagnostics = [
    ...(options.extraDiagnostics ?? []),
    ...profileDiagnostics,
    ...operationDiagnostics,
    ...resourceBindings.diagnostics,
  ];
  const nodeId = await options.operations.createNode(
    'table',
    options.input.target?.insertionPoint ?? { x: 0, y: 0 },
    createTableNodeData(
      options.input,
      options.parsedTable,
      resourceBindings,
      options.profile,
      profileColumns,
      {
        resolvedKind,
        displayFallback: Boolean(options.displayFallback),
        label: options.fallbackLabel,
      },
    ),
    'table.basic',
  );
  const isCreativeReviewNode = options.profile.creative && !options.displayFallback;
  const status = diagnostics.some((diagnostic) =>
    isCreativeReviewNode ? diagnostic.severity !== 'info' : diagnostic.severity === 'error',
  )
    ? 'needs-review'
    : 'created';

  return {
    capabilityId: options.actionCapabilityId,
    status,
    resolvedKind,
    profileId: options.profile.profileId,
    displayFallback: Boolean(options.displayFallback),
    nodeIds: [nodeId],
    ...(isCreativeReviewNode ? { draftNodeId: nodeId } : {}),
    tableNodeId: nodeId,
    diagnostics,
    ...(options.includeActions &&
    !options.displayFallback &&
    options.profile.reviewActions.length > 0
      ? { actions: options.profile.reviewActions }
      : {}),
    preview: createTablePreview(options.input, options.parsedTable, resourceBindings.bindings, {
      resolvedKind,
      profile: options.profile,
      profileColumns,
      displayFallback: Boolean(options.displayFallback),
    }),
  };
}

async function createStoryboardFromMarkdown(
  input: Extract<
    CanvasMarkdownCapabilityInput,
    { capabilityId: 'canvas.createStoryboardFromMarkdown' }
  >,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const parsed = parseSingleMarkdownTable(input.markdown);
  if (parsed.diagnostics.length > 0 || !parsed.table) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: parsed.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }
  if (input.mode !== 'create-nodes') {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: [
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-storyboard-create-not-confirmed',
          'Production storyboard creation requires mode "create-nodes".',
          'mode',
        ),
      ],
      preview: createTablePreview(input, parsed.table, []),
    };
  }
  if (!input.approval) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: [
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-storyboard-create-approval-required',
          'Production storyboard creation requires lifecycle approval context.',
          'approval',
        ),
      ],
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  const profileResult = resolveTableProfile(input.profileHint, 'storyboard-draft');
  if (profileResult.diagnostics.length > 0 || !profileResult.profile) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: profileResult.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  const profileColumns = resolveProfileColumns(profileResult.profile, parsed.table);
  const operationProfileDiagnostics = validateOperationProfileMatch(input, profileResult.profile);
  if (operationProfileDiagnostics.length > 0) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: operationProfileDiagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }
  const production = buildStoryboardProductionRequest(
    input,
    parsed.table,
    profileResult.profile,
    profileColumns,
  );
  if (production.diagnostics.length > 0 || !production.request) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: production.diagnostics,
      preview: createTablePreview(input, parsed.table, []),
    };
  }

  const result = await operations.createComposite(production.request);
  const nodeIds = [result.containerId, ...result.childIds];
  return {
    capabilityId: input.capabilityId,
    status: 'created',
    nodeIds,
    draftNodeId: result.containerId,
    diagnostics: [],
    preview: {
      ...createTablePreview(input, parsed.table, []),
      rowCount: result.childIds.length,
    },
  };
}

async function attachResource(
  input: Extract<CanvasMarkdownCapabilityInput, { capabilityId: 'canvas.attachResource' }>,
  operations: CanvasMarkdownCapabilityOperations,
): Promise<CanvasMarkdownCapabilityResult> {
  const targetNodeId = input.target.nodeId;
  if (!targetNodeId) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: [
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-attach-resource-missing-target-node',
          'Canvas resource attachment requires target.nodeId.',
          'target',
        ),
      ],
    };
  }

  const attachmentData = createResourceAttachmentData(input.resource, input.role);
  if (!attachmentData) {
    return {
      capabilityId: input.capabilityId,
      status: 'blocked',
      diagnostics: [
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-attach-resource-missing-stable-ref',
          'Canvas resource attachment requires a ResourceRef, DocumentArchiveResourceRef, or stable sourcePath.',
          'resource',
        ),
      ],
    };
  }

  await operations.updateNode(targetNodeId, attachmentData);
  return {
    capabilityId: input.capabilityId,
    status: 'changed',
    nodeIds: [targetNodeId],
    diagnostics: [],
  };
}

function validateMarkdownStoryboard(
  input: Extract<
    CanvasMarkdownCapabilityInput,
    { capabilityId: 'canvas.validateMarkdownStoryboard' }
  >,
): CanvasMarkdownCapabilityResult {
  const parsed = parseSingleMarkdownTable(input.markdown);
  const profileResult = resolveTableProfile(input.profileHint, 'storyboard-draft');
  const diagnostics = parsed.table
    ? [
        ...parsed.diagnostics,
        ...profileResult.diagnostics,
        ...(profileResult.profile
          ? validateResolvedStoryboardTable(input, profileResult.profile, parsed.table)
          : []),
      ]
    : [...parsed.diagnostics, ...profileResult.diagnostics];
  return {
    capabilityId: 'canvas.validateMarkdownStoryboard',
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 'blocked'
      : 'validated',
    diagnostics,
    preview: createTablePreview(input, parsed.table, []),
  };
}

function validateResolvedStoryboardTable(
  input: CanvasMarkdownCapabilityInput & { markdown: string },
  profile: CanvasMarkdownTableProfileDescriptor,
  table: MarkdownTable,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  const profileColumns = resolveProfileColumns(profile, table);
  return [
    ...validateTableProfile(profile, table, 'review', profileColumns),
    ...validateOperationProfileMatch(input, profile),
    ...validateOperationRequiredFields(input, profile, table, profileColumns, 'warning'),
  ];
}

function parseSingleMarkdownTable(markdown: string): {
  readonly table?: MarkdownTable;
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
} {
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parseTableLine(lines[index] ?? '');
    const separator = parseTableLine(lines[index + 1] ?? '');
    if (!header || !separator) {
      continue;
    }
    if (!isSeparatorRow(separator) || header.length !== separator.length) {
      continue;
    }

    const rows: MarkdownTableRow[] = [];
    for (let rowLineIndex = index + 2; rowLineIndex < lines.length; rowLineIndex += 1) {
      const cells = parseTableLine(lines[rowLineIndex] ?? '');
      if (!cells) {
        break;
      }
      if (cells.length !== header.length) {
        return {
          diagnostics: [
            {
              severity: 'error',
              code: 'canvas-markdown-table-row-width-mismatch',
              message: 'Markdown table row cell count does not match the header.',
              line: rowLineIndex + 1,
            },
          ],
        };
      }
      rows.push({
        rowIndex: rows.length,
        line: rowLineIndex + 1,
        cells: Object.fromEntries(
          header.map((label, columnIndex) => [
            createColumnId(label, columnIndex),
            (cells[columnIndex] ?? '').trim(),
          ]),
        ),
      });
    }

    const table: MarkdownTable = {
      columns: header.map((label, columnIndex) => ({
        id: createColumnId(label, columnIndex),
        label: label.trim() || `Column ${columnIndex + 1}`,
      })),
      rows,
      startLine: index + 1,
      endLine: index + rows.length + 2,
    };
    return {
      table,
      diagnostics:
        rows.length === 0
          ? [
              {
                severity: 'error',
                code: 'canvas-markdown-table-empty',
                message: 'Markdown table must contain at least one data row.',
                line: index + 1,
              },
            ]
          : [],
    };
  }

  return {
    diagnostics: [
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-table-missing',
        'Markdown must include one GFM table before Canvas can create table or storyboard nodes.',
      ),
    ],
  };
}

function parseTableLine(line: string): readonly string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return undefined;
  }
  const body = trimmed.slice(1, -1);
  return body.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => MARKDOWN_TABLE_SEPARATOR_CELL.test(cell));
}

function createColumnId(label: string, index: number): string {
  const normalized = normalizeColumnKey(label).replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-');
  return normalized || `column-${index + 1}`;
}

function normalizeColumnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ');
}

function resolveTableProfile(
  profileHint: string | undefined,
  defaultAlias: string,
): {
  readonly profile?: CanvasMarkdownTableProfileDescriptor;
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
} {
  const requested = profileHint?.trim() || defaultAlias;
  const profile = CANVAS_MARKDOWN_TABLE_PROFILES.find((candidate) =>
    candidate.aliases.some(
      (alias) => normalizeProfileAlias(alias) === normalizeProfileAlias(requested),
    ),
  );
  if (profile) {
    return { profile, diagnostics: [] };
  }
  return {
    diagnostics: [
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-unsupported-table-profile',
        `Canvas Markdown table profile "${requested}" is not supported.`,
        'profileHint',
      ),
    ],
  };
}

function normalizeProfileAlias(value: string): string {
  return value.trim().toLowerCase();
}

function validateCanvasMarkdownTableProfiles(
  profiles: readonly CanvasMarkdownTableProfileDescriptor[],
): readonly string[] {
  const errors: string[] = [];
  const profileAliases = new Map<string, string>();
  for (const profile of profiles) {
    if (!profile.profileId) {
      errors.push('Profile id is required.');
    }
    for (const alias of [profile.profileId, ...profile.aliases]) {
      const key = normalizeProfileAlias(alias);
      const existing = profileAliases.get(key);
      if (existing && existing !== profile.profileId) {
        errors.push(
          `Profile alias "${alias}" is used by both "${existing}" and "${profile.profileId}".`,
        );
      }
      profileAliases.set(key, profile.profileId);
    }

    const fieldIds = new Set<string>();
    const fieldAliases = new Map<string, string>();
    for (const field of profile.fields) {
      if (fieldIds.has(field.fieldId)) {
        errors.push(
          `Profile "${profile.profileId}" declares duplicate field id "${field.fieldId}".`,
        );
      }
      fieldIds.add(field.fieldId);

      if (field.role && !isCanvasCreativeTableFieldRole(field.role)) {
        errors.push(
          `Profile "${profile.profileId}" field "${field.fieldId}" has unsupported role.`,
        );
      }
      if (field.valueType && !isCanvasCreativeTableValueType(field.valueType)) {
        errors.push(
          `Profile "${profile.profileId}" field "${field.fieldId}" has unsupported value type.`,
        );
      }

      for (const alias of [field.fieldId, ...field.aliases]) {
        const key = normalizeColumnKey(alias);
        const existing = fieldAliases.get(key);
        if (existing && existing !== field.fieldId) {
          errors.push(
            `Profile "${profile.profileId}" alias "${alias}" maps to both "${existing}" and "${field.fieldId}".`,
          );
        }
        fieldAliases.set(key, field.fieldId);
      }
    }

    for (const rule of profile.validationRules) {
      for (const fieldId of rule.fieldIds) {
        if (!fieldIds.has(fieldId)) {
          errors.push(
            `Profile "${profile.profileId}" validation rule "${rule.code}" references unknown field "${fieldId}".`,
          );
        }
      }
    }

    for (const action of profile.reviewActions) {
      if (!isCanvasMarkdownCapabilityId(action.capabilityId)) {
        errors.push(
          `Profile "${profile.profileId}" action "${action.actionId}" references unsupported capability "${action.capabilityId}".`,
        );
      }
    }
  }
  return errors;
}

function resolveProfileColumns(
  profile: CanvasMarkdownTableProfileDescriptor,
  table: MarkdownTable,
): CanvasMarkdownResolvedTableProfileColumns {
  const fieldsByAlias = new Map<string, CanvasMarkdownTableFieldDescriptor>();
  for (const field of profile.fields) {
    for (const alias of field.aliases) {
      fieldsByAlias.set(normalizeColumnKey(alias), field);
    }
  }

  const columnsByField = new Map<string, MarkdownTableColumn>();
  const consumedColumns: CanvasMarkdownConsumedColumn[] = [];
  const resourceColumns: MarkdownTableColumn[] = [];
  const consumedColumnIds = new Set<string>();

  for (const column of table.columns) {
    const field = fieldsByAlias.get(normalizeColumnKey(column.label));
    if (!field) {
      continue;
    }
    consumedColumnIds.add(column.id);
    consumedColumns.push({
      fieldId: field.fieldId,
      columnId: column.id,
      label: column.label,
      ...(field.role ? { role: field.role } : {}),
      ...(field.valueType ? { valueType: field.valueType } : {}),
    });
    if (!columnsByField.has(field.fieldId)) {
      columnsByField.set(field.fieldId, column);
    }
    if (field.resourceColumn) {
      resourceColumns.push(column);
    }
  }

  return {
    columnsByField,
    consumedColumns,
    resourceColumns,
    unknownColumns: table.columns.filter((column) => !consumedColumnIds.has(column.id)),
  };
}

function validateTableProfile(
  profile: CanvasMarkdownTableProfileDescriptor,
  table: MarkdownTable,
  phase: CanvasMarkdownTableProfilePhase,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  const diagnostics: CanvasMarkdownCapabilityDiagnostic[] = [];
  for (const rule of profile.validationRules) {
    if (!rule.phases.includes(phase)) {
      continue;
    }
    const hasRequiredGroup = rule.fieldIds.some((fieldId) =>
      profileColumns.columnsByField.has(fieldId),
    );
    if (!hasRequiredGroup) {
      diagnostics.push(createCanvasMarkdownDiagnostic(rule.severity, rule.code, rule.message));
    }
  }

  if (profile.unknownColumnPolicy === 'reject') {
    for (const column of profileColumns.unknownColumns) {
      diagnostics.push({
        ...createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-table-profile-unknown-column',
          `Canvas Markdown table profile "${profile.profileId}" does not accept column "${column.label}".`,
          column.id,
        ),
        line: table.startLine,
      });
    }
  }

  return diagnostics;
}

function validateOperationProfileMatch(
  input: CanvasMarkdownCapabilityInput & { markdown: string },
  profile: CanvasMarkdownTableProfileDescriptor,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  if (!input.operationHint || (profile.creative && profile.profileId === 'storyboard')) {
    return [];
  }

  return [
    createCanvasMarkdownDiagnostic(
      'error',
      'canvas-markdown-operation-profile-mismatch',
      `Operation hint "${input.operationHint}" requires the storyboard creative table profile.`,
      'operationHint',
    ),
  ];
}

function validateOperationRequiredFields(
  input: CanvasMarkdownCapabilityInput & { markdown: string },
  profile: CanvasMarkdownTableProfileDescriptor,
  table: MarkdownTable,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  severity: CanvasMarkdownCapabilityDiagnostic['severity'],
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  if (!input.operationHint || !profile.creative) {
    return [];
  }

  const requirement = getCreativeTableOperationRequirement(
    STORYBOARD_CREATIVE_TABLE_PROFILE,
    input.operationHint,
  );
  if (!requirement) {
    throw new Error(`Unsupported Canvas Markdown operation hint "${input.operationHint}".`);
  }

  return requirement.requiredFieldIds
    .filter((fieldId) => !hasOperationRequiredFieldValue(table, profileColumns, fieldId))
    .map((fieldId) =>
      createCanvasMarkdownDiagnostic(
        severity,
        'canvas-markdown-operation-required-field-missing',
        `Operation "${requirement.operationId}" requires storyboard field "${fieldId}" with at least one non-empty value.`,
        fieldId,
      ),
    );
}

function hasOperationRequiredFieldValue(
  table: MarkdownTable,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  fieldId: string,
): boolean {
  const column = profileColumns.columnsByField.get(fieldId);
  return Boolean(column && table.rows.some((row) => getCell(row, column).length > 0));
}

function createTableNodeData(
  input: CanvasMarkdownCapabilityInput & { markdown: string },
  table: MarkdownTable,
  resourceBindings: ResourceBindingResult,
  profile: CanvasMarkdownTableProfileDescriptor,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  metadata: {
    readonly resolvedKind: CanvasMarkdownResolvedKind;
    readonly displayFallback: boolean;
    readonly label?: string;
  },
): Record<string, unknown> {
  const columns: TableColumnDef[] = table.columns.map((column) => ({
    id: column.id,
    label: column.label,
    width: TABLE_COLUMN_WIDTH,
  }));
  return {
    label:
      metadata.label ??
      ('tableTitle' in input ? (input.tableTitle ?? input.title) : input.title) ??
      profile.displayName,
    columns,
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    showHeader: true,
    markdown: createTableMarkdownMetadata(input, table, resourceBindings, profile, profileColumns, {
      resolvedKind: metadata.resolvedKind,
      displayFallback: metadata.displayFallback,
    }),
  };
}

function createTableMarkdownMetadata(
  input: CanvasMarkdownCapabilityInput & { markdown: string },
  table: MarkdownTable,
  resourceBindings: ResourceBindingResult,
  profile: CanvasMarkdownTableProfileDescriptor,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  metadata: {
    readonly resolvedKind: CanvasMarkdownResolvedKind;
    readonly displayFallback: boolean;
  },
): CanvasSerializableRecord {
  const profileHint = 'profileHint' in input ? input.profileHint : undefined;
  return {
    sourceFormat: input.sourceFormat ?? 'markdown',
    markdown: input.markdown,
    resolvedKind: metadata.resolvedKind,
    tableProfile: profile.profileId,
    profileHint: profileHint ?? profile.profileId,
    reviewKind: profile.reviewKind,
    creative: profile.creative,
    displayFallback: metadata.displayFallback,
    unknownColumnPolicy: profile.unknownColumnPolicy,
    columns: table.columns.map((column) => ({ id: column.id, label: column.label })),
    consumedColumns: profileColumns.consumedColumns.map((column) => ({
      fieldId: column.fieldId,
      columnId: column.columnId,
      label: column.label,
      ...(column.role ? { role: column.role } : {}),
      ...(column.valueType ? { valueType: column.valueType } : {}),
    })),
    unknownColumns: profileColumns.unknownColumns.map((column) => ({
      id: column.id,
      label: column.label,
    })),
    resourceColumns: profileColumns.resourceColumns.map((column) => ({
      id: column.id,
      label: column.label,
    })),
    rows: table.rows.map((row) => ({
      rowIndex: row.rowIndex,
      line: row.line,
      cells: row.cells,
    })),
    resources: resourceBindings.bindings.map((binding) => ({
      token: binding.token,
      status: binding.status,
      ...(binding.resource ? { resource: serializeResourceRef(binding.resource) } : {}),
    })),
    diagnostics: resourceBindings.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.token ? { token: diagnostic.token } : {}),
      ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
      ...(diagnostic.fieldKey ? { fieldKey: diagnostic.fieldKey } : {}),
    })),
  };
}

function buildStoryboardProductionRequest(
  input: CanvasMarkdownCapabilityInput & { markdown: string; title?: string },
  table: MarkdownTable,
  profile: CanvasMarkdownTableProfileDescriptor,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): {
  readonly request?: CanvasCreateCompositeRequest;
  readonly diagnostics: readonly CanvasMarkdownCapabilityDiagnostic[];
} {
  const diagnostics = [
    ...validateTableProfile(profile, table, 'apply', profileColumns),
    ...validateOperationRequiredFields(input, profile, table, profileColumns, 'error'),
  ];
  const visualColumn = getStoryboardProductionContentColumn(profileColumns);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || !visualColumn) {
    return { diagnostics };
  }

  const sceneColumn = profileColumns.columnsByField.get('scene');
  const shotColumn = profileColumns.columnsByField.get('shot');
  const imagePromptColumn =
    profileColumns.columnsByField.get('imagePrompt') ?? profileColumns.columnsByField.get('prompt');
  const motionColumn = profileColumns.columnsByField.get('motion');
  const durationColumn = profileColumns.columnsByField.get('duration');
  const characterColumn = profileColumns.columnsByField.get('characters');
  const dialogueColumn = profileColumns.columnsByField.get('dialogue');
  const firstSceneTitle = sceneColumn ? getCell(table.rows[0], sceneColumn) : undefined;
  const sceneTitle = firstSceneTitle || input.title || 'Storyboard';
  const productionRows = table.rows.filter((row) =>
    shouldCreateStoryboardShot(row, profileColumns),
  );
  if (productionRows.length === 0) {
    return {
      diagnostics: [
        ...diagnostics,
        createCanvasMarkdownDiagnostic(
          'error',
          'canvas-markdown-storyboard-no-production-rows',
          'Production storyboard creation requires at least one row whose decision is not skip, reference-only, or duplicate.',
          'decision',
        ),
      ],
    };
  }
  const scenePromptSlots = uniquePromptSlots(
    productionRows.flatMap((row) =>
      extractPromptSlots(row, profileColumns, 'scene', input.operationHint),
    ),
  );

  return {
    request: {
      containerType: 'scene',
      containerPreset: 'scene.basic',
      position: input.target?.insertionPoint ?? { x: 0, y: 0 },
      data: {
        sceneTitle,
        sceneNumber: 1,
        markdownSource: input.markdown,
        ...(scenePromptSlots.length > 0 ? { promptSlots: scenePromptSlots } : {}),
      },
      autoLayout: true,
      children: productionRows.map((row, index) => {
        const visual = getCell(row, visualColumn);
        const prompt = imagePromptColumn ? getCell(row, imagePromptColumn) : undefined;
        const promptSlots = uniquePromptSlots(
          extractPromptSlots(row, profileColumns, 'shot', input.operationHint).filter((slot) =>
            shouldKeepShotPromptSlot(slot),
          ),
        );
        const characters = characterColumn
          ? parseCharacters(getCell(row, characterColumn))
          : undefined;
        return {
          type: 'shot' as const,
          preset: 'shot.basic',
          data: {
            shotNumber: parseShotNumber(shotColumn ? getCell(row, shotColumn) : undefined, index),
            duration: parseDurationSeconds(
              durationColumn ? getCell(row, durationColumn) : undefined,
            ),
            visualDescription: visual,
            characterAction: motionColumn ? (getCell(row, motionColumn) ?? visual) : visual,
            ...(prompt ? { generationPrompt: prompt } : {}),
            ...(promptSlots.length > 0 ? { promptSlots } : {}),
            ...(motionColumn
              ? { cameraMovement: normalizeCameraMovement(getCell(row, motionColumn)) }
              : {}),
            ...(characters && characters.length > 0 ? { characters } : {}),
            ...(dialogueColumn ? { dialogue: getCell(row, dialogueColumn) } : {}),
            sceneTags: sceneColumn ? [getCell(row, sceneColumn)].filter(Boolean) : [],
          },
        };
      }),
    },
    diagnostics,
  };
}

function getStoryboardProductionContentColumn(
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): MarkdownTableColumn | undefined {
  const visualColumn = profileColumns.columnsByField.get('visual');
  if (visualColumn) {
    return visualColumn;
  }
  for (const fieldId of STORYBOARD_PROMPT_SLOT_FIELD_IDS) {
    const column = profileColumns.columnsByField.get(fieldId);
    if (column) {
      return column;
    }
  }
  return undefined;
}

function shouldCreateStoryboardShot(
  row: MarkdownTableRow,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): boolean {
  const decisionColumn = profileColumns.columnsByField.get('decision');
  const decision = decisionColumn ? getCell(row, decisionColumn).trim().toLowerCase() : '';
  return decision !== 'skip' && decision !== 'reference-only' && decision !== 'duplicate';
}

function extractPromptSlots(
  row: MarkdownTableRow,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  scope: 'shot' | 'scene',
  operationHint: CanvasMarkdownCapabilityInput['operationHint'] | undefined,
): readonly CanvasCreativePromptSlot[] {
  const slots: CanvasCreativePromptSlot[] = [];
  for (const consumed of profileColumns.consumedColumns) {
    const descriptor = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === consumed.fieldId,
    );
    if (!descriptor?.promptSlot) continue;
    const promptSlotContext = resolvePromptSlotContext(descriptor.promptSlot, operationHint);
    if (promptSlotContext.scope !== scope) continue;
    const prompt = row.cells[consumed.columnId]?.trim() ?? '';
    if (!prompt) continue;
    slots.push({
      fieldId: consumed.fieldId,
      scope: promptSlotContext.scope,
      mediaType: promptSlotContext.mediaType,
      operation: promptSlotContext.operation,
      prompt,
    });
  }
  return slots;
}

function shouldKeepShotPromptSlot(promptSlot: CanvasCreativePromptSlot): boolean {
  if (promptSlot.fieldId !== 'imagePrompt' && promptSlot.fieldId !== 'prompt') {
    return true;
  }
  return promptSlot.operation !== 'generate';
}

function resolvePromptSlotContext(
  descriptor: CreativeTableFieldDescriptor['promptSlot'],
  operationHint: CanvasMarkdownCapabilityInput['operationHint'] | undefined,
): Pick<CanvasCreativePromptSlot, 'scope' | 'mediaType' | 'operation'> {
  if (!descriptor) {
    throw new Error('Prompt slot context requires a descriptor.');
  }
  const operationContext = parseOperationHint(operationHint);
  if (operationContext && operationContext.mediaType === descriptor.mediaType) {
    return operationContext;
  }
  return descriptor;
}

function parseOperationHint(
  operationHint: CanvasMarkdownCapabilityInput['operationHint'] | undefined,
): Pick<CanvasCreativePromptSlot, 'scope' | 'mediaType' | 'operation'> | undefined {
  if (!operationHint) return undefined;
  const [mediaType, scope, operation] = operationHint.split('.');
  if (isPromptMediaType(mediaType) && isPromptScope(scope) && isPromptOperation(operation)) {
    return { mediaType, scope, operation };
  }
  throw new Error(`Unsupported Canvas Markdown operation hint "${operationHint}".`);
}

function isPromptMediaType(
  value: string | undefined,
): value is CanvasCreativePromptSlot['mediaType'] {
  return value === 'image' || value === 'video' || value === 'audio';
}

function isPromptScope(value: string | undefined): value is CanvasCreativePromptSlot['scope'] {
  return value === 'shot' || value === 'scene';
}

function isPromptOperation(
  value: string | undefined,
): value is CanvasCreativePromptSlot['operation'] {
  return value === 'generate' || value === 'edit';
}

function uniquePromptSlots(
  promptSlots: readonly CanvasCreativePromptSlot[],
): readonly CanvasCreativePromptSlot[] {
  const seen = new Set<string>();
  const unique: CanvasCreativePromptSlot[] = [];
  for (const promptSlot of promptSlots) {
    const key = [
      promptSlot.fieldId,
      promptSlot.scope,
      promptSlot.mediaType,
      promptSlot.operation,
      promptSlot.prompt,
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(promptSlot);
  }
  return unique;
}

function getCell(
  row: MarkdownTableRow | undefined,
  column: MarkdownTableColumn | undefined,
): string {
  if (!row || !column) return '';
  return row.cells[column.id]?.trim() ?? '';
}

function parseShotNumber(value: string | undefined, rowIndex: number): number {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : rowIndex + 1;
}

function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 3;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 3;
  const seconds = Number(match[0]);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 3;
}

function parseCharacters(value: string | undefined): readonly { characterName: string }[] {
  if (!value) return [];
  return value
    .split(/[,，、/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((characterName) => ({ characterName }));
}

function normalizeCameraMovement(value: string): string | undefined {
  const key = value.trim().toLowerCase();
  if (key.includes('pan') || key.includes('摇')) return 'pan';
  if (key.includes('tilt') || key.includes('俯仰')) return 'tilt';
  if (key.includes('zoom in') || key.includes('推进')) return 'zoom-in';
  if (key.includes('zoom out') || key.includes('拉远')) return 'zoom-out';
  if (key.includes('dolly')) return 'dolly';
  if (key.includes('handheld') || key.includes('手持')) return 'handheld';
  if (key.includes('crane') || key.includes('升降')) return 'crane';
  if (key.includes('static') || key.includes('固定')) return 'static';
  return undefined;
}

function bindResources(
  table: MarkdownTable,
  resources: readonly CanvasMarkdownResourceRef[],
  resourceColumns: readonly MarkdownTableColumn[],
): ResourceBindingResult {
  const resourcesByToken = createResourceMap(resources);
  const tokens = extractResourceTokens(table, resourceColumns);
  const diagnostics: CanvasMarkdownCapabilityDiagnostic[] = [];
  const bindings = tokens.map((token): ResourceBindingSummary => {
    const candidates = resourcesByToken.get(normalizeResourceToken(token)) ?? [];
    if (candidates.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'canvas-markdown-missing-resource-token',
        message: `Markdown resource token "${token}" does not match a known resource.`,
        token,
      });
      return { token, status: 'missing' };
    }
    if (candidates.length > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'canvas-markdown-ambiguous-resource-token',
        message: `Markdown resource token "${token}" matches multiple resources.`,
        token,
        candidates: candidates.map(createSafeResourceCandidateSummary),
      });
      return { token, status: 'ambiguous' };
    }
    const resource = candidates[0];
    if (!resource) {
      return { token, status: 'missing' };
    }
    return { token, status: 'bound', resource };
  });
  return { bindings, diagnostics };
}

function createResourceMap(
  resources: readonly CanvasMarkdownResourceRef[],
): ReadonlyMap<string, readonly CanvasMarkdownResourceRef[]> {
  const map = new Map<string, CanvasMarkdownResourceRef[]>();
  for (const resource of resources) {
    for (const token of resourceLookupTokens(resource)) {
      const key = normalizeResourceToken(token);
      map.set(key, [...(map.get(key) ?? []), resource]);
    }
  }
  return map;
}

function createSafeResourceCandidateSummary(
  resource: CanvasMarkdownResourceRef,
): CanvasMarkdownCapabilityResourceCandidate {
  return {
    ...(resource.label ? { label: resource.label } : {}),
    ...(resource.role ? { role: resource.role } : {}),
    ...(resource.token ? { token: resource.token } : {}),
    ...(resource.label ? { sourceTitle: resource.label } : {}),
  };
}

function resourceLookupTokens(resource: CanvasMarkdownResourceRef): readonly string[] {
  const tokens = [
    resource.token,
    resource.label,
    resource.sourcePath,
    resource.sourcePath ? resource.sourcePath.split(/[\\/]/).pop() : undefined,
    resource.resourceRef?.id,
    resource.documentResourceRef?.entryPath,
    resource.documentResourceRef?.entryPath.split(/[\\/]/).pop(),
  ];
  return uniqueStrings(tokens.filter(isNonEmptyString));
}

function extractResourceTokens(
  table: MarkdownTable,
  resourceColumns: readonly MarkdownTableColumn[],
): readonly string[] {
  const tokens: string[] = [];
  for (const row of table.rows) {
    for (const column of resourceColumns) {
      const value = getCell(row, column);
      tokens.push(...extractResourceTokensFromCell(value));
    }
  }
  return uniqueStrings(tokens);
}

function extractResourceTokensFromCell(value: string): readonly string[] {
  const tokens: string[] = [];
  for (const match of value.matchAll(COMMONMARK_IMAGE_RE)) {
    if (match[1]) {
      tokens.push(stripMarkdownToken(match[1]));
    }
  }
  const valueWithoutImages = value.replace(COMMONMARK_IMAGE_RE, ' ');
  for (const rawToken of valueWithoutImages.split(RESOURCE_TOKEN_SPLIT_RE)) {
    const token = normalizeResourceCellToken(rawToken);
    if (token && isAllowedResourceCellToken(token) && !isIgnoredResourceWord(token)) {
      tokens.push(token);
    }
  }
  return uniqueStrings(tokens);
}

function normalizeResourceCellToken(value: string): string {
  return stripMarkdownToken(value)
    .replace(/^["'([{<]+|[>"'\])}.。!?！？]+$/g, '')
    .replace(/#.+$/, '');
}

function isAllowedResourceCellToken(value: string): boolean {
  return RESOURCE_TOKEN_ALLOWED_RE.test(value) && !isRuntimeOnlyCanvasMarkdownResourceValue(value);
}

function stripMarkdownToken(value: string): string {
  return value.trim().replace(/^`+|`+$/g, '');
}

function normalizeResourceToken(value: string): string {
  return stripMarkdownToken(value).toLowerCase();
}

function isIgnoredResourceWord(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === 'image' ||
    normalized === 'asset' ||
    normalized === 'resource' ||
    normalized === 'http' ||
    normalized === 'https'
  );
}

function createTablePreview(
  input: CanvasMarkdownCapabilityInput & { title?: string },
  table: MarkdownTable | undefined,
  bindings: readonly ResourceBindingSummary[],
  metadata?: {
    readonly resolvedKind?: CanvasMarkdownResolvedKind;
    readonly profile?: CanvasMarkdownTableProfileDescriptor;
    readonly profileColumns?: CanvasMarkdownResolvedTableProfileColumns;
    readonly displayFallback?: boolean;
  },
): CanvasMarkdownCapabilityPreviewSummary {
  return {
    title: input.title,
    tableCount: table ? 1 : 0,
    rowCount: table?.rows.length ?? 0,
    resourceTokenCount: bindings.length,
    unresolvedResourceTokenCount: bindings.filter((binding) => binding.status !== 'bound').length,
    ...(metadata?.resolvedKind ? { resolvedKind: metadata.resolvedKind } : {}),
    ...(metadata?.profile ? { profileId: metadata.profile.profileId } : {}),
    ...(metadata?.displayFallback !== undefined
      ? { displayFallback: metadata.displayFallback }
      : {}),
    ...(metadata?.profile && metadata.profileColumns
      ? {
          table: {
            profileId: metadata.profile.profileId,
            displayName: metadata.profile.displayName,
            reviewKind: metadata.profile.reviewKind,
            consumedColumns: metadata.profileColumns.consumedColumns,
            unknownColumns: metadata.profileColumns.unknownColumns.map((column) => ({
              id: column.id,
              label: column.label,
            })),
          },
        }
      : {}),
  };
}

function toResolvedTableKind(
  profile: CanvasMarkdownTableProfileDescriptor,
  displayFallback: boolean | undefined,
): CanvasMarkdownResolvedKind {
  return profile.creative && !displayFallback ? 'creative-table' : 'generic-table';
}

function createResourceAttachmentData(
  resource: CanvasMarkdownResourceRef,
  role: string | undefined,
): Record<string, unknown> | undefined {
  if (isResourceRef(resource.resourceRef)) {
    return {
      referenceResourceRef: resource.resourceRef,
      resourceRef: resource.resourceRef,
      markdownResourceRole: role ?? resource.role,
      markdownResourceToken: resource.token,
    };
  }
  if (resource.documentResourceRef) {
    return {
      referenceImageResourceRef: resource.documentResourceRef,
      documentResourceRef: resource.documentResourceRef,
      markdownResourceRole: role ?? resource.role,
      markdownResourceToken: resource.token,
    };
  }
  if (resource.sourcePath) {
    return {
      referenceImagePath: resource.sourcePath,
      markdownResourceRole: role ?? resource.role,
      markdownResourceToken: resource.token,
    };
  }
  return undefined;
}

function serializeResourceRef(resource: CanvasMarkdownResourceRef): CanvasSerializableRecord {
  return toCanvasSerializableRecord({
    token: resource.token,
    label: resource.label,
    role: resource.role,
    sourcePath: resource.sourcePath,
    resourceRef: resource.resourceRef,
    documentResourceRef: resource.documentResourceRef,
  });
}

function countNonEmptyMarkdownLines(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toCanvasSerializableRecord(value: Record<string, unknown>): CanvasSerializableRecord {
  const record: CanvasSerializableRecord = {};
  for (const [key, item] of Object.entries(value)) {
    const serializable = toCanvasSerializableValue(item);
    if (serializable !== undefined) {
      record[key] = serializable;
    }
  }
  return record;
}

function toCanvasSerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toCanvasSerializableValue(item) ?? null);
  }
  if (isRecord(value)) {
    return toCanvasSerializableRecord(value);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
