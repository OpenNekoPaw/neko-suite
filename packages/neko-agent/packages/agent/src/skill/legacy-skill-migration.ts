import type {
  CreateSkillInput,
  CreateSkillResult,
  LegacySkillMigrationFailureCode,
  LegacySkillMigrationInput,
  LegacySkillMigrationPlan,
  LegacySkillMigrationResult,
  NekoSkillCapabilityDependency,
  NekoSkillOverlay,
  NekoSkillProfileDependency,
  NekoSkillRelationship,
  PortableSkillDefinition,
  SkillDiagnostic,
  SkillResourceInput,
} from '@neko/shared';
import { isAgentProfileKind, isAgentProfileRelationship } from '@neko/shared';
import { parse as parseYaml } from 'yaml';
import {
  resolvePersonalAgentSkillsDir,
  resolvePersonalNekoContentDir,
  resolveProjectAgentSkillsDir,
  resolveProjectNekoContentDir,
} from '../workspace';
import { validateNekoSkillOverlay } from './neko-skill-overlay';
import { validatePortableSkillDefinition } from './portable-skill';
import { validateSkillPackagePath, validateSkillResources } from './skill-package-path';

const LEGACY_SKILL_FILE = 'SKILL.md';
const LEGACY_MANIFEST_FILE = 'manifest.json';
const LEGACY_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'icon',
  'tools-ref',
  'model',
  'enabled',
  'shell',
  'paths',
  'market-id',
]);
const LEGACY_MANIFEST_KEYS = new Set([
  'version',
  'domain',
  'requiredSubpackages',
  'autoInvoke',
  'referencedAssets',
  'referencedSkills',
  'profileReferences',
  'mediaWorkflow',
  'compliance',
  'catalog',
]);
const UNMAPPABLE_FRONTMATTER_KEYS = [
  'tools-ref',
  'model',
  'enabled',
  'shell',
  'paths',
  'market-id',
] as const;
const UNMAPPABLE_MANIFEST_KEYS = [
  'autoInvoke',
  'referencedAssets',
  'mediaWorkflow',
  'compliance',
  'catalog',
] as const;

export interface LegacySkillMigrationDirentLike {
  readonly name: string;
  isDirectory(): boolean;
  isSymbolicLink?(): boolean;
}

export interface LegacySkillMigrationFs {
  access(path: string): Promise<unknown>;
  readFile(path: string, encoding: 'utf-8' | 'base64'): Promise<string>;
  readdir(
    path: string,
    options: { readonly withFileTypes: true },
  ): Promise<LegacySkillMigrationDirentLike[]>;
}

export interface LegacySkillMigrationPath {
  join(...parts: string[]): string;
}

export interface LegacySkillMigrationRuntimeOptions {
  readonly fs: LegacySkillMigrationFs;
  readonly path: LegacySkillMigrationPath;
  readonly homeDir: string;
  readonly getWorkspaceRoot?: () => string | null | undefined;
  readonly createSkill: (input: CreateSkillInput) => Promise<CreateSkillResult>;
}

export interface LegacySkillMigrationRuntime {
  plan(input: LegacySkillMigrationInput): Promise<LegacySkillMigrationPlan>;
  migrate(input: LegacySkillMigrationInput): Promise<LegacySkillMigrationResult>;
}

export class LegacySkillMigrationError extends Error {
  readonly code: LegacySkillMigrationFailureCode;
  readonly diagnostics: readonly SkillDiagnostic[];

  constructor(code: LegacySkillMigrationFailureCode, diagnostics: readonly SkillDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    this.name = 'LegacySkillMigrationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

/**
 * Explicit-only adapter for legacy `.neko/skills` imports.
 * Normal discovery, loading, creation, and catalog code must not depend on this module.
 */
export function createLegacySkillMigrationRuntime(
  options: LegacySkillMigrationRuntimeOptions,
): LegacySkillMigrationRuntime {
  return new DefaultLegacySkillMigrationRuntime(options);
}

class DefaultLegacySkillMigrationRuntime implements LegacySkillMigrationRuntime {
  constructor(private readonly options: LegacySkillMigrationRuntimeOptions) {}

  async plan(input: LegacySkillMigrationInput): Promise<LegacySkillMigrationPlan> {
    const paths = this.resolvePaths(input);
    await this.requireLegacySource(paths.sourcePath);
    if (await this.pathExists(paths.targetPath)) {
      throw migrationError(
        'migration-target-conflict',
        'legacy-migration-target-conflict',
        `Canonical Skill target already exists: ${paths.targetPath}`,
        paths.targetPath,
      );
    }

    const skillMarkdown = await this.readRequiredText(
      this.options.path.join(paths.sourcePath, LEGACY_SKILL_FILE),
      'migration-source-invalid',
      'legacy-skill-file-missing',
      `Legacy Skill is missing ${LEGACY_SKILL_FILE}.`,
    );
    const parsedSkill = parseLegacySkillMarkdown(skillMarkdown, input.name);
    const manifest = await this.readLegacyManifest(paths.sourcePath);
    const mappedManifest = mapLegacyManifest(manifest);
    const resources = await this.collectResources(paths.sourcePath);
    const resourceDiagnostics = validateSkillResources(resources);
    if (resourceDiagnostics.length > 0) {
      throw new LegacySkillMigrationError(
        'migration-data-unmappable',
        resourceDiagnostics.map((diagnostic) => ({
          ...diagnostic,
          area: 'migration',
          code: `legacy-migration-${diagnostic.code}`,
        })),
      );
    }

    const skill = mergePortableDefinition(parsedSkill.definition, mappedManifest.metadata);
    const neko = mergeNekoOverlay(parsedSkill.neko, mappedManifest.neko);
    assertLegacyIconResourceExists(neko, resources);
    const portableValidation = validatePortableSkillDefinition(skill, {
      directoryName: input.name,
    });
    if (!portableValidation.valid) {
      throw new LegacySkillMigrationError(
        'migration-source-invalid',
        portableValidation.diagnostics,
      );
    }
    if (neko !== undefined) {
      const overlayValidation = validateNekoSkillOverlay(neko);
      if (!overlayValidation.valid) {
        throw new LegacySkillMigrationError(
          'migration-source-invalid',
          overlayValidation.diagnostics,
        );
      }
    }

    return {
      sourcePath: paths.sourcePath,
      targetPath: paths.targetPath,
      createInput: {
        target: input.target,
        skill,
        ...(resources.length === 0 ? {} : { resources }),
        ...(neko === undefined ? {} : { neko }),
      },
      diagnostics: [],
    };
  }

  async migrate(input: LegacySkillMigrationInput): Promise<LegacySkillMigrationResult> {
    const plan = await this.plan(input);
    try {
      const created = await this.options.createSkill(plan.createInput);
      return {
        sourcePath: plan.sourcePath,
        created,
        diagnostics: plan.diagnostics,
      };
    } catch (error) {
      const creationCode = readErrorCode(error);
      if (creationCode === 'skill-already-exists' || creationCode === 'atomic-commit-conflict') {
        throw migrationError(
          'migration-target-conflict',
          'legacy-migration-target-conflict',
          `Canonical Skill target was committed before migration completed: ${plan.targetPath}`,
          plan.targetPath,
        );
      }
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-create-failed',
        `Failed to create migrated Skill: ${formatError(error)}`,
        plan.targetPath,
      );
    }
  }

  private resolvePaths(input: LegacySkillMigrationInput): {
    readonly sourcePath: string;
    readonly targetPath: string;
  } {
    const nameValidation = validateSkillPackagePath(input.name);
    if (
      !nameValidation.valid ||
      nameValidation.normalizedPath === undefined ||
      nameValidation.normalizedPath.includes('/')
    ) {
      throw migrationError(
        'migration-source-invalid',
        'legacy-migration-skill-name-invalid',
        `Invalid legacy Skill directory name: ${input.name}`,
        input.name,
      );
    }

    const workspaceRoot = this.options.getWorkspaceRoot?.() ?? null;
    const sourceRoot =
      input.source === 'personal'
        ? resolvePersonalNekoContentDir(this.options.homeDir, 'skills')
        : resolveProjectNekoContentDir(workspaceRoot, 'skills');
    const targetRoot =
      input.target === 'personal'
        ? resolvePersonalAgentSkillsDir(this.options.homeDir)
        : resolveProjectAgentSkillsDir(workspaceRoot);
    if (sourceRoot === null || targetRoot === null) {
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-root-unavailable',
        'A workspace folder is required for project Skill migration.',
      );
    }
    return {
      sourcePath: this.options.path.join(sourceRoot, input.name),
      targetPath: this.options.path.join(targetRoot, input.name),
    };
  }

  private async requireLegacySource(sourcePath: string): Promise<void> {
    try {
      await this.options.fs.access(sourcePath);
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        throw migrationError(
          'migration-source-not-found',
          'legacy-migration-source-not-found',
          `Legacy Skill source does not exist: ${sourcePath}`,
          sourcePath,
        );
      }
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-source-access-failed',
        `Failed to access legacy Skill source: ${formatError(error)}`,
        sourcePath,
      );
    }
  }

  private async readRequiredText(
    filePath: string,
    failureCode: LegacySkillMigrationFailureCode,
    diagnosticCode: string,
    missingMessage: string,
  ): Promise<string> {
    try {
      return await this.options.fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        throw migrationError(failureCode, diagnosticCode, missingMessage, filePath);
      }
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-read-failed',
        `Failed to read legacy Skill file: ${formatError(error)}`,
        filePath,
      );
    }
  }

  private async readLegacyManifest(
    sourcePath: string,
  ): Promise<Readonly<Record<string, unknown>> | undefined> {
    const manifestPath = this.options.path.join(sourcePath, LEGACY_MANIFEST_FILE);
    if (!(await this.pathExists(manifestPath))) {
      return undefined;
    }
    const content = await this.readRequiredText(
      manifestPath,
      'migration-source-invalid',
      'legacy-manifest-missing',
      `Legacy Skill manifest disappeared during migration planning: ${manifestPath}`,
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw migrationError(
        'migration-source-invalid',
        'legacy-manifest-invalid-json',
        `Legacy manifest.json is invalid JSON: ${formatError(error)}`,
        manifestPath,
      );
    }
    if (!isRecord(parsed)) {
      throw migrationError(
        'migration-source-invalid',
        'legacy-manifest-invalid-shape',
        'Legacy manifest.json must contain a JSON object.',
        manifestPath,
      );
    }
    return parsed;
  }

  private async collectResources(sourcePath: string): Promise<readonly SkillResourceInput[]> {
    const resources: SkillResourceInput[] = [];
    await this.collectResourcesFromDirectory(sourcePath, '', resources);
    return resources;
  }

  private async collectResourcesFromDirectory(
    directoryPath: string,
    relativeDirectory: string,
    resources: SkillResourceInput[],
  ): Promise<void> {
    let entries: LegacySkillMigrationDirentLike[];
    try {
      entries = await this.options.fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-directory-read-failed',
        `Failed to enumerate legacy Skill resources: ${formatError(error)}`,
        directoryPath,
      );
    }

    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = this.options.path.join(directoryPath, entry.name);
      if (
        relativeDirectory.length === 0 &&
        (entry.name === LEGACY_SKILL_FILE || entry.name === LEGACY_MANIFEST_FILE)
      ) {
        continue;
      }
      if (entry.isSymbolicLink?.()) {
        throw migrationError(
          'migration-data-unmappable',
          'legacy-migration-symbolic-link-unmappable',
          `Symbolic links cannot be migrated safely: ${relativePath}`,
          relativePath,
        );
      }
      if (entry.isDirectory()) {
        await this.collectResourcesFromDirectory(absolutePath, relativePath, resources);
        continue;
      }
      try {
        resources.push({
          path: relativePath,
          encoding: 'base64',
          content: await this.options.fs.readFile(absolutePath, 'base64'),
        });
      } catch (error) {
        throw migrationError(
          'migration-filesystem-error',
          'legacy-migration-resource-read-failed',
          `Failed to read legacy Skill resource: ${formatError(error)}`,
          relativePath,
        );
      }
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await this.options.fs.access(filePath);
      return true;
    } catch (error) {
      if (readErrorCode(error) === 'ENOENT') {
        return false;
      }
      throw migrationError(
        'migration-filesystem-error',
        'legacy-migration-path-access-failed',
        `Failed to access Skill path: ${formatError(error)}`,
        filePath,
      );
    }
  }
}

interface ParsedLegacySkill {
  readonly definition: PortableSkillDefinition;
  readonly neko?: NekoSkillOverlay;
}

interface MappedLegacyManifest {
  readonly metadata?: Readonly<Record<string, string>>;
  readonly neko?: NekoSkillOverlay;
}

function parseLegacySkillMarkdown(content: string, directoryName: string): ParsedLegacySkill {
  const extracted = extractFrontmatter(content);
  if (extracted === undefined) {
    throw migrationError(
      'migration-source-invalid',
      'legacy-skill-frontmatter-missing',
      'Legacy SKILL.md must begin with YAML frontmatter.',
      LEGACY_SKILL_FILE,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(extracted.yaml);
  } catch (error) {
    throw migrationError(
      'migration-source-invalid',
      'legacy-skill-frontmatter-invalid-yaml',
      `Legacy SKILL.md frontmatter is invalid YAML: ${formatError(error)}`,
      LEGACY_SKILL_FILE,
    );
  }
  if (!isRecord(parsed)) {
    throw migrationError(
      'migration-source-invalid',
      'legacy-skill-frontmatter-invalid-shape',
      'Legacy SKILL.md frontmatter must be a mapping.',
      LEGACY_SKILL_FILE,
    );
  }

  const unmappable = collectUnmappableKeys(
    parsed,
    LEGACY_FRONTMATTER_KEYS,
    UNMAPPABLE_FRONTMATTER_KEYS,
    'frontmatter',
  );
  if (unmappable.length > 0) {
    throw new LegacySkillMigrationError('migration-data-unmappable', unmappable);
  }

  const diagnostics: SkillDiagnostic[] = [];
  const name = readRequiredString(parsed.name, 'name', diagnostics);
  const description = readRequiredString(parsed.description, 'description', diagnostics);
  const license = readOptionalString(parsed.license, 'license', diagnostics);
  const compatibility = readOptionalString(parsed.compatibility, 'compatibility', diagnostics);
  const metadata = readStringMap(parsed.metadata, diagnostics);
  const allowedTools = readAllowedTools(parsed['allowed-tools'], diagnostics);
  if (diagnostics.length > 0 || name === undefined || description === undefined) {
    throw new LegacySkillMigrationError('migration-source-invalid', diagnostics);
  }

  let neko: NekoSkillOverlay | undefined;
  if (parsed.icon !== undefined) {
    const icon = readOptionalString(parsed.icon, 'icon', diagnostics);
    if (icon !== undefined) {
      const validation = validateSkillPackagePath(icon, { allowLeadingDotSlash: true });
      if (!validation.valid || validation.normalizedPath === undefined) {
        throw migrationError(
          'migration-data-unmappable',
          'legacy-skill-icon-unmappable',
          'Legacy icon must be a relative file path to map into agents/neko.yaml.',
          'icon',
        );
      }
      neko = {
        schemaVersion: 1,
        interface: { iconSmall: validation.normalizedPath },
      };
    }
  }
  if (diagnostics.length > 0) {
    throw new LegacySkillMigrationError('migration-source-invalid', diagnostics);
  }

  const definition: PortableSkillDefinition = {
    name,
    description,
    body: extracted.body,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(allowedTools === undefined ? {} : { allowedTools }),
  };
  const validation = validatePortableSkillDefinition(definition, { directoryName });
  if (!validation.valid) {
    throw new LegacySkillMigrationError('migration-source-invalid', validation.diagnostics);
  }
  return { definition, ...(neko === undefined ? {} : { neko }) };
}

function mapLegacyManifest(
  manifest: Readonly<Record<string, unknown>> | undefined,
): MappedLegacyManifest {
  if (manifest === undefined) {
    return {};
  }
  const unmappable = collectUnmappableKeys(
    manifest,
    LEGACY_MANIFEST_KEYS,
    UNMAPPABLE_MANIFEST_KEYS,
    'manifest',
  );
  if (unmappable.length > 0) {
    throw new LegacySkillMigrationError('migration-data-unmappable', unmappable);
  }

  const diagnostics: SkillDiagnostic[] = [];
  const metadata: Record<string, string> = {};
  const version = readOptionalString(manifest.version, 'manifest.version', diagnostics);
  const domain = readOptionalString(manifest.domain, 'manifest.domain', diagnostics);
  if (version !== undefined) metadata.version = version;
  if (domain !== undefined) metadata.domain = domain;

  const capabilities = parseRequiredSubpackages(manifest.requiredSubpackages, diagnostics);
  const skills = parseRelatedSkills(manifest.referencedSkills, diagnostics);
  const profiles = parseProfileReferences(manifest.profileReferences, diagnostics);
  if (diagnostics.length > 0) {
    throw new LegacySkillMigrationError('migration-source-invalid', diagnostics);
  }

  const neko = createOverlay({ capabilities, skills, profiles });
  return {
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    ...(neko === undefined ? {} : { neko }),
  };
}

function parseRequiredSubpackages(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): readonly NekoSkillCapabilityDependency[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(
      invalidDiagnostic(
        'legacy-required-subpackages-invalid',
        'manifest.requiredSubpackages must be an array.',
        'manifest.requiredSubpackages',
      ),
    );
    return undefined;
  }
  const result: NekoSkillCapabilityDependency[] = [];
  value.forEach((entry, index) => {
    const path = `manifest.requiredSubpackages.${index}`;
    if (!isRecord(entry)) {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-required-subpackage-invalid',
          'Each requiredSubpackages entry must be an object.',
          path,
        ),
      );
      return;
    }
    assertNoUnknownObjectKeys(entry, new Set(['id', 'required', 'minVersion', 'fallback']), path);
    if (entry.minVersion !== undefined || entry.fallback !== undefined) {
      throw migrationError(
        'migration-data-unmappable',
        'legacy-required-subpackage-constraint-unmappable',
        'Legacy subpackage minVersion/fallback semantics cannot be represented by the Neko Skill overlay.',
        path,
      );
    }
    const id = readRequiredString(entry.id, `${path}.id`, diagnostics);
    if (typeof entry.required !== 'boolean') {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-required-subpackage-requirement-invalid',
          'requiredSubpackages.required must be a boolean.',
          `${path}.required`,
        ),
      );
      return;
    }
    if (id !== undefined) {
      result.push({ id, requirement: entry.required ? 'required' : 'optional' });
    }
  });
  return result.length === 0 ? undefined : result;
}

function parseRelatedSkills(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): readonly NekoSkillRelationship[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(
      invalidDiagnostic(
        'legacy-referenced-skills-invalid',
        'manifest.referencedSkills must be an array.',
        'manifest.referencedSkills',
      ),
    );
    return undefined;
  }
  const result: NekoSkillRelationship[] = [];
  value.forEach((entry, index) => {
    const path = `manifest.referencedSkills.${index}`;
    if (!isRecord(entry)) {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-referenced-skill-invalid',
          'Each referencedSkills entry must be an object.',
          path,
        ),
      );
      return;
    }
    assertNoUnknownObjectKeys(entry, new Set(['id', 'relationship']), path);
    const name = readRequiredString(entry.id, `${path}.id`, diagnostics);
    const relationship = readRequiredString(
      entry.relationship,
      `${path}.relationship`,
      diagnostics,
    );
    if (name !== undefined && relationship !== undefined) {
      result.push({ name, relationship });
    }
  });
  return result.length === 0 ? undefined : result;
}

function parseProfileReferences(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): readonly NekoSkillProfileDependency[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(
      invalidDiagnostic(
        'legacy-profile-references-invalid',
        'manifest.profileReferences must be an array.',
        'manifest.profileReferences',
      ),
    );
    return undefined;
  }
  const result: NekoSkillProfileDependency[] = [];
  value.forEach((entry, index) => {
    const path = `manifest.profileReferences.${index}`;
    if (!isRecord(entry)) {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-profile-reference-invalid',
          'Each profileReferences entry must be an object.',
          path,
        ),
      );
      return;
    }
    assertNoUnknownObjectKeys(
      entry,
      new Set(['profileId', 'kind', 'relationship', 'versionRange']),
      path,
    );
    const id = readRequiredString(entry.profileId, `${path}.profileId`, diagnostics);
    const versionRange = readOptionalString(
      entry.versionRange,
      `${path}.versionRange`,
      diagnostics,
    );
    if (!isAgentProfileKind(entry.kind)) {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-profile-kind-invalid',
          'profileReferences.kind is invalid.',
          `${path}.kind`,
        ),
      );
    }
    if (!isAgentProfileRelationship(entry.relationship)) {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-profile-relationship-invalid',
          'profileReferences.relationship is invalid.',
          `${path}.relationship`,
        ),
      );
    }
    if (
      id !== undefined &&
      isAgentProfileKind(entry.kind) &&
      isAgentProfileRelationship(entry.relationship)
    ) {
      result.push({
        id,
        kind: entry.kind,
        relationship: entry.relationship,
        ...(versionRange === undefined ? {} : { versionRange }),
      });
    }
  });
  return result.length === 0 ? undefined : result;
}

function createOverlay(input: {
  readonly capabilities?: readonly NekoSkillCapabilityDependency[];
  readonly profiles?: readonly NekoSkillProfileDependency[];
  readonly skills?: readonly NekoSkillRelationship[];
}): NekoSkillOverlay | undefined {
  const hasDependencies = input.capabilities !== undefined || input.profiles !== undefined;
  if (!hasDependencies && input.skills === undefined) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    ...(hasDependencies
      ? {
          dependencies: {
            ...(input.capabilities === undefined ? {} : { capabilities: input.capabilities }),
            ...(input.profiles === undefined ? {} : { profiles: input.profiles }),
          },
        }
      : {}),
    ...(input.skills === undefined ? {} : { relationships: { skills: input.skills } }),
  };
}

function mergePortableDefinition(
  definition: PortableSkillDefinition,
  manifestMetadata: Readonly<Record<string, string>> | undefined,
): PortableSkillDefinition {
  if (manifestMetadata === undefined) {
    return definition;
  }
  const metadata = { ...(definition.metadata ?? {}) };
  for (const [key, value] of Object.entries(manifestMetadata)) {
    const current = metadata[key];
    if (current !== undefined && current !== value) {
      throw migrationError(
        'migration-data-unmappable',
        'legacy-metadata-conflict',
        `Legacy manifest metadata conflicts with SKILL.md metadata for "${key}".`,
        `metadata.${key}`,
      );
    }
    metadata[key] = value;
  }
  return { ...definition, metadata };
}

function mergeNekoOverlay(
  first: NekoSkillOverlay | undefined,
  second: NekoSkillOverlay | undefined,
): NekoSkillOverlay | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return {
    schemaVersion: 1,
    ...(first.interface === undefined ? {} : { interface: first.interface }),
    ...(second.dependencies === undefined ? {} : { dependencies: second.dependencies }),
    ...(second.relationships === undefined ? {} : { relationships: second.relationships }),
  };
}

function collectUnmappableKeys(
  value: Readonly<Record<string, unknown>>,
  knownKeys: ReadonlySet<string>,
  explicitlyUnmappableKeys: readonly string[],
  pathPrefix: string,
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  for (const key of Object.keys(value)) {
    if (!knownKeys.has(key) || explicitlyUnmappableKeys.includes(key)) {
      diagnostics.push({
        area: 'migration',
        code: 'legacy-field-unmappable',
        severity: 'error',
        message: `Legacy field "${pathPrefix}.${key}" cannot be represented without semantic loss.`,
        path: `${pathPrefix}.${key}`,
      });
    }
  }
  return diagnostics;
}

function assertNoUnknownObjectKeys(
  value: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  path: string,
): void {
  const diagnostics = Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .map((key) =>
      invalidDiagnostic(
        'legacy-field-unmappable',
        `Legacy field "${path}.${key}" cannot be represented without semantic loss.`,
        `${path}.${key}`,
      ),
    );
  if (diagnostics.length > 0) {
    throw new LegacySkillMigrationError('migration-data-unmappable', diagnostics);
  }
}

function assertLegacyIconResourceExists(
  overlay: NekoSkillOverlay | undefined,
  resources: readonly SkillResourceInput[],
): void {
  const iconPath = overlay?.interface?.iconSmall;
  if (iconPath === undefined || resources.some((resource) => resource.path === iconPath)) {
    return;
  }
  throw migrationError(
    'migration-data-unmappable',
    'legacy-skill-icon-resource-missing',
    `Legacy icon resource does not exist: ${iconPath}`,
    iconPath,
  );
}

function readRequiredString(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(
      invalidDiagnostic('legacy-string-required', `${path} must be a non-empty string.`, path),
    );
    return undefined;
  }
  return value;
}

function readOptionalString(
  value: unknown,
  path: string,
  diagnostics: SkillDiagnostic[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(
      invalidDiagnostic(
        'legacy-string-invalid',
        `${path} must be a non-empty string when present.`,
        path,
      ),
    );
    return undefined;
  }
  return value;
}

function readStringMap(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push(
      invalidDiagnostic(
        'legacy-metadata-invalid',
        'metadata must be a string-to-string mapping.',
        'metadata',
      ),
    );
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      diagnostics.push(
        invalidDiagnostic(
          'legacy-metadata-value-invalid',
          `metadata.${key} must be a string.`,
          `metadata.${key}`,
        ),
      );
      continue;
    }
    result[key] = entry;
  }
  return result;
}

function readAllowedTools(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    const tools = value.split(/[\s,]+/).filter(Boolean);
    if (tools.length > 0) return tools;
  } else if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  ) {
    return value;
  }
  diagnostics.push(
    invalidDiagnostic(
      'legacy-allowed-tools-invalid',
      'allowed-tools must be a non-empty string or string array.',
      'allowed-tools',
    ),
  );
  return undefined;
}

function extractFrontmatter(
  content: string,
): { readonly yaml: string; readonly body: string } | undefined {
  const normalized = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match || match[1] === undefined) return undefined;
  return {
    yaml: match[1],
    body: normalized.slice(match[0].length).trim(),
  };
}

function invalidDiagnostic(code: string, message: string, path?: string): SkillDiagnostic {
  return {
    area: 'migration',
    code,
    severity: 'error',
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function migrationError(
  code: LegacySkillMigrationFailureCode,
  diagnosticCode: string,
  message: string,
  path?: string,
): LegacySkillMigrationError {
  return new LegacySkillMigrationError(code, [invalidDiagnostic(diagnosticCode, message, path)]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
