import {
  createBundleEntryLocator,
  resolveBundleEntryPath,
  validateBundleArchiveMetadata,
  type BundleArchiveEntryMetadata,
  type BundleArchiveValidationIssue,
  type BundleEntryLocator,
  type BundleEntryPathValidationIssue,
  type NkpBundleExpressionIndexEntry,
  type NkpBundleIndex,
  type NkpBundleMotionIndexEntry,
  type NkpBundleTextureIndexEntry,
  type NkpLive2dBundleReference,
} from '@neko/shared';

export type Live2dBundleManifestDiagnosticCode =
  | 'invalid-archive'
  | 'invalid-model3-json'
  | 'invalid-reference'
  | 'missing-entry';

export interface Live2dBundleManifestDiagnostic {
  readonly code: Live2dBundleManifestDiagnosticCode;
  readonly message: string;
  readonly entryPath?: string;
  readonly pathIssue?: BundleEntryPathValidationIssue;
}

export interface Live2dManifestMotionReference {
  readonly name: string;
  readonly group: string;
  readonly locator: BundleEntryLocator;
  readonly fadeInTime?: number;
  readonly fadeOutTime?: number;
}

export interface Live2dBundleManifest {
  readonly bundle: NkpLive2dBundleReference;
  readonly bundleIndex: NkpBundleIndex;
  readonly manifest: BundleEntryLocator;
  readonly moc: BundleEntryLocator;
  readonly textures: readonly NkpBundleTextureIndexEntry[];
  readonly motions: readonly Live2dManifestMotionReference[];
  readonly expressions: readonly NkpBundleExpressionIndexEntry[];
  readonly physics?: BundleEntryLocator;
  readonly referencedEntryPaths: readonly string[];
}

export type Live2dBundleManifestParseResult =
  | {
      readonly ok: true;
      readonly manifest: Live2dBundleManifest;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Live2dBundleManifestDiagnostic[];
    };

export interface ParseLive2dModel3ManifestOptions {
  readonly bundlePath: string;
  readonly manifestEntryPath: string;
  readonly model3Json: unknown;
  readonly archiveEntries: readonly BundleArchiveEntryMetadata[];
  readonly contentHash?: string;
  readonly generatedAt?: string;
}

interface ResolvedReference {
  readonly locator: BundleEntryLocator;
  readonly entryPath: string;
}

interface MotionReferenceDraft {
  readonly group: string;
  readonly name?: string;
  readonly file: string;
  readonly fadeInTime?: number;
  readonly fadeOutTime?: number;
}

interface ExpressionReferenceDraft {
  readonly name: string;
  readonly file: string;
}

export function parseLive2dModel3Manifest(
  options: ParseLive2dModel3ManifestOptions,
): Live2dBundleManifestParseResult {
  const diagnostics: Live2dBundleManifestDiagnostic[] = [];
  const archiveValidation = validateBundleArchiveMetadata(options.archiveEntries);
  if (!archiveValidation.ok) {
    return {
      ok: false,
      diagnostics: archiveValidation.issues.map(archiveIssueToDiagnostic),
    };
  }

  const manifestLocatorResult = createBundleEntryLocator(
    options.bundlePath,
    options.manifestEntryPath,
  );
  if (!manifestLocatorResult.ok || !manifestLocatorResult.locator) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'invalid-reference',
          message: `Invalid Live2D manifest entry path: ${options.manifestEntryPath}`,
          entryPath: options.manifestEntryPath,
          pathIssue: manifestLocatorResult.ok ? undefined : manifestLocatorResult.issue,
        },
      ],
    };
  }

  const normalizedEntries = new Map(
    archiveValidation.normalizedEntries
      .filter((entry) => entry.directory !== true)
      .map((entry) => [entry.entryPath, entry]),
  );

  if (!normalizedEntries.has(manifestLocatorResult.entryPath)) {
    diagnostics.push({
      code: 'missing-entry',
      message: `Live2D manifest entry is missing: ${manifestLocatorResult.entryPath}`,
      entryPath: manifestLocatorResult.entryPath,
    });
  }

  const model3 = normalizeModel3Json(options.model3Json, diagnostics);
  if (!model3) return { ok: false, diagnostics };

  const mocPath = readRequiredString(model3.fileReferences, 'Moc', diagnostics);
  if (!mocPath) return { ok: false, diagnostics };

  const moc = resolveRequiredReference(
    options.bundlePath,
    manifestLocatorResult.entryPath,
    mocPath,
    normalizedEntries,
    diagnostics,
  );
  if (!moc) return { ok: false, diagnostics };

  const textures = readTextureReferences(model3.fileReferences).map((texturePath, index) => ({
    index,
    texturePath,
  }));
  const resolvedTextures: NkpBundleTextureIndexEntry[] = [];
  for (const texture of textures) {
    const resolved = resolveRequiredReference(
      options.bundlePath,
      manifestLocatorResult.entryPath,
      texture.texturePath,
      normalizedEntries,
      diagnostics,
    );
    if (resolved) {
      resolvedTextures.push({
        index: texture.index,
        locator: resolved.locator,
        name: basenameWithoutKnownLive2dSuffix(resolved.entryPath),
      });
    }
  }

  const resolvedMotions: NkpBundleMotionIndexEntry[] = [];
  for (const motion of readMotionReferences(model3.fileReferences)) {
    const resolved = resolveRequiredReference(
      options.bundlePath,
      manifestLocatorResult.entryPath,
      motion.file,
      normalizedEntries,
      diagnostics,
    );
    if (resolved) {
      resolvedMotions.push({
        name: motion.name ?? basenameWithoutKnownLive2dSuffix(resolved.entryPath),
        group: motion.group,
        locator: resolved.locator,
        fadeInTime: motion.fadeInTime,
        fadeOutTime: motion.fadeOutTime,
      });
    }
  }

  const resolvedExpressions: NkpBundleExpressionIndexEntry[] = [];
  for (const expression of readExpressionReferences(model3.fileReferences)) {
    const resolved = resolveRequiredReference(
      options.bundlePath,
      manifestLocatorResult.entryPath,
      expression.file,
      normalizedEntries,
      diagnostics,
    );
    if (resolved) {
      resolvedExpressions.push({
        name: expression.name,
        locator: resolved.locator,
      });
    }
  }

  const physicsPath = readOptionalString(model3.fileReferences, 'Physics');
  const physics = physicsPath
    ? resolveRequiredReference(
        options.bundlePath,
        manifestLocatorResult.entryPath,
        physicsPath,
        normalizedEntries,
        diagnostics,
      )?.locator
    : undefined;

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const referencedEntryPaths = [
    manifestLocatorResult.entryPath,
    moc.entryPath,
    ...resolvedTextures.map((texture) => texture.locator.entryPath),
    ...resolvedMotions.map((motion) => motion.locator.entryPath),
    ...resolvedExpressions.map((expression) => expression.locator.entryPath),
    ...(physics ? [physics.entryPath] : []),
  ];

  const bundle: NkpLive2dBundleReference = {
    path: options.bundlePath,
    contentHash: options.contentHash,
    manifest: manifestLocatorResult.locator,
    moc: moc.locator,
  };

  const bundleIndex: NkpBundleIndex = {
    storageMode: 'bundle-memory',
    manifest: manifestLocatorResult.locator,
    moc: moc.locator,
    textures: resolvedTextures,
    motions: resolvedMotions,
    expressions: resolvedExpressions,
    physics,
    parameterIds: readParameterIds(model3.root),
    generatedAt: options.generatedAt,
  };

  return {
    ok: true,
    manifest: {
      bundle,
      bundleIndex,
      manifest: manifestLocatorResult.locator,
      moc: moc.locator,
      textures: resolvedTextures,
      motions: resolvedMotions,
      expressions: resolvedExpressions,
      physics,
      referencedEntryPaths,
    },
  };
}

function archiveIssueToDiagnostic(
  issue: BundleArchiveValidationIssue,
): Live2dBundleManifestDiagnostic {
  switch (issue.code) {
    case 'unsafe-entry-path':
      return {
        code: 'invalid-archive',
        message: `Unsafe ZIP entry path: ${issue.entryPath}`,
        entryPath: issue.entryPath,
        pathIssue: issue.pathIssue,
      };
    case 'duplicate-entry':
      return {
        code: 'invalid-archive',
        message: `Duplicate ZIP entry after normalization: ${issue.normalizedEntryPath}`,
        entryPath: issue.entryPath,
      };
    case 'entry-too-large':
      return {
        code: 'invalid-archive',
        message: `ZIP entry exceeds limit: ${issue.entryPath}`,
        entryPath: issue.entryPath,
      };
    case 'archive-too-large':
      return {
        code: 'invalid-archive',
        message: `ZIP archive exceeds uncompressed size limit: ${issue.totalUncompressedSize}`,
      };
  }
}

function normalizeModel3Json(
  value: unknown,
  diagnostics: Live2dBundleManifestDiagnostic[],
): {
  readonly root: Record<string, unknown>;
  readonly fileReferences: Record<string, unknown>;
} | null {
  const parsed = typeof value === 'string' ? parseJson(value, diagnostics) : value;
  if (!isRecord(parsed)) {
    diagnostics.push({
      code: 'invalid-model3-json',
      message: 'Live2D model3.json must be a JSON object.',
    });
    return null;
  }

  const fileReferences = parsed['FileReferences'];
  if (!isRecord(fileReferences)) {
    diagnostics.push({
      code: 'invalid-model3-json',
      message: 'Live2D model3.json is missing FileReferences.',
    });
    return null;
  }

  return { root: parsed, fileReferences };
}

function parseJson(value: string, diagnostics: Live2dBundleManifestDiagnostic[]): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    diagnostics.push({
      code: 'invalid-model3-json',
      message: error instanceof Error ? error.message : 'Invalid Live2D model3.json.',
    });
    return null;
  }
}

function resolveRequiredReference(
  bundlePath: string,
  manifestEntryPath: string,
  referencedPath: string,
  entries: ReadonlyMap<string, BundleArchiveEntryMetadata>,
  diagnostics: Live2dBundleManifestDiagnostic[],
): ResolvedReference | null {
  const resolvedPath = resolveBundleEntryPath(manifestEntryPath, referencedPath);
  if (!resolvedPath.ok) {
    diagnostics.push({
      code: 'invalid-reference',
      message: `Invalid Live2D bundle reference: ${referencedPath}`,
      entryPath: referencedPath,
      pathIssue: resolvedPath.issue,
    });
    return null;
  }

  if (!entries.has(resolvedPath.entryPath)) {
    diagnostics.push({
      code: 'missing-entry',
      message: `Live2D bundle entry is missing: ${resolvedPath.entryPath}`,
      entryPath: resolvedPath.entryPath,
    });
    return null;
  }

  const locatorResult = createBundleEntryLocator(bundlePath, resolvedPath.entryPath);
  if (!locatorResult.ok || !locatorResult.locator) {
    diagnostics.push({
      code: 'invalid-reference',
      message: `Invalid Live2D bundle entry path: ${resolvedPath.entryPath}`,
      entryPath: resolvedPath.entryPath,
      pathIssue: locatorResult.ok ? undefined : locatorResult.issue,
    });
    return null;
  }

  return { locator: locatorResult.locator, entryPath: resolvedPath.entryPath };
}

function readRequiredString(
  object: Record<string, unknown>,
  key: string,
  diagnostics: Live2dBundleManifestDiagnostic[],
): string | null {
  const value = object[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push({
      code: 'invalid-model3-json',
      message: `Live2D model3.json is missing FileReferences.${key}.`,
    });
    return null;
  }
  return value;
}

function readOptionalString(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTextureReferences(fileReferences: Record<string, unknown>): string[] {
  const textures = fileReferences['Textures'];
  if (!Array.isArray(textures)) return [];
  return textures.filter((texture): texture is string => typeof texture === 'string');
}

function readExpressionReferences(
  fileReferences: Record<string, unknown>,
): ExpressionReferenceDraft[] {
  const expressions = fileReferences['Expressions'];
  if (!Array.isArray(expressions)) return [];

  const drafts: ExpressionReferenceDraft[] = [];
  for (const expression of expressions) {
    if (!isRecord(expression)) continue;
    const file = expression['File'];
    if (typeof file !== 'string') continue;
    const name = typeof expression['Name'] === 'string' ? expression['Name'] : undefined;
    drafts.push({ name: name ?? basenameWithoutKnownLive2dSuffix(file), file });
  }
  return drafts;
}

function readMotionReferences(fileReferences: Record<string, unknown>): MotionReferenceDraft[] {
  const motions = fileReferences['Motions'];
  if (!isRecord(motions)) return [];

  const drafts: MotionReferenceDraft[] = [];
  for (const [group, groupEntries] of Object.entries(motions)) {
    if (!Array.isArray(groupEntries)) continue;
    groupEntries.forEach((motion, index) => {
      if (!isRecord(motion)) return;
      const file = motion['File'];
      if (typeof file !== 'string') return;
      const name = typeof motion['Name'] === 'string' ? motion['Name'] : undefined;
      drafts.push({
        group,
        name: name ?? `${group}-${index + 1}`,
        file,
        fadeInTime: readOptionalFiniteNumber(motion['FadeInTime']),
        fadeOutTime: readOptionalFiniteNumber(motion['FadeOutTime']),
      });
    });
  }
  return drafts;
}

function readParameterIds(root: Record<string, unknown>): readonly string[] | undefined {
  const groups = root['Groups'];
  if (!Array.isArray(groups)) return undefined;

  const ids = new Set<string>();
  for (const group of groups) {
    if (!isRecord(group)) continue;
    const groupIds = group['Ids'];
    if (!Array.isArray(groupIds)) continue;
    for (const id of groupIds) {
      if (typeof id === 'string' && id.length > 0) {
        ids.add(id);
      }
    }
  }

  return ids.size > 0 ? [...ids] : undefined;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function basenameWithoutKnownLive2dSuffix(pathValue: string): string {
  const fileName = pathValue.replace(/\\/g, '/').split('/').at(-1) ?? pathValue;
  return fileName
    .replace(/\.(?:moc3|model3|motion3|exp3|physics3)\.json$/i, '')
    .replace(/\.[^.]+$/i, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
