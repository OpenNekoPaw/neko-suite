import {
  isAgentProfileKind,
  isAgentProfileRelationship,
  type NekoSkillCapabilityDependency,
  type NekoSkillDependencies,
  type NekoSkillInterfaceMetadata,
  type NekoSkillOverlay,
  type NekoSkillProfileDependency,
  type NekoSkillRelationship,
  type NekoSkillRelationships,
  type SkillDiagnostic,
  type SkillValidationDimension,
} from '@neko/shared';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { validateSkillPackagePath } from './skill-package-path';

const TOP_LEVEL_KEYS = new Set(['schema_version', 'interface', 'dependencies', 'relationships']);
const INTERFACE_KEYS = new Set([
  'display_name',
  'short_description',
  'icon_small',
  'default_prompt',
]);
const DEPENDENCY_KEYS = new Set(['capabilities', 'profiles']);
const CAPABILITY_KEYS = new Set(['id', 'requirement']);
const PROFILE_KEYS = new Set(['id', 'kind', 'relationship', 'version_range']);
const RELATIONSHIP_KEYS = new Set(['skills']);
const SKILL_RELATIONSHIP_KEYS = new Set(['name', 'relationship']);

export interface NekoSkillOverlayParseResult {
  readonly overlay?: NekoSkillOverlay;
  readonly validation: SkillValidationDimension;
}

export function parseNekoSkillOverlay(content: string): NekoSkillOverlayParseResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    return invalidOverlay(
      'neko-overlay-invalid-yaml',
      `agents/neko.yaml is invalid YAML: ${toErrorMessage(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    return invalidOverlay('neko-overlay-invalid', 'agents/neko.yaml must be a mapping.');
  }

  const diagnostics: SkillDiagnostic[] = [];
  rejectUnknownKeys(parsed, TOP_LEVEL_KEYS, 'overlay', diagnostics);
  if (parsed.schema_version !== 1) {
    diagnostics.push(
      errorDiagnostic(
        parsed.schema_version === undefined
          ? 'neko-overlay-schema-missing'
          : 'neko-overlay-schema-unsupported',
        parsed.schema_version === undefined
          ? 'agents/neko.yaml requires schema_version: 1.'
          : `Unsupported agents/neko.yaml schema_version "${String(parsed.schema_version)}".`,
        'schema_version',
      ),
    );
  }

  const interfaceMetadata = parseInterface(parsed.interface, diagnostics);
  const dependencies = parseDependencies(parsed.dependencies, diagnostics);
  const relationships = parseRelationships(parsed.relationships, diagnostics);
  const validation = dimension(diagnostics);
  if (!validation.valid) {
    return { validation };
  }

  return {
    overlay: {
      schemaVersion: 1,
      ...(interfaceMetadata === undefined ? {} : { interface: interfaceMetadata }),
      ...(dependencies === undefined ? {} : { dependencies }),
      ...(relationships === undefined ? {} : { relationships }),
    },
    validation,
  };
}

export function validateNekoSkillOverlay(overlay: NekoSkillOverlay): SkillValidationDimension {
  return parseNekoSkillOverlay(serializeOverlayUnchecked(overlay)).validation;
}

/** Returns null when the supplied overlay has no Neko-specific content. */
export function serializeNekoSkillOverlay(overlay: NekoSkillOverlay): string | null {
  if (!hasNekoSkillOverlayContent(overlay)) {
    return null;
  }
  const validation = validateNekoSkillOverlayShape(overlay);
  if (!validation.valid) {
    throw new Error(
      validation.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('\n'),
    );
  }
  return serializeOverlayUnchecked(overlay);
}

export function hasNekoSkillOverlayContent(overlay: NekoSkillOverlay): boolean {
  return (
    hasDefinedValue(overlay.interface) ||
    hasNonEmptyArray(overlay.dependencies?.capabilities) ||
    hasNonEmptyArray(overlay.dependencies?.profiles) ||
    hasNonEmptyArray(overlay.relationships?.skills)
  );
}

function validateNekoSkillOverlayShape(overlay: NekoSkillOverlay): SkillValidationDimension {
  if (overlay.schemaVersion !== 1) {
    return dimension([
      errorDiagnostic(
        'neko-overlay-schema-unsupported',
        `Unsupported agents/neko.yaml schemaVersion "${String(overlay.schemaVersion)}".`,
        'schemaVersion',
      ),
    ]);
  }
  return parseNekoSkillOverlay(serializeOverlayUnchecked(overlay)).validation;
}

function serializeOverlayUnchecked(overlay: NekoSkillOverlay): string {
  const value: Record<string, unknown> = { schema_version: overlay.schemaVersion };
  const interfaceMetadata = overlay.interface;
  if (hasDefinedValue(interfaceMetadata)) {
    value.interface = {
      ...(interfaceMetadata.displayName === undefined
        ? {}
        : { display_name: interfaceMetadata.displayName }),
      ...(interfaceMetadata.shortDescription === undefined
        ? {}
        : { short_description: interfaceMetadata.shortDescription }),
      ...(interfaceMetadata.iconSmall === undefined
        ? {}
        : { icon_small: interfaceMetadata.iconSmall }),
      ...(interfaceMetadata.defaultPrompt === undefined
        ? {}
        : { default_prompt: interfaceMetadata.defaultPrompt }),
    };
  }

  const capabilities = overlay.dependencies?.capabilities;
  const profiles = overlay.dependencies?.profiles;
  if (hasNonEmptyArray(capabilities) || hasNonEmptyArray(profiles)) {
    value.dependencies = {
      ...(hasNonEmptyArray(capabilities)
        ? {
            capabilities: capabilities.map((item) => ({
              id: item.id,
              requirement: item.requirement,
            })),
          }
        : {}),
      ...(hasNonEmptyArray(profiles)
        ? {
            profiles: profiles.map((item) => ({
              id: item.id,
              kind: item.kind,
              relationship: item.relationship,
              ...(item.versionRange === undefined ? {} : { version_range: item.versionRange }),
            })),
          }
        : {}),
    };
  }

  const relatedSkills = overlay.relationships?.skills;
  if (hasNonEmptyArray(relatedSkills)) {
    value.relationships = {
      skills: relatedSkills.map((item) => ({
        name: item.name,
        relationship: item.relationship,
      })),
    };
  }
  return stringifyYaml(value, { lineWidth: 0 }).trimEnd() + '\n';
}

function parseInterface(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): NekoSkillInterfaceMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-interface-invalid',
        'interface must be a mapping.',
        'interface',
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, INTERFACE_KEYS, 'interface', diagnostics);
  const displayName = optionalString(value.display_name, 'interface.display_name', diagnostics);
  const shortDescription = optionalString(
    value.short_description,
    'interface.short_description',
    diagnostics,
  );
  const iconSmall = optionalString(value.icon_small, 'interface.icon_small', diagnostics);
  const defaultPrompt = optionalString(
    value.default_prompt,
    'interface.default_prompt',
    diagnostics,
  );
  if (iconSmall !== undefined) {
    const pathValidation = validateSkillPackagePath(iconSmall, { allowLeadingDotSlash: true });
    if (!pathValidation.valid) {
      diagnostics.push(
        errorDiagnostic(
          'neko-overlay-icon-path-invalid',
          'interface.icon_small must be a relative path contained in the Skill directory.',
          'interface.icon_small',
        ),
      );
    }
  }
  return compactInterface({ displayName, shortDescription, iconSmall, defaultPrompt });
}

function parseDependencies(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): NekoSkillDependencies | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-dependencies-invalid',
        'dependencies must be a mapping.',
        'dependencies',
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, DEPENDENCY_KEYS, 'dependencies', diagnostics);
  const capabilities = parseArray(
    value.capabilities,
    'dependencies.capabilities',
    diagnostics,
    parseCapability,
  );
  const profiles = parseArray(value.profiles, 'dependencies.profiles', diagnostics, parseProfile);
  if (!capabilities && !profiles) {
    return undefined;
  }
  return {
    ...(capabilities === undefined ? {} : { capabilities }),
    ...(profiles === undefined ? {} : { profiles }),
  };
}

function parseRelationships(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): NekoSkillRelationships | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-relationships-invalid',
        'relationships must be a mapping.',
        'relationships',
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, RELATIONSHIP_KEYS, 'relationships', diagnostics);
  const skills = parseArray(
    value.skills,
    'relationships.skills',
    diagnostics,
    parseSkillRelationship,
  );
  return skills === undefined ? undefined : { skills };
}

function parseCapability(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): NekoSkillCapabilityDependency | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-capability-invalid',
        'Capability dependency must be a mapping.',
        path,
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, CAPABILITY_KEYS, path, diagnostics);
  const id = requiredNonEmptyString(value.id, `${path}.id`, diagnostics);
  const requirement = value.requirement;
  if (requirement !== 'required' && requirement !== 'optional') {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-capability-requirement-invalid',
        'Capability requirement must be "required" or "optional".',
        `${path}.requirement`,
      ),
    );
  }
  if (id === undefined || (requirement !== 'required' && requirement !== 'optional')) {
    return undefined;
  }
  return { id, requirement };
}

function parseProfile(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): NekoSkillProfileDependency | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-profile-invalid',
        'Profile dependency must be a mapping.',
        path,
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, PROFILE_KEYS, path, diagnostics);
  const id = requiredNonEmptyString(value.id, `${path}.id`, diagnostics);
  if (!isAgentProfileKind(value.kind)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-profile-kind-invalid',
        'Profile dependency kind is invalid.',
        `${path}.kind`,
      ),
    );
  }
  if (!isAgentProfileRelationship(value.relationship)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-profile-relationship-invalid',
        'Profile dependency relationship is invalid.',
        `${path}.relationship`,
      ),
    );
  }
  const versionRange = optionalString(value.version_range, `${path}.version_range`, diagnostics);
  if (
    id === undefined ||
    !isAgentProfileKind(value.kind) ||
    !isAgentProfileRelationship(value.relationship)
  ) {
    return undefined;
  }
  return {
    id,
    kind: value.kind,
    relationship: value.relationship,
    ...(versionRange === undefined ? {} : { versionRange }),
  };
}

function parseSkillRelationship(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): NekoSkillRelationship | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'neko-overlay-skill-relationship-invalid',
        'Skill relationship must be a mapping.',
        path,
      ),
    );
    return undefined;
  }
  rejectUnknownKeys(value, SKILL_RELATIONSHIP_KEYS, path, diagnostics);
  const name = requiredNonEmptyString(value.name, `${path}.name`, diagnostics);
  const relationship = requiredNonEmptyString(
    value.relationship,
    `${path}.relationship`,
    diagnostics,
  );
  return name === undefined || relationship === undefined ? undefined : { name, relationship };
}

function parseArray<T>(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
  parseItem: (entry: unknown, path: string, diagnostics: SkillDiagnostic[]) => T | undefined,
): readonly T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      errorDiagnostic('neko-overlay-array-invalid', `${path} must be a non-empty array.`, path),
    );
    return undefined;
  }
  const result: T[] = [];
  value.forEach((entry, index) => {
    const parsed = parseItem(entry, `${path}.${index}`, diagnostics);
    if (parsed !== undefined) {
      result.push(parsed);
    }
  });
  return result;
}

function compactInterface(value: {
  readonly displayName?: string;
  readonly shortDescription?: string;
  readonly iconSmall?: string;
  readonly defaultPrompt?: string;
}): NekoSkillInterfaceMetadata | undefined {
  return Object.values(value).some((entry) => entry !== undefined) ? value : undefined;
}

function optionalString(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(
      errorDiagnostic('neko-overlay-string-invalid', `${path} must be a non-empty string.`, path),
    );
    return undefined;
  }
  return value;
}

function requiredNonEmptyString(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(
      errorDiagnostic('neko-overlay-string-required', `${path} must be a non-empty string.`, path),
    );
    return undefined;
  }
  return value;
}

function rejectUnknownKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: string,
  diagnostics: SkillDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.push(
        errorDiagnostic(
          'neko-overlay-unknown-field',
          `Unsupported agents/neko.yaml field "${path}.${key}".`,
          `${path}.${key}`,
        ),
      );
    }
  }
}

function invalidOverlay(code: string, message: string): NekoSkillOverlayParseResult {
  return { validation: dimension([errorDiagnostic(code, message, 'agents/neko.yaml')]) };
}

function dimension(diagnostics: readonly SkillDiagnostic[]): SkillValidationDimension {
  return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'), diagnostics };
}

function errorDiagnostic(code: string, message: string, path?: string): SkillDiagnostic {
  return {
    area: 'overlay',
    code,
    severity: 'error',
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function hasDefinedValue(
  value: NekoSkillInterfaceMetadata | undefined,
): value is NekoSkillInterfaceMetadata {
  return value !== undefined && Object.values(value).some((entry) => entry !== undefined);
}

function hasNonEmptyArray<T>(value: readonly T[] | undefined): value is readonly T[] {
  return value !== undefined && value.length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
