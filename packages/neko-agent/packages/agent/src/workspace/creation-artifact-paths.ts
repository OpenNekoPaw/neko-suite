/**
 * CreationArtifactPaths — visible creation document layout.
 *
 * Draft / Plan / Task content is creator-facing project documentation, not a
 * managed runtime cache and not an OpenSpec change. Keep these files under the
 * project-owned `neko/creations/<creationId>/` tree so writes are visible,
 * reviewable, and approval-gated by the host without exposing Agent internals.
 */

import type { ArtifactKind } from '@neko-agent/types';

export const CREATION_ARTIFACT_ROOT = 'neko/creations' as const;

export const CREATION_ARTIFACT_FILES = {
  draft: 'brief.md',
  plan: 'plan.md',
  task: 'checklist.md',
} as const satisfies Readonly<Record<ArtifactKind, string>>;

export interface ICreationArtifactPaths {
  /** Absolute path to `<workspace>/neko/creations`. */
  readonly root: string;
  /** Absolute path to `<workspace>/neko/creations/<creationId>`. */
  creationDir(creationId: string): string;
  /** Absolute path to a creation document file for the given creation. */
  file(kind: ArtifactKind, creationId: string): string;
}

export function createCreationArtifactPaths(workspaceRoot: string): ICreationArtifactPaths {
  if (!workspaceRoot) {
    throw new Error('createCreationArtifactPaths: workspaceRoot is required');
  }
  const root = join(workspaceRoot, CREATION_ARTIFACT_ROOT);

  function creationDir(creationId: string): string {
    assertPathSegment(creationId, 'creationId');
    return join(root, creationId);
  }

  function file(kind: ArtifactKind, creationId: string): string {
    return join(creationDir(creationId), CREATION_ARTIFACT_FILES[kind]);
  }

  return { root, creationDir, file };
}

function assertPathSegment(value: string, name: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`CreationArtifactPaths.${name}: value is required`);
  }
  if (
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw new Error(`CreationArtifactPaths.${name}: invalid path segment "${value}"`);
  }
}

function join(a: string, ...rest: string[]): string {
  let out = a.replace(/\/+$/, '');
  for (const seg of rest) {
    const trimmed = seg.replace(/^\/+/, '').replace(/\/+$/, '');
    if (trimmed) out = `${out}/${trimmed}`;
  }
  return out;
}
