import * as path from 'node:path';
import {
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreRules,
} from '../../input/workspace-ignore';
import {
  authorizePathInsideRoots,
  isPathInsideRoot,
  normalizeAccessRoots,
} from './path-access-core';

export type FileAccessKind = 'read' | 'write' | 'cwd';

export interface CoreFileAccessPolicy {
  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision;
}

export interface CoreFileAccessDecision {
  readonly allowed: boolean;
  readonly path: string;
  readonly reason?: CoreFileAccessDenialReason;
  readonly message?: string;
}

export type CoreFileAccessDenialReason =
  | 'missing-authorized-root'
  | 'relative-path-without-root'
  | 'forbidden-unmanaged-path'
  | 'outside-authorized-roots'
  | 'ignored-workspace-path';

export interface WorkspaceFileAccessPolicyOptions {
  readonly workspaceRoot: string;
  readonly readRoots?: readonly string[];
  readonly writeRoots?: readonly string[];
  readonly ignoreRules?: WorkspaceFileIgnoreRules;
}

export function createWorkspaceFileAccessPolicy(
  options: WorkspaceFileAccessPolicyOptions,
): CoreFileAccessPolicy {
  return new WorkspaceFileAccessPolicy(options);
}

export function createNoWorkspaceFileAccessPolicy(): CoreFileAccessPolicy {
  return new NoWorkspaceFileAccessPolicy();
}

class WorkspaceFileAccessPolicy implements CoreFileAccessPolicy {
  private readonly workspaceRoot: string;
  private readonly readRoots: readonly string[];
  private readonly writeRoots: readonly string[];
  private readonly ignoreRules: WorkspaceFileIgnoreRules;

  constructor(options: WorkspaceFileAccessPolicyOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.readRoots = normalizeAccessRoots(options.readRoots ?? [this.workspaceRoot]);
    this.writeRoots = normalizeAccessRoots(options.writeRoots ?? [this.workspaceRoot]);
    this.ignoreRules = options.ignoreRules ?? {};
  }

  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision {
    const resolved = resolveAgainstRoot(filePath, this.workspaceRoot);
    if (!resolved) {
      return {
        allowed: false,
        path: filePath,
        reason: 'relative-path-without-root',
        message: `Path must be absolute or workspace-relative: ${filePath}`,
      };
    }

    const roots = accessKind === 'write' ? this.writeRoots : this.readRoots;
    const rootDecision = authorizePathInsideRoots(resolved, roots);
    if (rootDecision.reason === 'forbidden-unmanaged-path') {
      return {
        allowed: false,
        path: resolved,
        reason: 'forbidden-unmanaged-path',
        message: `Path is denied because it is in system temp, Downloads, or Desktop: ${resolved}`,
      };
    }
    if (rootDecision.reason === 'outside-authorized-roots') {
      return {
        allowed: false,
        path: resolved,
        reason: 'outside-authorized-roots',
        message: `Path is outside authorized ${accessKind} roots: ${resolved}`,
      };
    }

    const relativePath = toWorkspaceRelativePath(resolved, this.workspaceRoot);
    if (relativePath) {
      const ignoreDecision = shouldIgnoreWorkspaceFile(relativePath, this.ignoreRules);
      if (ignoreDecision.ignored) {
        return {
          allowed: false,
          path: resolved,
          reason: 'ignored-workspace-path',
          message: buildIgnoredPathMessage(resolved, ignoreDecision),
        };
      }
    }

    return {
      allowed: true,
      path: resolved,
    };
  }
}

class NoWorkspaceFileAccessPolicy implements CoreFileAccessPolicy {
  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision {
    return {
      allowed: false,
      path: filePath,
      reason: 'missing-authorized-root',
      message: `Cannot ${accessKind} local files because no authorized workspace root is available.`,
    };
  }
}

function resolveAgainstRoot(filePath: string, root: string): string | undefined {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  if (!filePath.trim()) {
    return undefined;
  }
  return path.resolve(root, filePath);
}

function toWorkspaceRelativePath(filePath: string, workspaceRoot: string): string | undefined {
  if (!isPathInsideRoot(filePath, workspaceRoot)) {
    return undefined;
  }
  const relativePath = path.relative(workspaceRoot, filePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : undefined;
}

function buildIgnoredPathMessage(
  filePath: string,
  decision: ReturnType<typeof shouldIgnoreWorkspaceFile>,
): string {
  if (decision.reason === 'gitignore' && decision.rule) {
    return `Path is ignored by workspace .gitignore rule "${decision.rule}": ${filePath}`;
  }
  return `Path is ignored because it is in a managed workspace runtime or cache directory: ${filePath}`;
}
