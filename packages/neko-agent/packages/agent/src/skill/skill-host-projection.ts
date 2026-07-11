import { createHash } from 'node:crypto';
import type {
  NekoSkillHostProjection,
  NekoSkillOverlay,
  NekoSkillProfileDependency,
  Skill,
  SkillCatalogAction,
  SkillCatalogSource,
  SkillCompatibilityStatus,
  SkillDiagnostic,
  SkillProvenance,
} from '@neko/shared';
import { normalizeSkillCatalogActions } from '@neko/shared';

/** Host inputs used to project facts that must never come from Skill package metadata. */
export interface SkillHostProjectionContext {
  readonly source?: SkillCatalogSource;
  readonly rootId?: string;
  readonly relativePath?: string;
  readonly provenance?: SkillProvenance;
  readonly enabled?: boolean;
  readonly editable?: boolean;
  readonly trusted?: boolean;
  readonly catalogActions?: readonly SkillCatalogAction[];
  /** Host-computed package fingerprint, when a filesystem/package provider has one. */
  readonly fingerprint?: string;
  /** Registered Host capabilities. Omit when availability has not been resolved. */
  readonly availableCapabilities?: ReadonlySet<string>;
  /** Registered Host profile ids. Omit when availability has not been resolved. */
  readonly availableProfiles?: ReadonlySet<string>;
}

export type SkillHostProjectionContextResolver = (
  skill: Skill,
) => SkillHostProjectionContext | undefined;

/**
 * Project all runtime-owned Skill facts from trusted loader/Host inputs.
 * Existing `skill.hostProjection` is intentionally ignored.
 */
export function projectSkillHostProjection(
  skill: Skill,
  context: SkillHostProjectionContext = {},
): NekoSkillHostProjection {
  const source = context.source ?? skill.source;
  const editable = context.editable ?? isEditableSource(source);
  return {
    source,
    location: {
      rootId: context.rootId ?? defaultRootId(source),
      relativePath: context.relativePath ?? skill.name,
    },
    provenance: context.provenance ?? defaultProvenance(source),
    enabled: context.enabled ?? skill.enabled !== false,
    editable,
    trusted: context.trusted ?? source === 'builtin',
    compatibility: resolveNekoSkillCompatibility(skill.nekoOverlay, context),
    fingerprint: context.fingerprint ?? fingerprintProjectedSkill(skill),
    catalogActions: normalizeSkillCatalogActions(
      context.catalogActions ?? defaultCatalogActions(source, editable),
    ),
  };
}

/** Resolve current Host compatibility independently from portable/overlay validity. */
export function resolveNekoSkillCompatibility(
  overlay: NekoSkillOverlay | undefined,
  context: Pick<SkillHostProjectionContext, 'availableCapabilities' | 'availableProfiles'> = {},
): SkillCompatibilityStatus {
  const diagnostics: SkillDiagnostic[] = [];
  let hasRequiredUnknown = false;
  let hasRequiredMissing = false;

  for (const dependency of overlay?.dependencies?.capabilities ?? []) {
    const available = context.availableCapabilities?.has(dependency.id);
    if (available === true) {
      continue;
    }
    if (available === undefined) {
      if (dependency.requirement === 'required') {
        hasRequiredUnknown = true;
      }
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-capability-availability-unknown',
          severity: 'info',
          message: `Capability availability is unknown: ${dependency.id}.`,
          path: `dependencies.capabilities.${dependency.id}`,
        }),
      );
      continue;
    }
    if (dependency.requirement === 'required') {
      hasRequiredMissing = true;
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-required-capability-missing',
          severity: 'error',
          message: `Required capability is unavailable: ${dependency.id}.`,
          path: `dependencies.capabilities.${dependency.id}`,
        }),
      );
    } else {
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-optional-capability-missing',
          severity: 'warning',
          message: `Optional capability is unavailable: ${dependency.id}.`,
          path: `dependencies.capabilities.${dependency.id}`,
        }),
      );
    }
  }

  for (const dependency of overlay?.dependencies?.profiles ?? []) {
    const available = context.availableProfiles?.has(dependency.id);
    const required = isRequiredProfileDependency(dependency);
    if (available === true) {
      continue;
    }
    if (available === undefined) {
      if (required) {
        hasRequiredUnknown = true;
      }
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-profile-availability-unknown',
          severity: 'info',
          message: `Profile availability is unknown: ${dependency.id}.`,
          path: `dependencies.profiles.${dependency.id}`,
        }),
      );
      continue;
    }
    if (required) {
      hasRequiredMissing = true;
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-required-profile-missing',
          severity: 'error',
          message: `Required profile is unavailable: ${dependency.id}.`,
          path: `dependencies.profiles.${dependency.id}`,
        }),
      );
    } else {
      diagnostics.push(
        compatibilityDiagnostic({
          code: 'skill-preferred-profile-missing',
          severity: 'warning',
          message: `Preferred profile is unavailable: ${dependency.id}.`,
          path: `dependencies.profiles.${dependency.id}`,
        }),
      );
    }
  }

  return {
    state: hasRequiredMissing ? 'incompatible' : hasRequiredUnknown ? 'unknown' : 'compatible',
    diagnostics,
  };
}

function isRequiredProfileDependency(dependency: NekoSkillProfileDependency): boolean {
  return dependency.relationship !== 'prefers';
}

function isEditableSource(source: SkillCatalogSource): boolean {
  return source === 'project' || source === 'personal';
}

function defaultRootId(source: SkillCatalogSource): string {
  switch (source) {
    case 'project':
      return 'project-agent-skills';
    case 'personal':
      return 'personal-agent-skills';
    case 'builtin':
      return 'builtin-skills';
    case 'market':
      return 'market-skills';
    case 'plugin':
      return 'plugin-skills';
  }
}

function defaultProvenance(source: SkillCatalogSource): SkillProvenance {
  switch (source) {
    case 'project':
      return 'workspace';
    case 'personal':
      return 'user';
    case 'builtin':
      return 'builtin';
    case 'market':
      return 'marketplace';
    case 'plugin':
      return 'plugin';
  }
}

function defaultCatalogActions(
  source: SkillCatalogSource,
  editable: boolean,
): readonly SkillCatalogAction[] {
  if (editable) {
    return [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }];
  }
  if (source === 'builtin' || source === 'market') {
    return [{ id: 'run' }, { id: 'fork' }];
  }
  return [{ id: 'run' }];
}

function fingerprintProjectedSkill(skill: Skill): string {
  const authorProjection = skill.portableDefinition ?? {
    name: skill.name,
    description: skill.description,
    body: skill.content,
    ...(skill.allowedTools === undefined ? {} : { allowedTools: skill.allowedTools }),
  };
  const payload = stableStringify({
    skill: authorProjection,
    overlay: skill.nekoOverlay ?? null,
    entryPointKind: skill.entryPointKind ?? 'skill',
    command: skill.command ?? null,
  });
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Cannot fingerprint undefined Skill projection value');
  }
  return serialized;
}

function compatibilityDiagnostic(input: {
  readonly code: string;
  readonly severity: SkillDiagnostic['severity'];
  readonly message: string;
  readonly path: string;
}): SkillDiagnostic {
  return {
    area: 'compatibility',
    code: input.code,
    severity: input.severity,
    message: input.message,
    path: input.path,
  };
}
