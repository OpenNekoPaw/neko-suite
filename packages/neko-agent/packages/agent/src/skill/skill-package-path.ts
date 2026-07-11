import type { SkillDiagnostic, SkillResourceInput } from '@neko/shared';

const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const RESERVED_SKILL_PATHS = new Set(['skill.md', 'agents/neko.yaml', 'manifest.json']);

export interface SkillPackagePathValidationOptions {
  readonly allowLeadingDotSlash?: boolean;
  readonly rejectReserved?: boolean;
}

export interface SkillPackagePathValidationResult {
  readonly valid: boolean;
  readonly normalizedPath?: string;
  readonly diagnostic?: SkillDiagnostic;
}

/** Validate an application-independent relative path before any filesystem join. */
export function validateSkillPackagePath(
  value: string,
  options: SkillPackagePathValidationOptions = {},
): SkillPackagePathValidationResult {
  if (value.length === 0 || value.trim().length === 0) {
    return invalidPath(
      value,
      'skill-resource-path-empty',
      'Skill resource path must not be empty.',
    );
  }
  if (value.includes('\0')) {
    return invalidPath(
      value,
      'skill-resource-path-invalid',
      'Skill resource path contains a NUL byte.',
    );
  }
  if (value.startsWith('/') || value.startsWith('\\') || WINDOWS_ABSOLUTE_PATH.test(value)) {
    return invalidPath(
      value,
      'skill-resource-path-absolute',
      'Skill resource path must be relative.',
    );
  }

  const portablePath = value.replaceAll('\\', '/');
  const withoutPrefix =
    options.allowLeadingDotSlash && portablePath.startsWith('./')
      ? portablePath.slice(2)
      : portablePath;
  const segments = withoutPrefix.split('/');
  if (
    withoutPrefix.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    return invalidPath(
      value,
      'skill-resource-path-traversal',
      'Skill resource path must stay inside the Skill directory without empty, dot, or parent segments.',
    );
  }

  const normalizedPath = segments.join('/');
  if (options.rejectReserved && RESERVED_SKILL_PATHS.has(normalizedPath.toLowerCase())) {
    return {
      valid: false,
      diagnostic: {
        area: 'creation',
        code: 'skill-resource-path-reserved',
        severity: 'error',
        message: `Resource path "${value}" is reserved by the Skill package format.`,
        path: value,
      },
    };
  }

  return { valid: true, normalizedPath };
}

export function validateSkillResources(
  resources: readonly SkillResourceInput[] | undefined,
): readonly SkillDiagnostic[] {
  if (!resources) {
    return [];
  }

  const diagnostics: SkillDiagnostic[] = [];
  const paths = new Set<string>();
  for (const resource of resources) {
    const validation = validateSkillPackagePath(resource.path, { rejectReserved: true });
    if (!validation.valid || !validation.normalizedPath) {
      if (validation.diagnostic) {
        diagnostics.push(validation.diagnostic);
      }
      continue;
    }
    const collisionKey = validation.normalizedPath.toLowerCase();
    if (paths.has(collisionKey)) {
      diagnostics.push({
        area: 'creation',
        code: 'skill-resource-path-duplicate',
        severity: 'error',
        message: `Resource path "${resource.path}" is duplicated.`,
        path: resource.path,
      });
      continue;
    }
    const structuralCollision = [...paths].find(
      (existingPath) =>
        collisionKey.startsWith(`${existingPath}/`) || existingPath.startsWith(`${collisionKey}/`),
    );
    if (structuralCollision !== undefined) {
      diagnostics.push({
        area: 'creation',
        code: 'skill-resource-path-conflict',
        severity: 'error',
        message: `Resource path "${resource.path}" conflicts with another resource file path.`,
        path: resource.path,
      });
      continue;
    }
    paths.add(collisionKey);

    if (resource.encoding === 'base64' && !isValidBase64(resource.content)) {
      diagnostics.push({
        area: 'creation',
        code: 'skill-resource-base64-invalid',
        severity: 'error',
        message: `Resource "${resource.path}" is not valid base64 content.`,
        path: resource.path,
      });
    }
  }
  return diagnostics;
}

function invalidPath(
  path: string,
  code: string,
  message: string,
): SkillPackagePathValidationResult {
  return {
    valid: false,
    diagnostic: {
      area: 'creation',
      code,
      severity: 'error',
      message,
      path,
    },
  };
}

function isValidBase64(value: string): boolean {
  if (value.length === 0) {
    return true;
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return false;
  }
  const paddingIndex = value.indexOf('=');
  return paddingIndex === -1 || paddingIndex >= value.length - 2;
}
