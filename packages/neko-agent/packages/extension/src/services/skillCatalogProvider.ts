import type {
  Skill,
  SkillCatalogManifest,
  SkillCatalogMeta,
  SkillDef,
  SkillLocalizedText,
} from '@neko/shared';
import {
  toSkillCatalogEntry,
  type ConfiguredSkill,
  type SkillCatalogSource,
  type SkillCatalogRole,
} from '@neko/shared';
import type { SkillScanResult } from './SkillFileService';

type SkillLocaleMap = Readonly<Record<string, SkillLocalizedText>>;

export interface SkillCatalogProviderSnapshot {
  readonly skills: readonly SkillDef[];
  readonly scan?: SkillScanResult;
}

export interface SkillCatalogProvider {
  getSkills(): SkillDef[];
  updateScanResult(result: SkillScanResult): void;
  getSnapshot(): SkillCatalogProviderSnapshot;
}

export interface CreateSkillCatalogProviderOptions {
  readonly builtinSkills: readonly Skill[];
  readonly locales?: Readonly<Record<string, SkillLocaleMap>>;
}

const MEDIA_TO_VIDEO_GROUP = 'media-to-video';
const SCRIPT_WORKFLOW_GROUP = 'script-workflow';
const AI_GENERATION_GROUP = 'ai-generation';
const POST_PRODUCTION_GROUP = 'post-production';

const BUILTIN_FORK_ACTIONS: NonNullable<SkillCatalogManifest['actions']> = [
  'run',
  { id: 'fork', targetSource: 'project' },
];

const PERSONA_SKILL_NAMES = new Set(['creation-persona', 'execution-persona', 'iteration-persona']);

const BUILTIN_CATALOG_OVERRIDES: Readonly<Record<string, SkillCatalogManifest>> = {
  [MEDIA_TO_VIDEO_GROUP]: {
    role: 'orchestrator',
    groupId: MEDIA_TO_VIDEO_GROUP,
    visibility: 'primary',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  },
  'comic-to-storyboard': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'comic-to-animation': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'image-to-shot': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'storyboard-to-animation-plan': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'animation-plan-to-cut': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'generated-shot-assembly': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'export-video-package': createFocusedBuiltinCatalog(MEDIA_TO_VIDEO_GROUP),
  'script-generation': {
    role: 'orchestrator',
    groupId: SCRIPT_WORKFLOW_GROUP,
    visibility: 'primary',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  },
  'script-to-timeline': createFocusedBuiltinCatalog(SCRIPT_WORKFLOW_GROUP, 'script-generation'),
  'ai-generate': {
    role: 'orchestrator',
    groupId: AI_GENERATION_GROUP,
    visibility: 'primary',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  },
  'scene-to-music': createQuickActionBuiltinCatalog(AI_GENERATION_GROUP),
  'video-editing': createQuickActionBuiltinCatalog(POST_PRODUCTION_GROUP),
  'color-grading': createQuickActionBuiltinCatalog(POST_PRODUCTION_GROUP),
  'audio-mixing': createQuickActionBuiltinCatalog(POST_PRODUCTION_GROUP),
  'subtitle-assistant': createQuickActionBuiltinCatalog(POST_PRODUCTION_GROUP),
  'quality-assessment': createQuickActionBuiltinCatalog(POST_PRODUCTION_GROUP),
};

const SOURCE_PRIORITY: Readonly<Record<SkillCatalogSource, number>> = {
  project: 4,
  personal: 3,
  market: 2,
  plugin: 2,
  builtin: 1,
};

export function createSkillCatalogProvider(
  options: CreateSkillCatalogProviderOptions,
): SkillCatalogProvider {
  let scan: SkillScanResult | undefined;
  let snapshot = buildSkillDefs({
    builtinSkills: options.builtinSkills,
    locales: options.locales,
    scan,
  });

  return {
    getSkills(): SkillDef[] {
      return [...snapshot];
    },
    updateScanResult(result: SkillScanResult): void {
      scan = result;
      snapshot = buildSkillDefs({
        builtinSkills: options.builtinSkills,
        locales: options.locales,
        scan,
      });
    },
    getSnapshot(): SkillCatalogProviderSnapshot {
      return { skills: [...snapshot], scan };
    },
  };
}

export function buildSkillDefs(input: {
  readonly builtinSkills: readonly Skill[];
  readonly locales?: Readonly<Record<string, SkillLocaleMap>>;
  readonly scan?: SkillScanResult;
}): SkillDef[] {
  const entries = [
    ...input.builtinSkills.map((skill) => toBuiltinSkillDef(skill, input.locales?.[skill.name])),
    ...toFileSkillDefs(input.scan),
  ];
  const visibleEntries = entries.filter((entry) => entry.catalog?.visibility !== 'hidden');
  return applySkillSourcePrecedence(visibleEntries);
}

export function toBuiltinSkillDef(skill: Skill, locales?: SkillLocaleMap): SkillDef {
  const catalog = createBuiltinCatalog(skill);
  const entry = toSkillCatalogEntry(skill, {
    displayName: formatSkillName(skill.name),
    command: 'neko.agent.invokeSkill',
    tags: getSkillTags(skill),
    locales,
    catalog,
    source: 'builtin',
  });

  return {
    id: entry.id,
    name: entry.name,
    description: shortenDescription(entry.description),
    icon: entry.icon,
    command: entry.command ?? 'neko.agent.invokeSkill',
    tags: entry.tags,
    locales: entry.locales,
    catalog: entry.catalog,
  };
}

export function toFileSkillDef(skill: ConfiguredSkill): SkillDef {
  const catalog = toSkillCatalogEntry(skill, {
    displayName: formatSkillName(skill.name),
    command: 'neko.agent.invokeSkill',
    source: skill.source,
  });

  return {
    id: catalog.id,
    name: catalog.name,
    description: shortenDescription(catalog.description),
    icon: catalog.icon,
    command: catalog.command ?? 'neko.agent.invokeSkill',
    tags: catalog.tags,
    catalog: catalog.catalog,
  };
}

export function applySkillSourcePrecedence(skills: readonly SkillDef[]): SkillDef[] {
  const selected = new Map<string, SkillDef>();

  for (const skill of skills) {
    const current = selected.get(skill.id);
    if (!current || getSkillSourcePriority(skill) > getSkillSourcePriority(current)) {
      selected.set(skill.id, skill);
    }
  }

  return [...selected.values()].sort(compareSkillDefs);
}

function toFileSkillDefs(scan: SkillScanResult | undefined): SkillDef[] {
  if (!scan) return [];
  return [
    ...scan.personal.skills.map((skill) => toFileSkillDef({ ...skill, enabled: true })),
    ...scan.project.skills.map((skill) => toFileSkillDef({ ...skill, enabled: true })),
  ];
}

function createBuiltinCatalog(skill: Skill): SkillCatalogManifest {
  if (PERSONA_SKILL_NAMES.has(skill.name)) {
    return {
      role: 'persona',
      visibility: 'hidden',
      editable: false,
      actions: ['run'],
    };
  }

  const override = BUILTIN_CATALOG_OVERRIDES[skill.name];
  if (override) {
    return override;
  }

  return {
    role: 'standalone',
    visibility: 'advanced',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  };
}

function createFocusedBuiltinCatalog(
  groupId: string,
  parentSkillId = groupId,
): SkillCatalogManifest {
  return {
    role: 'focused-skill',
    groupId,
    parentSkillIds: [parentSkillId],
    visibility: 'advanced',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  };
}

function createQuickActionBuiltinCatalog(groupId: string): SkillCatalogManifest {
  return {
    role: 'quick-action',
    groupId,
    visibility: 'primary',
    editable: false,
    actions: BUILTIN_FORK_ACTIONS,
  };
}

function getSkillTags(skill: Skill): readonly string[] {
  const tags = skill.mediaWorkflow?.tags;
  if (tags && tags.length > 0) {
    return [...tags];
  }

  return skill.allowedTools?.length ? ['ai', ...(skill.command ? ['slash-command'] : [])] : ['ai'];
}

function getSkillSourcePriority(skill: SkillDef): number {
  return SOURCE_PRIORITY[skill.catalog?.source ?? 'plugin'];
}

function compareSkillDefs(left: SkillDef, right: SkillDef): number {
  const roleOrder =
    getRoleOrder(left.catalog?.role ?? 'standalone') -
    getRoleOrder(right.catalog?.role ?? 'standalone');
  if (roleOrder !== 0) return roleOrder;
  const sourceOrder = getSkillSourcePriority(right) - getSkillSourcePriority(left);
  if (sourceOrder !== 0) return sourceOrder;
  return left.name.localeCompare(right.name);
}

function getRoleOrder(role: SkillCatalogRole): number {
  switch (role) {
    case 'orchestrator':
      return 0;
    case 'standalone':
      return 1;
    case 'quick-action':
      return 2;
    case 'focused-skill':
      return 3;
    case 'persona':
      return 4;
  }
}

function shortenDescription(description: string): string {
  return description.split('.')[0] ?? description;
}

function formatSkillName(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
