# Creative Table Profile And Prompt Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify storyboard creative table fields across Skill prompts, Agent validation/Webview handoff, and Canvas ingest while supporting open review fields, model-aware prompt slots, and trusted execution actions.

**Architecture:** Add a shared Creative Table profile descriptor in `@neko/shared` as the single field/alias/role/prompt-slot source of truth. Agent and Webview consume the descriptor for validation and handoff hints; Canvas imports the same descriptor but remains the authority for table parsing, resource binding, node creation, lifecycle actions, and execution approval. Prompt fields become provider-neutral slots keyed by scope, media type, and operation, so image generation/editing and video generation/editing can evolve without hardcoding one `prompt` column.

**Tech Stack:** TypeScript, React 18, Vitest, Vite, VS Code Webview postMessage, Canvas Markdown lifecycle capabilities.

---

## Scope

This plan intentionally covers one vertical slice:

- Shared Creative Table descriptor and tests.
- Storyboard profile conversion from fixed 18 required columns to profile-driven known fields plus open review metadata.
- Agent validator/handoff behavior.
- Agent Webview Markdown display behavior.
- Canvas Markdown ingest profile alignment, row gating, and prompt slot preservation.
- Skill prompt updates in Chinese and English.

This plan does not implement provider-specific Seedance API calls. It adds neutral prompt slot and operation requirement plumbing so later provider adapters can compile `sceneVideoPrompt`, `shotVideoPrompt`, `imagePrompt`, or edit prompts into model-specific requests.

## File Structure

- Create `packages/neko-types/src/types/creative-table-profile.ts`
  - Owns profile descriptor types, prompt slot types, storyboard profile data, alias normalization, field resolution, profile classification, and operation requirement helpers.
- Create `packages/neko-types/src/types/__tests__/creative-table-profile.test.ts`
  - Tests open review fields, localized aliases, prompt slots, operation requirements, and execution action separation.
- Modify `packages/neko-types/src/types/index.ts`
  - Exports the shared Creative Table descriptor.
- Modify `packages/neko-types/src/types/canvas-markdown-capabilities.ts`
  - Allows optional `operationHint` in Canvas Markdown inputs and reuses shared creative role/value types where compatible.
- Modify `packages/neko-types/src/types/canvas.ts`
  - Adds optional prompt slot metadata to shot and scene nodes.
- Modify `packages/neko-agent/packages/agent-types/src/creative-table-contract.ts`
  - Re-exports storyboard profile data from `@neko/shared` and keeps compatibility names.
- Modify `packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts`
  - Replaces fixed 18-column validation with profile-driven validation.
- Modify `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`
  - Updates expectations for open review fields and prompt slots.
- Modify `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx`
  - Preserves original Markdown table headers instead of translating them.
- Modify `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx`
  - Verifies original header text is preserved.
- Modify `packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts`
  - Uses shared profile classification instead of requiring all recommended storyboard columns.
- Modify `packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts`
  - Tests profile-driven handoff for localized fields, prompt slots, and dynamic review extensions.
- Modify `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`
  - Builds Canvas storyboard profile fields from the shared descriptor, recognizes prompt slots, treats `nextAction` as plan text, preserves unknown columns, filters non-production rows, and preserves prompt slots in node metadata.
- Modify `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`
  - Tests descriptor alignment, localized aliases, prompt slots, skip/reference-only row gating, and operation-specific validation.
- Modify `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.zh-cn.md`
  - Updates Chinese Skill guidance to open review fields and explicit prompt slots.
- Modify `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.md`
  - Mirrors the English Skill guidance.
- Modify `packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.zh-cn.md`
  - Uses the same prompt slot vocabulary.
- Modify `packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.md`
  - Mirrors the English prompt slot vocabulary.

## Contract Decisions

- Review fields are open. Known approval fields get roles, labels, and validation; unknown columns are preserved as review metadata.
- Plan fields are open for display, but only descriptor-declared fields get production semantics.
- Execution fields are closed. Runnable controls come from trusted Canvas lifecycle actions, not model text in `nextAction`.
- `prompt` remains a legacy alias for shot image/keyframe prompt. New Skill output should prefer `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, and `sceneVideoPrompt`.
- Webview Markdown rendering preserves the Agent output language. It does not translate raw Markdown headers.
- Model/capability-specific required fields are driven by optional `operationHint`; without an operation hint, review ingest should not require all prompt slots.

---

### Task 1: Add Shared Creative Table Profile Descriptor

**Files:**
- Create: `packages/neko-types/src/types/creative-table-profile.ts`
- Create: `packages/neko-types/src/types/__tests__/creative-table-profile.test.ts`
- Modify: `packages/neko-types/src/types/index.ts`

- [ ] **Step 1: Write the failing shared descriptor tests**

Create `packages/neko-types/src/types/__tests__/creative-table-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  classifyCreativeTableHeaders,
  getCreativeTableOperationRequirement,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
} from '../creative-table-profile';

describe('creative table profile descriptor', () => {
  it('resolves localized storyboard aliases to stable field ids', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '建议操作')?.id).toBe(
      'nextAction',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '来源分格')?.id).toBe(
      'sourcePanel',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '视频提示词')?.id).toBe(
      'shotVideoPrompt',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, '场景视频提示词')?.id).toBe(
      'sceneVideoPrompt',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'custom review')?.id).toBe(
      undefined,
    );
  });

  it('keeps review fields open while classifying known storyboard fields', () => {
    const result = classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, [
      '场景',
      '镜头',
      '来源',
      '画面',
      '图像提示词',
      '自定义审阅列',
    ]);

    expect(result.matchedProfile).toBe(true);
    expect(result.knownFields.map((field) => field.id)).toEqual([
      'scene',
      'shot',
      'source',
      'visual',
      'imagePrompt',
    ]);
    expect(result.unknownHeaders).toEqual(['自定义审阅列']);
  });

  it('declares prompt slots by scope, media type, and operation', () => {
    const imagePrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'imagePrompt',
    );
    const sceneVideoPrompt = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === 'sceneVideoPrompt',
    );

    expect(imagePrompt?.promptSlot).toEqual({
      scope: 'shot',
      mediaType: 'image',
      operation: 'generate',
    });
    expect(sceneVideoPrompt?.promptSlot).toEqual({
      scope: 'scene',
      mediaType: 'video',
      operation: 'generate',
    });
  });

  it('keeps nextAction as plan text and actionId as execution', () => {
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'nextAction')?.role).toBe(
      'plan',
    );
    expect(resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, 'actionId')?.role).toBe(
      'execution',
    );
  });

  it('returns operation-specific requirements only when requested', () => {
    expect(
      getCreativeTableOperationRequirement(STORYBOARD_CREATIVE_TABLE_PROFILE, 'video.scene.generate'),
    ).toEqual({
      operationId: 'video.scene.generate',
      label: 'Generate scene video',
      requiredFieldIds: ['sceneVideoPrompt'],
      acceptedPromptFieldIds: ['sceneVideoPrompt', 'shotVideoPrompt'],
    });
    expect(
      getCreativeTableOperationRequirement(STORYBOARD_CREATIVE_TABLE_PROFILE, 'image.shot.edit')
        ?.requiredFieldIds,
    ).toEqual(['imageEditPrompt']);
  });

  it('normalizes headers consistently with existing storyboard behavior', () => {
    expect(normalizeCreativeTableHeader('Source Panel')).toBe('sourcepanel');
    expect(normalizeCreativeTableHeader('source_panel')).toBe('sourcepanel');
    expect(STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS).toContain('imagePrompt');
  });
});
```

- [ ] **Step 2: Run the new shared test and verify it fails**

Run:

```bash
pnpm --filter @neko/shared exec vitest run src/types/__tests__/creative-table-profile.test.ts
```

Expected: FAIL because `../creative-table-profile` does not exist.

- [ ] **Step 3: Add the shared descriptor implementation**

Create `packages/neko-types/src/types/creative-table-profile.ts`:

```ts
export const CREATIVE_TABLE_FIELD_ROLES = ['approval', 'plan', 'execution'] as const;

export type CreativeTableFieldRole = (typeof CREATIVE_TABLE_FIELD_ROLES)[number];

export const CREATIVE_TABLE_VALUE_TYPES = [
  'text',
  'number',
  'duration',
  'boolean',
  'enum',
  'resource-token',
  'prompt',
  'action',
  'status',
  'result-ref',
] as const;

export type CreativeTableValueType = (typeof CREATIVE_TABLE_VALUE_TYPES)[number];

export const CREATIVE_TABLE_PROMPT_SCOPES = ['shot', 'scene'] as const;

export type CreativeTablePromptScope = (typeof CREATIVE_TABLE_PROMPT_SCOPES)[number];

export const CREATIVE_TABLE_PROMPT_MEDIA_TYPES = ['image', 'video', 'audio'] as const;

export type CreativeTablePromptMediaType = (typeof CREATIVE_TABLE_PROMPT_MEDIA_TYPES)[number];

export const CREATIVE_TABLE_PROMPT_OPERATIONS = ['generate', 'edit'] as const;

export type CreativeTablePromptOperation = (typeof CREATIVE_TABLE_PROMPT_OPERATIONS)[number];

export interface CreativeTableFieldLabel {
  readonly en: string;
  readonly 'zh-cn': string;
}

export interface CreativeTablePromptSlotDescriptor {
  readonly scope: CreativeTablePromptScope;
  readonly mediaType: CreativeTablePromptMediaType;
  readonly operation: CreativeTablePromptOperation;
}

export interface CreativeTableProductionMapping {
  readonly target:
    | 'shot.generationPrompt'
    | 'shot.promptSlots'
    | 'scene.promptSlots'
    | 'review.metadata'
    | 'none';
}

export interface CreativeTableFieldDescriptor {
  readonly id: string;
  readonly role: CreativeTableFieldRole;
  readonly valueType: CreativeTableValueType;
  readonly labels: CreativeTableFieldLabel;
  readonly aliases: readonly string[];
  readonly promptSlot?: CreativeTablePromptSlotDescriptor;
  readonly enumValues?: readonly string[];
  readonly resourceColumn?: boolean;
  readonly productionMapping?: CreativeTableProductionMapping;
}

export interface CreativeTableOperationRequirement {
  readonly operationId:
    | 'image.shot.generate'
    | 'image.shot.edit'
    | 'video.shot.generate'
    | 'video.shot.edit'
    | 'video.scene.generate'
    | 'video.scene.edit';
  readonly label: string;
  readonly requiredFieldIds: readonly string[];
  readonly acceptedPromptFieldIds: readonly string[];
}

export interface CreativeTableProfileDescriptor {
  readonly profileId: string;
  readonly aliases: readonly string[];
  readonly displayName: string;
  readonly reviewKind: string;
  readonly unknownColumnPolicy: 'preserve' | 'reject';
  readonly recommendedHeaders: readonly string[];
  readonly minimumFieldGroups: readonly (readonly string[])[];
  readonly fields: readonly CreativeTableFieldDescriptor[];
  readonly operationRequirements: readonly CreativeTableOperationRequirement[];
}

export interface CreativeTableHeaderClassification {
  readonly matchedProfile: boolean;
  readonly knownFields: readonly CreativeTableFieldDescriptor[];
  readonly unknownHeaders: readonly string[];
  readonly missingMinimumGroups: readonly (readonly string[])[];
}

const STORYBOARD_DECISION_VALUES = [
  'keep',
  'skip',
  'merge',
  'split',
  'duplicate',
  'reference-only',
] as const;

const STORYBOARD_REVIEW_STATUS_VALUES = [
  'needs-review',
  'needs-panel-analysis',
  'needs-resource-binding',
  'needs-prompt',
  'approved',
  'rejected',
] as const;

export const STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS = [
  'scene',
  'shot',
  'source',
  'sourcePanel',
  'decision',
  'duration',
  'visual',
  'motion',
  'audio',
  'characters',
  'dialogue',
  'imagePrompt',
  'imageEditPrompt',
  'shotVideoPrompt',
  'sceneVideoPrompt',
  'reviewStatus',
  'nextAction',
  'contentType',
  'decisionReason',
  'requiresSplit',
  'duplicateOf',
] as const;

export const STORYBOARD_CREATIVE_TABLE_PROFILE: CreativeTableProfileDescriptor = {
  profileId: 'storyboard',
  aliases: [
    'storyboard',
    'storyboard-draft',
    'markdown-storyboard-draft',
    'canvas.tableProfile.storyboard-draft',
    'creative-table.storyboard',
  ],
  displayName: 'Storyboard',
  reviewKind: 'storyboard',
  unknownColumnPolicy: 'preserve',
  recommendedHeaders: STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  minimumFieldGroups: [
    ['scene', 'shot'],
    ['visual', 'source', 'imagePrompt', 'prompt', 'shotVideoPrompt', 'sceneVideoPrompt'],
  ],
  operationRequirements: [
    {
      operationId: 'image.shot.generate',
      label: 'Generate shot image',
      requiredFieldIds: ['imagePrompt'],
      acceptedPromptFieldIds: ['imagePrompt', 'prompt'],
    },
    {
      operationId: 'image.shot.edit',
      label: 'Edit shot image',
      requiredFieldIds: ['imageEditPrompt'],
      acceptedPromptFieldIds: ['imageEditPrompt'],
    },
    {
      operationId: 'video.shot.generate',
      label: 'Generate shot video',
      requiredFieldIds: ['shotVideoPrompt'],
      acceptedPromptFieldIds: ['shotVideoPrompt', 'sceneVideoPrompt'],
    },
    {
      operationId: 'video.shot.edit',
      label: 'Edit shot video',
      requiredFieldIds: ['videoEditPrompt'],
      acceptedPromptFieldIds: ['videoEditPrompt'],
    },
    {
      operationId: 'video.scene.generate',
      label: 'Generate scene video',
      requiredFieldIds: ['sceneVideoPrompt'],
      acceptedPromptFieldIds: ['sceneVideoPrompt', 'shotVideoPrompt'],
    },
    {
      operationId: 'video.scene.edit',
      label: 'Edit scene video',
      requiredFieldIds: ['videoEditPrompt'],
      acceptedPromptFieldIds: ['videoEditPrompt', 'sceneVideoPrompt'],
    },
  ],
  fields: [
    approvalField('scene', 'Scene', '场景', ['场景', '场次']),
    approvalField('shot', 'Shot', '镜头', ['shot id', 'shotid', '镜头', '镜头编号', '镜号', '分镜']),
    approvalField('source', 'Source', '来源', [
      'image',
      'images',
      'resource',
      'reference',
      'ref',
      'media',
      '来源',
      '源页',
      '来源页',
      '图片',
      '图像',
      '图像引用',
      '素材',
      '参考图',
    ], { valueType: 'resource-token', resourceColumn: true }),
    approvalField('sourcePanel', 'Source Panel', '来源分格', [
      'source panel',
      'sourcepanel',
      'panel',
      'panel ref',
      'panelref',
      '来源分格',
      '分格',
      '分格位置',
      '对应分格',
      '裁切',
    ]),
    approvalField('decision', 'Decision', '决策', ['keep skip split', '保留决策', '决策', '处理', '画面判断'], {
      valueType: 'enum',
      enumValues: STORYBOARD_DECISION_VALUES,
    }),
    planField('duration', 'Duration', '时长', ['time', 'seconds', '时长', '时长秒', '时长建议'], {
      valueType: 'duration',
    }),
    approvalField('visual', 'Visual', '画面', [
      'visual description',
      'visualdescription',
      'description',
      'content',
      '画面',
      '画面内容',
      '画面描述',
      '视觉',
      '分镜建议',
    ]),
    planField('motion', 'Motion', '运镜', [
      'camera',
      'camera movement',
      'cameramovement',
      '运镜',
      '镜头运动',
      '运动建议',
      '动作与节奏',
    ]),
    approvalField('audio', 'Audio', '音频', ['sound', 'sfx', '音频', '声音', '音效', '声音/氛围', '氛围']),
    approvalField('characters', 'Characters', '人物', ['character', 'cast', '人物', '角色']),
    approvalField('dialogue', 'Dialogue', '对白', ['voiceover', 'voice over', 'text', '台词', '旁白', '对白', '文本/对白']),
    planField('prompt', 'Prompt', '提示词', [
      'generation prompt',
      'generationprompt',
      'visual prompt',
      '提示词',
      '生成提示词',
      '视觉提示词',
      '图像提示词',
      '动画化提示',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'shot', mediaType: 'image', operation: 'generate' },
      productionMapping: { target: 'shot.generationPrompt' },
    }),
    planField('imagePrompt', 'Image Prompt', '图像提示词', [
      'image prompt',
      'keyframe prompt',
      'keyframeprompt',
      '关键帧提示词',
      '图像提示词',
      '图片提示词',
      '生图提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'shot', mediaType: 'image', operation: 'generate' },
      productionMapping: { target: 'shot.generationPrompt' },
    }),
    planField('imageEditPrompt', 'Image Edit Prompt', '图像编辑提示词', [
      'image edit prompt',
      'imageeditprompt',
      'edit prompt',
      'redraw prompt',
      'inpaint prompt',
      '图像编辑提示词',
      '图片编辑提示词',
      '重绘提示词',
      '修图提示词',
      '补绘提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'shot', mediaType: 'image', operation: 'edit' },
      productionMapping: { target: 'shot.promptSlots' },
    }),
    planField('shotVideoPrompt', 'Shot Video Prompt', '镜头视频提示词', [
      'shot video prompt',
      'shotvideoprompt',
      'video prompt',
      'videoprompt',
      '镜头视频提示词',
      '视频提示词',
      '单镜视频提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'shot', mediaType: 'video', operation: 'generate' },
      productionMapping: { target: 'shot.promptSlots' },
    }),
    planField('videoEditPrompt', 'Video Edit Prompt', '视频编辑提示词', [
      'video edit prompt',
      'videoeditprompt',
      '视频编辑提示词',
      '视频重绘提示词',
      '局部视频编辑提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'shot', mediaType: 'video', operation: 'edit' },
      productionMapping: { target: 'shot.promptSlots' },
    }),
    planField('sceneStylePrompt', 'Scene Style Prompt', '场景风格提示词', [
      'scene style prompt',
      'scenestyleprompt',
      'style prompt',
      '场景风格提示词',
      '风格提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'scene', mediaType: 'image', operation: 'generate' },
      productionMapping: { target: 'scene.promptSlots' },
    }),
    planField('sceneVideoPrompt', 'Scene Video Prompt', '场景视频提示词', [
      'scene video prompt',
      'scenevideoprompt',
      '场景视频提示词',
      '整场视频提示词',
      '长视频提示词',
    ], {
      valueType: 'prompt',
      promptSlot: { scope: 'scene', mediaType: 'video', operation: 'generate' },
      productionMapping: { target: 'scene.promptSlots' },
    }),
    planField('sceneDuration', 'Scene Duration', '场景时长', ['scene duration', 'sceneduration', '场景时长', '总时长'], {
      valueType: 'duration',
      productionMapping: { target: 'scene.promptSlots' },
    }),
    approvalField('reviewStatus', 'Review Status', '审阅状态', ['review status', 'reviewstatus', 'status', '审阅状态', '状态'], {
      valueType: 'status',
      enumValues: STORYBOARD_REVIEW_STATUS_VALUES,
    }),
    planField('nextAction', 'Next Action', '建议操作', [
      'next action',
      'nextaction',
      'action',
      'operation',
      '执行',
      '下一步',
      '下一步操作',
      '建议操作',
      '操作',
    ]),
    approvalField('contentType', 'Content Type', '内容类型', ['content type', 'contenttype', 'type', '内容类型', '类型'], {
      valueType: 'enum',
      enumValues: ['story', 'cover', 'metadata', 'reference', 'transition'],
    }),
    planField('decisionReason', 'Decision Reason', '决策理由', ['decision reason', 'decisionreason', 'reason', '决策理由', '原因', '备注']),
    planField('requiresSplit', 'Requires Split', '需要拆分', ['requires split', 'requiressplit', 'split', '需要拆分', '是否拆分', '拆分'], {
      valueType: 'boolean',
    }),
    approvalField('duplicateOf', 'Duplicate Of', '重复来源', ['duplicate of', 'duplicateof', 'duplicate', '重复来源', '重复于', '去重']),
    executionField('actionId', 'Action ID', '动作 ID', ['action id', 'actionid', '可信动作', '动作ID'], {
      valueType: 'action',
    }),
    executionField('resultRef', 'Result Ref', '结果引用', ['result ref', 'resultref', '结果引用', '结果 ref'], {
      valueType: 'result-ref',
    }),
    executionField('executionStatus', 'Execution Status', '执行状态', ['execution status', 'executionstatus', '执行状态'], {
      valueType: 'status',
    }),
  ],
};

export function normalizeCreativeTableHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function resolveCreativeTableField(
  profile: CreativeTableProfileDescriptor,
  header: string,
): CreativeTableFieldDescriptor | undefined {
  const normalized = normalizeCreativeTableHeader(header);
  return profile.fields.find((field) =>
    [field.id, ...field.aliases].some((alias) => normalizeCreativeTableHeader(alias) === normalized),
  );
}

export function classifyCreativeTableHeaders(
  profile: CreativeTableProfileDescriptor,
  headers: readonly string[],
): CreativeTableHeaderClassification {
  const knownFields = headers
    .map((header) => resolveCreativeTableField(profile, header))
    .filter((field): field is CreativeTableFieldDescriptor => Boolean(field));
  const knownIds = new Set(knownFields.map((field) => field.id));
  const unknownHeaders = headers.filter((header) => !resolveCreativeTableField(profile, header));
  const missingMinimumGroups = profile.minimumFieldGroups.filter(
    (group) => !group.some((fieldId) => knownIds.has(fieldId)),
  );
  return {
    matchedProfile: missingMinimumGroups.length === 0,
    knownFields,
    unknownHeaders,
    missingMinimumGroups,
  };
}

export function getCreativeTableOperationRequirement(
  profile: CreativeTableProfileDescriptor,
  operationId: CreativeTableOperationRequirement['operationId'] | undefined,
): CreativeTableOperationRequirement | undefined {
  if (!operationId) return undefined;
  return profile.operationRequirements.find((requirement) => requirement.operationId === operationId);
}

function approvalField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'approval', en, zhCn, aliases, options);
}

function planField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'plan', en, zhCn, aliases, options);
}

function executionField(
  id: string,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>> = {},
): CreativeTableFieldDescriptor {
  return field(id, 'execution', en, zhCn, aliases, options);
}

function field(
  id: string,
  role: CreativeTableFieldRole,
  en: string,
  zhCn: string,
  aliases: readonly string[],
  options: Partial<Omit<CreativeTableFieldDescriptor, 'id' | 'role' | 'labels' | 'aliases'>>,
): CreativeTableFieldDescriptor {
  return {
    id,
    role,
    valueType: options.valueType ?? 'text',
    labels: { en, 'zh-cn': zhCn },
    aliases: [id, ...aliases],
    ...(options.promptSlot ? { promptSlot: options.promptSlot } : {}),
    ...(options.enumValues ? { enumValues: options.enumValues } : {}),
    ...(options.resourceColumn ? { resourceColumn: options.resourceColumn } : {}),
    ...(options.productionMapping ? { productionMapping: options.productionMapping } : {}),
  };
}
```

- [ ] **Step 4: Export the descriptor**

Modify `packages/neko-types/src/types/index.ts` by adding this line near the Canvas/Agent shared type exports:

```ts
export * from './creative-table-profile';
```

- [ ] **Step 5: Run the shared descriptor test and verify it passes**

Run:

```bash
pnpm --filter @neko/shared exec vitest run src/types/__tests__/creative-table-profile.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/neko-types/src/types/creative-table-profile.ts \
  packages/neko-types/src/types/__tests__/creative-table-profile.test.ts \
  packages/neko-types/src/types/index.ts
git commit -m "feat: add creative table profile descriptor"
```

---

### Task 2: Re-Export Storyboard Contract From Shared Descriptor

**Files:**
- Modify: `packages/neko-agent/packages/agent-types/src/creative-table-contract.ts`
- Test: `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`

- [ ] **Step 1: Write a compatibility assertion in the Agent validator test**

Add this test to `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`:

```ts
import {
  STORYBOARD_CREATIVE_TABLE_FIELDS,
  STORYBOARD_CREATIVE_TABLE_HEADERS,
  resolveStoryboardCreativeTableHeader,
} from '@neko-agent/types';

it('uses shared storyboard profile aliases through agent-types compatibility exports', () => {
  expect(STORYBOARD_CREATIVE_TABLE_HEADERS).toContain('imagePrompt');
  expect(STORYBOARD_CREATIVE_TABLE_FIELDS.some((field) => field.id === 'sceneVideoPrompt')).toBe(
    true,
  );
  expect(resolveStoryboardCreativeTableHeader('场景视频提示词')).toBe('sceneVideoPrompt');
  expect(resolveStoryboardCreativeTableHeader('建议操作')).toBe('nextAction');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: FAIL because `STORYBOARD_CREATIVE_TABLE_HEADERS` does not include `imagePrompt` and `sceneVideoPrompt`.

- [ ] **Step 3: Replace the Agent local contract with shared re-exports**

Replace `packages/neko-agent/packages/agent-types/src/creative-table-contract.ts` with:

```ts
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS,
  normalizeCreativeTableHeader,
  resolveCreativeTableField,
  type CreativeTableFieldDescriptor,
} from '@neko/shared';

export const STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID = 'creative-table.storyboard';

export const STORYBOARD_CREATIVE_TABLE_HEADERS = STORYBOARD_CREATIVE_TABLE_RECOMMENDED_HEADERS;

export type StoryboardCreativeTableHeader = (typeof STORYBOARD_CREATIVE_TABLE_HEADERS)[number];

export type StoryboardCreativeTableFieldDescriptor = CreativeTableFieldDescriptor;

export const STORYBOARD_CREATIVE_TABLE_FIELDS = STORYBOARD_CREATIVE_TABLE_PROFILE.fields;

export function normalizeStoryboardCreativeTableHeader(value: string): string {
  return normalizeCreativeTableHeader(value);
}

export function resolveStoryboardCreativeTableHeader(
  value: string,
): StoryboardCreativeTableHeader | undefined {
  const field = resolveCreativeTableField(STORYBOARD_CREATIVE_TABLE_PROFILE, value);
  return field?.id as StoryboardCreativeTableHeader | undefined;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: PASS for the new compatibility assertion; other tests may fail until Task 3 because old validator behavior still requires the old fixed field set.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/neko-agent/packages/agent-types/src/creative-table-contract.ts \
  packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts
git commit -m "refactor: source storyboard field contract from shared profile"
```

---

### Task 3: Convert Agent Storyboard Validator To Profile-Driven Validation

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts`
- Modify: `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`

- [ ] **Step 1: Add failing validator tests for open review columns and prompt slots**

Add these tests to `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`:

```ts
it('accepts open review metadata columns without requiring every recommended storyboard field', () => {
  const markdown = [
    '| 场景 | 镜头 | 来源 | 画面 | 自定义审阅 |',
    '| --- | --- | --- | --- | --- |',
    '| 开场 | 1 | P1 | 角色进入巨构空间 | OCR uncertain |',
  ].join('\n');

  const result = validateStoryboardCreativeTableOutput(markdown);

  expect(result.errors).toEqual([]);
  expect(result.warnings.map((warning) => warning.code)).not.toContain(
    'storyboard-table-missing-column',
  );
});

it('accepts model-aware prompt slots without the legacy prompt column', () => {
  const markdown = [
    '| scene | shot | source | visual | imagePrompt | shotVideoPrompt | sceneVideoPrompt | reviewStatus |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| Opening | 1 | P1 | Wide industrial corridor | monochrome keyframe | slow dolly through corridor | 30s lonely exploration | needs-review |',
  ].join('\n');

  const result = validateStoryboardCreativeTableOutput(markdown);

  expect(result.errors).toEqual([]);
});

it('fails visible when an execution action id appears without a trusted lifecycle context', () => {
  const markdown = [
    '| scene | shot | source | visual | actionId |',
    '| --- | --- | --- | --- | --- |',
    '| Opening | 1 | P1 | Wide industrial corridor | unregistered.local.action |',
  ].join('\n');

  const result = validateStoryboardCreativeTableOutput(markdown);

  expect(result.errors).toEqual([
    expect.objectContaining({
      code: 'storyboard-table-execution-field-not-supported',
    }),
  ]);
});
```

- [ ] **Step 2: Run the validator tests and verify they fail**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: FAIL because the validator still requires every `STORYBOARD_CREATIVE_TABLE_HEADERS` field and does not reject execution fields explicitly.

- [ ] **Step 3: Import the shared profile helpers**

At the top of `packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts`, add imports from `@neko/shared`:

```ts
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  classifyCreativeTableHeaders,
  resolveCreativeTableField,
  type CreativeTableFieldDescriptor,
} from '@neko/shared';
```

Keep the existing `@neko-agent/types` exports for compatibility.

- [ ] **Step 4: Replace fixed missing-column validation with profile minimum groups**

Replace the block that computes `missingHeaders` and pushes `storyboard-table-missing-column` with:

```ts
  const classification = classifyCreativeTableHeaders(
    STORYBOARD_CREATIVE_TABLE_PROFILE,
    table.headers,
  );
  for (const group of classification.missingMinimumGroups) {
    errors.push(
      createStoryboardTableError(
        'storyboard-table-missing-minimum-field-group',
        `Storyboard creative table is missing one of the required field groups: ${group.join(', ')}.`,
        { headerLine: table.headerLine },
      ),
    );
  }
```

- [ ] **Step 5: Add execution-field rejection in row validation**

Inside `validateStoryboardTableRows`, after creating `positions`, add:

```ts
  for (const [field, index] of positions) {
    const descriptor = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find((item) => item.id === field);
    if (descriptor?.role === 'execution') {
      for (const row of table.rows) {
        const value = row.cells[index]?.trim();
        if (!value) continue;
        errors.push(
          createStoryboardTableError(
            'storyboard-table-execution-field-not-supported',
            `Storyboard creative table row ${row.line} includes execution field "${field}", but executable actions must come from trusted Canvas lifecycle results.`,
            { field, value, line: row.line },
          ),
        );
      }
    }
  }
```

- [ ] **Step 6: Stop requiring `characters`, `prompt`, and `nextAction` cells**

Remove these calls from `validateStoryboardTableRows`:

```ts
    validateRequiredCell(row, positions, 'characters', errors);
    validateRequiredCell(row, positions, 'prompt', errors);
    validateRequiredCell(row, positions, 'nextAction', errors);
```

- [ ] **Step 7: Validate known values only when fields exist**

Keep the existing known-value validators for `decision`, `reviewStatus`, `contentType`, and `requiresSplit`. Add prompt-slot duration support by ensuring `duration` and `sceneDuration` both accept the same duration parser:

```ts
    validateDurationCell(row, positions, 'duration', warnings);
    validateDurationCell(row, positions, 'sceneDuration', warnings);
```

Add this helper near the other cell validators:

```ts
function validateDurationCell(
  row: MarkdownTableRowSummary,
  positions: ReadonlyMap<StoryboardCreativeTableHeader, number>,
  field: StoryboardCreativeTableHeader,
  warnings: ValidationWarning[],
): void {
  const value = getRowFieldValue(row, positions, field);
  if (value === undefined || value.length === 0) return;
  if (/^\d+(?:\.\d+)?\s*(?:s|秒|sec|seconds)?$/i.test(value.trim())) return;
  warnings.push({
    type: 'output',
    code: 'storyboard-table-duration-format',
    message: `Storyboard creative table row ${row.line} has a non-standard "${field}" duration "${value}".`,
    suggestion: 'Use a short duration such as 3s, 4.5s, or 30s.',
  });
}
```

- [ ] **Step 8: Run the validator tests and verify they pass**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts \
  packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts
git commit -m "fix: validate storyboard creative tables from profile"
```

---

### Task 4: Preserve Raw Markdown Headers In Agent Webview And Use Profile Classification For Handoff

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx`
- Modify: `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx`
- Modify: `packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts`
- Modify: `packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts`

- [ ] **Step 1: Add failing MarkdownRenderer tests for preserving header language**

In `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx`, add:

```tsx
it('preserves raw creative table headers instead of translating markdown output', () => {
  render(
    <MarkdownRenderer
      content={[
        '| scene | shot | imagePrompt | sceneVideoPrompt | 自定义审阅 |',
        '| --- | --- | --- | --- | --- |',
        '| Opening | 1 | keyframe | scene video | note |',
      ].join('\n')}
    />,
  );

  expect(screen.getByRole('columnheader', { name: 'scene' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'imagePrompt' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'sceneVideoPrompt' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: '自定义审阅' })).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: '场景' })).toBeNull();
});
```

- [ ] **Step 2: Run the MarkdownRenderer test and verify it fails**

Run:

```bash
pnpm --filter @neko-agent/webview exec vitest run src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx
```

Expected: FAIL because table headers are translated by `projectStoryboardCreativeTableHeader`.

- [ ] **Step 3: Remove raw Markdown header translation**

In `packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx`, replace the `th` renderer with:

```tsx
    th({ children }) {
      return (
        <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-[var(--vscode-foreground)] border border-[var(--vscode-panel-border)]">
          {children}
        </th>
      );
    },
```

Remove the unused import `resolveStoryboardCreativeTableHeader`, remove the unused import `t`, and delete the `projectStoryboardCreativeTableHeader` function.

- [ ] **Step 4: Run the MarkdownRenderer test and verify it passes**

Run:

```bash
pnpm --filter @neko-agent/webview exec vitest run src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add failing Webview handoff tests for profile-driven classification**

In `packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts`, add:

```ts
it('infers storyboard handoff from minimum profile fields and dynamic review columns', () => {
  const result = projectCanvasMarkdownHandoffRequest({
    markdown: [
      '| 场景 | 镜头 | 来源 | 画面 | 图像提示词 | 自定义审阅 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 开场 | 1 | P1 | 巨构空间 | 黑白关键帧 | OCR uncertain |',
    ].join('\n'),
  });

  expect(result).toMatchObject({
    sourceFormat: 'gfm-table',
    declaredIntentHint: 'creative-table',
    declaredProfileHint: 'storyboard',
  });
});

it('infers storyboard handoff from scene-level video prompt fields', () => {
  const result = projectCanvasMarkdownHandoffRequest({
    markdown: [
      '| scene | shot | visual | sceneVideoPrompt |',
      '| --- | --- | --- | --- |',
      '| Opening | 1 | Character crosses a huge corridor | 30s continuous lonely exploration |',
    ].join('\n'),
  });

  expect(result?.declaredProfileHint).toBe('storyboard');
});
```

- [ ] **Step 6: Run the handoff presenter tests and verify they fail**

Run:

```bash
pnpm --filter @neko-agent/webview exec vitest run src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
```

Expected: FAIL because handoff currently requires every recommended storyboard header.

- [ ] **Step 7: Switch handoff inference to shared profile classification**

In `packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts`, replace imports from `@neko-agent/types` with:

```ts
import {
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  classifyCreativeTableHeaders,
} from '@neko/shared';
import type { PluginTransferProvenance, PluginTransferTargetRef } from '@neko-agent/types';
```

Replace `isCanonicalStoryboardCreativeTable` with:

```ts
function isStoryboardCreativeTable(headers: readonly string[]): boolean {
  return classifyCreativeTableHeaders(STORYBOARD_CREATIVE_TABLE_PROFILE, headers).matchedProfile;
}
```

Replace the call site:

```ts
  const hasCanonicalStoryboardTable = tables.some(isStoryboardCreativeTable);
```

- [ ] **Step 8: Run Webview focused tests and verify they pass**

Run:

```bash
pnpm --filter @neko-agent/webview exec vitest run \
  src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx \
  src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.tsx \
  packages/neko-agent/packages/webview/src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx \
  packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts \
  packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
git commit -m "fix: preserve markdown headers and infer creative tables by profile"
```

---

### Task 5: Align Canvas Storyboard Profile With Shared Descriptor

**Files:**
- Modify: `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`
- Modify: `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`

- [ ] **Step 1: Add failing Canvas profile alignment tests**

Add these tests to `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`:

```ts
it('consumes shared storyboard fields including localized prompt slots and review metadata', async () => {
  const operations = createOperations();
  const result = await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.ingestMarkdown',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      markdown: [
        '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 画面 | 图像提示词 | 镜头视频提示词 | 场景视频提示词 | 审阅状态 | 建议操作 | 决策理由 | 需要拆分 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| 开场 | 1 | P1#panel_1 | 右上 | keep | 巨构空间 | 黑白关键帧 | 缓慢推进 | 30s 连续探索 | needs-review | use-as-reference | 建立空间 | true |',
      ].join('\n'),
      resources: [createResource('P1')],
    },
    operations,
  );

  expect(result.status).toBe('created');
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
    'canvas-markdown-storyboard-next-action-missing',
  );
  expect(operations.createNode).toHaveBeenCalledWith(
    'table',
    { x: 0, y: 0 },
    expect.objectContaining({
      markdown: expect.objectContaining({
        consumedColumns: expect.arrayContaining([
          expect.objectContaining({ fieldId: 'source', columnId: '来源' }),
          expect.objectContaining({ fieldId: 'sourcePanel', role: 'approval' }),
          expect.objectContaining({ fieldId: 'decision', role: 'approval' }),
          expect.objectContaining({ fieldId: 'imagePrompt', role: 'plan', valueType: 'prompt' }),
          expect.objectContaining({ fieldId: 'shotVideoPrompt', role: 'plan', valueType: 'prompt' }),
          expect.objectContaining({ fieldId: 'sceneVideoPrompt', role: 'plan', valueType: 'prompt' }),
          expect.objectContaining({ fieldId: 'nextAction', role: 'plan' }),
        ]),
        unknownColumns: [],
      }),
    }),
    'table.basic',
  );
});

it('preserves custom review metadata while consuming all shared storyboard aliases', async () => {
  const operations = createOperations();
  await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.ingestMarkdown',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      markdown: [
        '| scene | shot | source | visual | imagePrompt | customRisk |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Opening | 1 | P1 | wide shot | keyframe | high OCR uncertainty |',
      ].join('\n'),
      resources: [createResource('P1')],
    },
    operations,
  );

  expect(operations.createNode).toHaveBeenCalledWith(
    'table',
    { x: 0, y: 0 },
    expect.objectContaining({
      markdown: expect.objectContaining({
        consumedColumns: expect.arrayContaining([
          expect.objectContaining({ fieldId: 'imagePrompt' }),
        ]),
        unknownColumns: [expect.objectContaining({ label: 'customRisk' })],
      }),
    }),
    'table.basic',
  );
});
```

- [ ] **Step 2: Run Canvas tests and verify they fail**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: FAIL because Canvas does not consume `建议操作`, `sourcePanel`, `decision`, or new prompt slot fields.

- [ ] **Step 3: Import shared profile types in Canvas Markdown capabilities**

In `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`, add:

```ts
  STORYBOARD_CREATIVE_TABLE_PROFILE,
  type CreativeTableFieldDescriptor,
```

to the existing `@neko/shared` import list.

- [ ] **Step 4: Add a local adapter from shared fields to Canvas profile fields**

Add this helper above `CANVAS_STORYBOARD_TABLE_PROFILE`:

```ts
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
```

- [ ] **Step 5: Replace Canvas storyboard field definitions with shared descriptor projection**

In `CANVAS_STORYBOARD_TABLE_PROFILE`, replace the hardcoded `fields: [...]` array with:

```ts
  fields: createCanvasProfileFieldsFromCreativeProfile(STORYBOARD_CREATIVE_TABLE_PROFILE.fields),
```

Keep `reviewActions` as Canvas-owned actions. Do not derive trusted actions from table text.

- [ ] **Step 6: Update Canvas storyboard validation rules**

Replace the review rule that requires `action` with one that only informs about missing plan suggestions when neither `nextAction` nor `actionId` appears:

```ts
    {
      phases: ['review'],
      fieldIds: ['nextAction', 'actionId'],
      severity: 'info',
      code: 'canvas-markdown-storyboard-next-action-missing',
      message:
        'Storyboard creative table has no nextAction/建议操作 or trusted actionId column; Canvas can still keep it for review.',
    },
```

Replace the apply rule field ids with prompt-aware alternatives:

```ts
      fieldIds: ['visual', 'imagePrompt', 'prompt', 'shotVideoPrompt', 'sceneVideoPrompt'],
```

- [ ] **Step 7: Run Canvas tests and verify the new alignment tests pass**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: PASS for the new tests. Existing expectations that `sourcePanel`, `decision`, or `reviewStatus` are unknown must be updated to expect them in `consumedColumns`.

- [ ] **Step 8: Commit Task 5**

```bash
git add packages/neko-canvas/packages/extension/src/markdownCapabilities.ts \
  packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
git commit -m "fix: align canvas storyboard profile with shared descriptor"
```

---

### Task 6: Add Prompt Slot Metadata To Canvas Nodes And Gate Production Rows

**Files:**
- Modify: `packages/neko-types/src/types/canvas.ts`
- Modify: `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`
- Modify: `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`

- [ ] **Step 1: Add failing Canvas production tests**

Add these tests to `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`:

```ts
it('does not create production shot nodes for skip or reference-only rows', async () => {
  const operations = createOperations();
  const result = await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      mode: 'create-nodes',
      approval: {
        source: 'creation-apply',
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        profileId: 'idc.default',
        stageId: 'apply',
      },
      markdown: [
        '| scene | shot | source | decision | visual | imagePrompt |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Opening | 1 | P1 | reference-only | cover style reference | cover keyframe |',
        '| Opening | 2 | P2 | skip | metadata page | metadata keyframe |',
        '| Opening | 3 | P3 | keep | corridor shot | corridor keyframe |',
      ].join('\n'),
      resources: [createResource('P1'), createResource('P2'), createResource('P3')],
    },
    operations,
  );

  expect(result.status).toBe('created');
  const request = vi.mocked(operations.createComposite).mock.calls[0]?.[0];
  expect(request?.children).toHaveLength(1);
  expect(request?.children[0]?.data).toMatchObject({
    shotNumber: 3,
    visualDescription: 'corridor shot',
    generationPrompt: 'corridor keyframe',
  });
});

it('preserves shot and scene prompt slots during production node creation', async () => {
  const operations = createOperations();
  await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      mode: 'create-nodes',
      approval: {
        source: 'creation-apply',
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        profileId: 'idc.default',
        stageId: 'apply',
      },
      markdown: [
        '| scene | shot | visual | imagePrompt | imageEditPrompt | shotVideoPrompt | sceneVideoPrompt |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| Opening | 1 | corridor | keyframe prompt | remove text | slow dolly | 30s scene journey |',
      ].join('\n'),
    },
    operations,
  );

  const request = vi.mocked(operations.createComposite).mock.calls[0]?.[0];
  expect(request?.data).toMatchObject({
    promptSlots: [
      expect.objectContaining({
        fieldId: 'sceneVideoPrompt',
        scope: 'scene',
        mediaType: 'video',
        operation: 'generate',
        prompt: '30s scene journey',
      }),
    ],
  });
  expect(request?.children[0]?.data).toMatchObject({
    generationPrompt: 'keyframe prompt',
    promptSlots: expect.arrayContaining([
      expect.objectContaining({
        fieldId: 'imageEditPrompt',
        scope: 'shot',
        mediaType: 'image',
        operation: 'edit',
        prompt: 'remove text',
      }),
      expect.objectContaining({
        fieldId: 'shotVideoPrompt',
        scope: 'shot',
        mediaType: 'video',
        operation: 'generate',
        prompt: 'slow dolly',
      }),
    ]),
  });
});
```

- [ ] **Step 2: Run Canvas production tests and verify they fail**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: FAIL because all rows are converted to shots and prompt slots are not preserved.

- [ ] **Step 3: Add prompt slot metadata types to Canvas nodes**

In `packages/neko-types/src/types/canvas.ts`, add near the `ShotCanvasNode` supporting interfaces:

```ts
export interface CanvasCreativePromptSlot {
  readonly fieldId: string;
  readonly scope: 'shot' | 'scene';
  readonly mediaType: 'image' | 'video' | 'audio';
  readonly operation: 'generate' | 'edit';
  readonly prompt: string;
}
```

Add to `ShotCanvasNode['data']`:

```ts
    /** Provider-neutral prompt slots imported from Creative Tables. */
    promptSlots?: readonly CanvasCreativePromptSlot[];
```

Add to `SceneGroupCanvasNode['data']`:

```ts
    /** Provider-neutral scene prompt slots imported from Creative Tables. */
    promptSlots?: readonly CanvasCreativePromptSlot[];
```

- [ ] **Step 4: Add row production gating helpers in Canvas Markdown capabilities**

In `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`, add near `getCell`:

```ts
function shouldCreateStoryboardShot(
  row: MarkdownTableRow,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): boolean {
  const decisionColumn = profileColumns.columnsByField.get('decision');
  const decision = decisionColumn ? getCell(row, decisionColumn).trim().toLowerCase() : '';
  return decision !== 'skip' && decision !== 'reference-only' && decision !== 'duplicate';
}
```

- [ ] **Step 5: Add prompt slot extraction helpers**

In `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`, add:

```ts
function extractPromptSlots(
  row: MarkdownTableRow,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
  scope: 'shot' | 'scene',
): readonly {
  readonly fieldId: string;
  readonly scope: 'shot' | 'scene';
  readonly mediaType: 'image' | 'video' | 'audio';
  readonly operation: 'generate' | 'edit';
  readonly prompt: string;
}[] {
  const slots: Array<{
    readonly fieldId: string;
    readonly scope: 'shot' | 'scene';
    readonly mediaType: 'image' | 'video' | 'audio';
    readonly operation: 'generate' | 'edit';
    readonly prompt: string;
  }> = [];
  for (const consumed of profileColumns.consumedColumns) {
    const descriptor = STORYBOARD_CREATIVE_TABLE_PROFILE.fields.find(
      (field) => field.id === consumed.fieldId,
    );
    if (!descriptor?.promptSlot || descriptor.promptSlot.scope !== scope) continue;
    const column = profileColumns.columnsByField.get(consumed.fieldId);
    const prompt = column ? getCell(row, column) : '';
    if (!prompt) continue;
    slots.push({
      fieldId: consumed.fieldId,
      scope: descriptor.promptSlot.scope,
      mediaType: descriptor.promptSlot.mediaType,
      operation: descriptor.promptSlot.operation,
      prompt,
    });
  }
  return slots;
}
```

- [ ] **Step 6: Use row gating and prompt slots in production request creation**

In `buildStoryboardProductionRequest`, before returning the request, add:

```ts
  const productionRows = table.rows.filter((row) => shouldCreateStoryboardShot(row, profileColumns));
  const scenePromptSlots = uniquePromptSlots(
    productionRows.flatMap((row) => extractPromptSlots(row, profileColumns, 'scene')),
  );
```

Add this helper:

```ts
function uniquePromptSlots<T extends { readonly fieldId: string; readonly prompt: string }>(
  slots: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const slot of slots) {
    const key = `${slot.fieldId}:${slot.prompt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(slot);
  }
  return result;
}
```

Change scene `data`:

```ts
      data: {
        sceneTitle,
        sceneNumber: 1,
        markdownSource: input.markdown,
        ...(scenePromptSlots.length > 0 ? { promptSlots: scenePromptSlots } : {}),
      },
```

Change children mapping from `table.rows.map` to:

```ts
      children: productionRows.map((row, index) => {
```

Inside child data creation, compute:

```ts
        const imagePromptColumn =
          profileColumns.columnsByField.get('imagePrompt') ?? profileColumns.columnsByField.get('prompt');
        const prompt = imagePromptColumn ? getCell(row, imagePromptColumn) : undefined;
        const shotPromptSlots = extractPromptSlots(row, profileColumns, 'shot').filter(
          (slot) => slot.fieldId !== 'imagePrompt' && slot.fieldId !== 'prompt',
        );
```

Add to child `data`:

```ts
            ...(shotPromptSlots.length > 0 ? { promptSlots: shotPromptSlots } : {}),
```

- [ ] **Step 7: Run Canvas production tests and verify they pass**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add packages/neko-types/src/types/canvas.ts \
  packages/neko-canvas/packages/extension/src/markdownCapabilities.ts \
  packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
git commit -m "feat: preserve storyboard prompt slots in canvas production"
```

---

### Task 7: Add Operation Hints For Model-Aware Prompt Slot Validation

**Files:**
- Modify: `packages/neko-types/src/types/canvas-markdown-capabilities.ts`
- Modify: `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`
- Modify: `packages/neko-types/src/types/__tests__/canvas-markdown-capabilities.test.ts`
- Modify: `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`

- [ ] **Step 1: Add failing shared DTO validation tests for operation hints**

In `packages/neko-types/src/types/__tests__/canvas-markdown-capabilities.test.ts`, add:

```ts
it('accepts supported creative table operation hints', () => {
  expect(
    validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.ingestMarkdown',
      markdown: '| scene | shot | sceneVideoPrompt |\n| --- | --- | --- |\n| Opening | 1 | 30s scene |',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      operationHint: 'video.scene.generate',
    }),
  ).toEqual([]);
});

it('rejects unsupported creative table operation hints', () => {
  expect(
    validateCanvasMarkdownCapabilityInput({
      capabilityId: 'canvas.ingestMarkdown',
      markdown: '| scene | shot |\n| --- | --- |\n| Opening | 1 |',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      operationHint: 'video.remote.unknown',
    }),
  ).toEqual([
    expect.objectContaining({
      code: 'canvas-markdown-invalid-operation-hint',
    }),
  ]);
});
```

- [ ] **Step 2: Run shared DTO tests and verify they fail**

Run:

```bash
pnpm --filter @neko/shared exec vitest run src/types/__tests__/canvas-markdown-capabilities.test.ts
```

Expected: FAIL because `operationHint` is not part of the DTO validator.

- [ ] **Step 3: Add operation hint type to Canvas Markdown input**

In `packages/neko-types/src/types/canvas-markdown-capabilities.ts`, import the operation id type:

```ts
import type { CreativeTableOperationRequirement } from './creative-table-profile';
```

Add to `CanvasMarkdownCapabilityBaseInput`:

```ts
  readonly operationHint?: CreativeTableOperationRequirement['operationId'];
```

Add this constant near other constants:

```ts
const CANVAS_MARKDOWN_OPERATION_HINTS = [
  'image.shot.generate',
  'image.shot.edit',
  'video.shot.generate',
  'video.shot.edit',
  'video.scene.generate',
  'video.scene.edit',
] as const;
```

Add this validator:

```ts
function isCanvasMarkdownOperationHint(
  value: unknown,
): value is CreativeTableOperationRequirement['operationId'] {
  return typeof value === 'string' && CANVAS_MARKDOWN_OPERATION_HINTS.includes(value as never);
}
```

Inside `validateCanvasMarkdownCapabilityInput`, add:

```ts
  if (
    'operationHint' in input &&
    input.operationHint !== undefined &&
    !isCanvasMarkdownOperationHint(input.operationHint)
  ) {
    diagnostics.push(
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-invalid-operation-hint',
        `Canvas Markdown operation hint "${String(input.operationHint)}" is not supported.`,
        'operationHint',
      ),
    );
  }
```

- [ ] **Step 4: Run shared DTO tests and verify they pass**

Run:

```bash
pnpm --filter @neko/shared exec vitest run src/types/__tests__/canvas-markdown-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing Canvas operation requirement tests**

In `packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts`, add:

```ts
it('blocks scene video generation review when requested operation lacks sceneVideoPrompt', async () => {
  const operations = createOperations();
  const result = await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.ingestMarkdown',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      operationHint: 'video.scene.generate',
      markdown: [
        '| scene | shot | visual | shotVideoPrompt |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | corridor | slow dolly |',
      ].join('\n'),
    },
    operations,
  );

  expect(result.status).toBe('needs-review');
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: 'canvas-markdown-operation-required-field-missing',
      fieldKey: 'sceneVideoPrompt',
    }),
  ]);
});

it('allows scene video generation review when sceneVideoPrompt is present', async () => {
  const operations = createOperations();
  const result = await invokeCanvasMarkdownCapability(
    {
      capabilityId: 'canvas.ingestMarkdown',
      intentHint: 'creative-table',
      profileHint: 'storyboard',
      operationHint: 'video.scene.generate',
      markdown: [
        '| scene | shot | visual | sceneVideoPrompt |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | corridor | 30s continuous corridor traversal |',
      ].join('\n'),
    },
    operations,
  );

  expect(result.status).toBe('created');
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
    'canvas-markdown-operation-required-field-missing',
  );
});
```

- [ ] **Step 6: Run Canvas operation tests and verify they fail**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: FAIL because Canvas does not evaluate `operationHint`.

- [ ] **Step 7: Add operation requirement diagnostics in Canvas profile validation**

In `packages/neko-canvas/packages/extension/src/markdownCapabilities.ts`, import:

```ts
  getCreativeTableOperationRequirement,
```

Add this helper:

```ts
function validateOperationRequirement(
  input: CanvasMarkdownCapabilityInput,
  profileColumns: CanvasMarkdownResolvedTableProfileColumns,
): readonly CanvasMarkdownCapabilityDiagnostic[] {
  const operationHint = 'operationHint' in input ? input.operationHint : undefined;
  const requirement = getCreativeTableOperationRequirement(
    STORYBOARD_CREATIVE_TABLE_PROFILE,
    operationHint,
  );
  if (!requirement) return [];
  return requirement.requiredFieldIds
    .filter((fieldId) => !profileColumns.columnsByField.has(fieldId))
    .map((fieldId) =>
      createCanvasMarkdownDiagnostic(
        'error',
        'canvas-markdown-operation-required-field-missing',
        `Operation "${requirement.operationId}" requires storyboard field "${fieldId}".`,
        fieldId,
      ),
    );
}
```

In the creative table review/apply paths after `validateTableProfile(...)`, merge:

```ts
const operationDiagnostics = validateOperationRequirement(input, profileColumns);
```

and include `...operationDiagnostics` in the result diagnostics. If operation diagnostics contain errors during `canvas.ingestMarkdown`, return `status: 'needs-review'` while still creating the review table.

- [ ] **Step 8: Run shared and Canvas operation tests**

Run:

```bash
pnpm --filter @neko/shared exec vitest run src/types/__tests__/canvas-markdown-capabilities.test.ts
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 7**

```bash
git add packages/neko-types/src/types/canvas-markdown-capabilities.ts \
  packages/neko-types/src/types/__tests__/canvas-markdown-capabilities.test.ts \
  packages/neko-canvas/packages/extension/src/markdownCapabilities.ts \
  packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
git commit -m "feat: validate creative table prompt slots by operation hint"
```

---

### Task 8: Update Storyboard And Image-To-Shot Skill Prompts

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.zh-cn.md`
- Modify: `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.md`
- Modify: `packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.zh-cn.md`
- Modify: `packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.md`
- Test: `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`

- [ ] **Step 1: Add a validator fixture test for the new Skill example shape**

In `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`, add:

```ts
it('accepts the updated storyboard skill prompt slot table shape', () => {
  const markdown = [
    '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 图像提示词 | 图像编辑提示词 | 镜头视频提示词 | 场景视频提示词 | 审阅状态 | 建议操作 | 决策理由 | 需要拆分 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| 开场 | 1 | P1#panel_1 | 右上 | keep | 4s | 主角进入巨构空间 | 缓慢推近 | 低频风声 | 主角剪影 |  | 黑白关键帧 | 去除对白框 | 缓慢推进并保持线稿质感 | 30s 连续探索巨构空间 | needs-review | use-as-reference | 建立空间尺度 | true |',
  ].join('\n');

  expect(validateStoryboardCreativeTableOutput(markdown).errors).toEqual([]);
});
```

- [ ] **Step 2: Run the validator fixture test**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: PASS after Tasks 1-3; this protects prompt wording updates.

- [ ] **Step 3: Update Chinese comic-to-storyboard output contract**

In `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.zh-cn.md`, replace the fixed-field section around the current `主表必须按以下顺序覆盖...` paragraph with:

```md
主表是一张 shot 粒度的 Markdown creative table。审阅字段允许按任务动态扩展，但已知字段应优先使用下面的稳定含义。表头使用当前回复语言；中文回复优先使用中文表头，英文回复优先使用英文字段名。Canvas/Agent 会通过字段别名映射到稳定 field id，不需要 Webview 二次翻译。

推荐核心字段：

`scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `reviewStatus`, `nextAction`

推荐提示词字段：

- `imagePrompt`：shot 级图片/关键帧生成提示词。
- `imageEditPrompt`：shot 级图片编辑、重绘、去字、inpaint、outpaint、上色或修复提示词。
- `shotVideoPrompt`：单个 shot 的视频生成提示词。
- `sceneVideoPrompt`：整个 scene 的连续视频生成提示词；适合支持长叙事、多参考或场景级视频生成的模型。
- `videoEditPrompt`：视频编辑或局部视频修改提示词。
- `prompt`：兼容旧表格的 legacy 字段；新表优先使用更明确的 prompt slot。

推荐决策扩展字段：

`contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`
```

- [ ] **Step 4: Update Chinese field role guidance**

Replace the current `字段角色` bullets with:

```md
- 审阅字段：开放扩展。常见字段包括 `scene`、`shot`、`source`、`sourcePanel`、`decision`、`visual`、`audio`、`characters`、`dialogue`、`reviewStatus`、`contentType`、`duplicateOf`、`ocrNotes`、`speaker`、`risk`。未知审阅列会作为 metadata 保留，不代表 Canvas 一定会执行。
- 计划字段：`duration`、`motion`、`imagePrompt`、`imageEditPrompt`、`shotVideoPrompt`、`sceneVideoPrompt`、`videoEditPrompt`、`decisionReason`、`requiresSplit`、`requiresTextRemoval`、`requiresInpaint`、`referenceImage`、`styleRef`、`nextAction`。
- 执行字段：只写可信 `actionId`、`resultRef`、`executionStatus`，并且只有本地 lifecycle capability 或真实工具结果支持时才写。`nextAction` 是建议文本，不是可执行动作。
```

- [ ] **Step 5: Update Chinese examples to use prompt slots**

Replace the example table header and rows with:

```md
| scene   | shot | source     | sourcePanel | decision | duration | visual                     | motion                 | audio        | characters                 | dialogue | imagePrompt                                                                  | imageEditPrompt | shotVideoPrompt                       | sceneVideoPrompt                         | reviewStatus | nextAction       | contentType | decisionReason         | requiresSplit | duplicateOf |
| ------- | ---- | ---------- | ----------- | -------- | -------- | -------------------------- | ---------------------- | ------------ | -------------------------- | -------- | ---------------------------------------------------------------------------- | --------------- | ------------------------------------- | ---------------------------------------- | ------------ | ---------------- | ----------- | ---------------------- | ------------- | ----------- |
| 第 1 页 | 1    | P1#panel_1 | 上方分格    | keep     | 3s       | 小小的人影在黄昏靠近发光物 | 缓慢推近               | 低风声       | 牧羊少年：短披风、谨慎姿态 |          | 暗黑童话风格，黄昏牧场，谨慎少年靠近发光古灯，保持角色设计一致               |                 | 缓慢推近发光古灯，保持漫画线稿和光源闪动 | 第 1 页以暗黑童话风格建立悬念和角色孤独感 | needs-review | use-as-reference | story       | 建立镜头，有叙事价值   | false         |             |
| 第 1 页 | 2    | P1#panel_2 | 下方特写    | split    | 2s       | 手伸向光源，强化悬念       | 静态特写，光线轻微闪动 | 柔和魔法嗡鸣 | 牧羊少年：手和袖口可见     |          | 手伸向紫金色光源的特写，紧张氛围，保留原漫画构图                             | 去除对白框并补全袖口边缘 | 光源轻微脉动，手指接近时停顿             | 第 1 页以暗黑童话风格建立悬念和角色孤独感 | needs-review | split-panel      | story       | 同一页包含独立特写节拍 | true          |             |
```

- [ ] **Step 6: Mirror the English comic-to-storyboard prompt**

Apply the same semantic changes to `packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.md` using English wording:

```md
The main table is a shot-level Markdown creative table. Review fields are open-ended and may be extended by the task, but known fields should keep the stable meanings below. Use the response language for headers; English replies should prefer English field names, Chinese replies should prefer Chinese labels. Canvas/Agent resolve aliases to stable field ids, so Webview does not need to translate raw Markdown headers.
```

Use the same field lists with English explanations for `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `sceneVideoPrompt`, and `videoEditPrompt`.

- [ ] **Step 7: Update image-to-shot prompts**

In both `image-to-shot.zh-cn.md` and `image-to-shot.md`, replace the line that says the storyboard table uses the old core headers with wording that references prompt slots:

```md
分镜表使用 storyboard creative table 的开放审阅字段和明确提示词字段。图片/关键帧生成使用 `imagePrompt`，图片编辑或重绘使用 `imageEditPrompt`，单镜视频使用 `shotVideoPrompt`，场景级视频使用 `sceneVideoPrompt`；仅为兼容旧表格时才使用 `prompt`。
```

English equivalent:

```md
Storyboard tables use the storyboard creative table's open review fields and explicit prompt slots. Use `imagePrompt` for image/keyframe generation, `imageEditPrompt` for image edits or redraws, `shotVideoPrompt` for single-shot video generation, and `sceneVideoPrompt` for scene-level video generation; use `prompt` only for legacy compatibility.
```

- [ ] **Step 8: Run Agent Skill and validator tests**

Run:

```bash
pnpm --filter @neko/agent exec vitest run \
  src/validation/__tests__/creative-table-validator.test.ts \
  src/skill/builtins/builtin-skills.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 8**

```bash
git add packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.zh-cn.md \
  packages/neko-agent/packages/agent/src/skill/builtins/markdown/comic-to-storyboard.md \
  packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.zh-cn.md \
  packages/neko-agent/packages/agent/src/skill/builtins/markdown/image-to-shot.md \
  packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts
git commit -m "docs: clarify storyboard creative table prompt slots"
```

---

### Task 9: Final Cross-Package Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run shared contract tests**

Run:

```bash
pnpm --filter @neko/shared exec vitest run \
  src/types/__tests__/creative-table-profile.test.ts \
  src/types/__tests__/canvas-markdown-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run Agent validator tests**

Run:

```bash
pnpm --filter @neko/agent exec vitest run src/validation/__tests__/creative-table-validator.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run Agent Webview tests**

Run:

```bash
pnpm --filter @neko-agent/webview exec vitest run \
  src/components/ChatView/MessageContent/MarkdownRenderer.test.tsx \
  src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts \
  src/components/ChatView/SendToMenu.test.tsx \
  src/components/ChatView/ContentBlockItem.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run Canvas Markdown capability tests**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript checks for touched frontend packages**

Run:

```bash
pnpm --filter @neko-agent/webview exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run broader repo checks if time allows**

Run:

```bash
pnpm check
```

Expected: PASS. If this fails for unrelated pre-existing dirty workspace issues, record the exact failing package and command output in the handoff summary.

- [ ] **Step 7: Commit verification-only doc notes if any test command required a documented workaround**

If no documentation workaround was needed, do not create a commit. If a command is flaky or blocked by unrelated workspace state, add a short note to the implementation summary instead of editing architecture docs.

---

## Self-Review

**Spec coverage**

- Unified fields: Tasks 1, 2, and 5 move field aliases/labels/roles into `@neko/shared` and consume them from Agent and Canvas.
- Open review layer: Tasks 1 and 3 make unknown review columns preserved and remove fixed 18-column validation.
- Plan/execution split: Tasks 1, 3, 5, and 7 keep `nextAction` as plan text and reserve executable behavior for `actionId` plus Canvas lifecycle actions.
- Prompt slots: Tasks 1, 6, 7, and 8 add `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, and `sceneVideoPrompt`.
- Shot/scene relationship: Task 6 preserves shot and scene prompt slots separately; production rows still create shot nodes, while scene prompt slots attach to the scene container.
- Webview language behavior: Task 4 preserves raw Markdown headers and stops Webview from translating Agent output.
- Dynamic extension: Tasks 1, 3, 4, and 5 preserve unknown columns as metadata and avoid requiring shared DTO changes for review-only extensions.
- Model-aware validation: Task 7 adds `operationHint` and validates prompt slots only when an operation is requested.

**Placeholder scan**

- The plan contains no `TBD`, no `TODO`, and no "implement later" placeholder steps.
- Every code-changing step includes the exact code block or replacement behavior needed for that step.
- Every test step includes a concrete command and expected result.

**Type consistency**

- Shared descriptor names are consistent: `CreativeTableProfileDescriptor`, `CreativeTableFieldDescriptor`, `CreativeTableOperationRequirement`, `STORYBOARD_CREATIVE_TABLE_PROFILE`.
- Agent compatibility names remain stable: `STORYBOARD_CREATIVE_TABLE_HEADERS`, `STORYBOARD_CREATIVE_TABLE_FIELDS`, `resolveStoryboardCreativeTableHeader`.
- Prompt slot fields are consistent across descriptor, tests, Canvas mapping, and Skill text.
- Canvas operation hint values are consistent with shared `CreativeTableOperationRequirement['operationId']`.

