import * as path from 'path';
import * as vscode from 'vscode';
import { isMentionExcludedPath } from '@neko/agent';

export interface WorkspaceMentionIgnoreFilter {
  isIgnored(filePath: string | vscode.Uri): boolean;
}

export async function createWorkspaceMentionIgnoreFilter(
  workspaceRoot: string,
): Promise<WorkspaceMentionIgnoreFilter> {
  const rules = await readWorkspaceGitignoreRules(workspaceRoot);

  return {
    isIgnored(filePath) {
      const relativePath = normalizeWorkspaceRelativePath(workspaceRoot, filePath);
      if (isMentionExcludedPath(relativePath)) {
        return true;
      }
      return matchesGitignoreRules(relativePath, rules);
    },
  };
}

export async function readWorkspaceGitignoreRules(
  workspaceRoot: string,
): Promise<readonly string[]> {
  try {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.gitignore');
    const content = await vscode.workspace.fs.readFile(uri);
    return parseGitignoreRules(Buffer.from(content).toString('utf-8'));
  } catch {
    return [];
  }
}

export function parseGitignoreRules(content: string): readonly string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('!'));
}

export function matchesGitignoreRules(filePath: string, rules: readonly string[]): boolean {
  const normalizedPath = normalizeRelativePath(filePath);
  return rules.some((rule) => matchesGitignoreRule(normalizedPath, rule));
}

function matchesGitignoreRule(filePath: string, rawRule: string): boolean {
  const directoryOnly = rawRule.endsWith('/');
  const anchored = rawRule.startsWith('/');
  const normalizedRule = normalizeRelativePath(rawRule.replace(/^\/+/, '').replace(/\/+$/, ''));
  if (!normalizedRule) {
    return false;
  }

  if (directoryOnly) {
    return matchesDirectoryRule(filePath, normalizedRule, anchored);
  }

  if (!normalizedRule.includes('/') && !hasGlobSyntax(normalizedRule)) {
    return filePath.split('/').includes(normalizedRule);
  }

  return globToRegExp(normalizedRule, anchored).test(filePath);
}

function matchesDirectoryRule(filePath: string, rule: string, anchored: boolean): boolean {
  if (anchored) {
    return filePath === rule || filePath.startsWith(`${rule}/`);
  }

  const segments = filePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join('/');
    if (suffix === rule || suffix.startsWith(`${rule}/`)) {
      return true;
    }
  }
  return false;
}

function globToRegExp(pattern: string, anchored: boolean): RegExp {
  const prefix = anchored ? '^' : '(^|.*/)';
  return new RegExp(`${prefix}${globSegmentToRegExp(pattern)}($|/.*)`);
}

function globSegmentToRegExp(pattern: string): string {
  return pattern
    .split('')
    .map((char) => {
      if (char === '*') return '[^/]*';
      if (char === '?') return '[^/]';
      return escapeRegExp(char);
    })
    .join('');
}

function hasGlobSyntax(value: string): boolean {
  return value.includes('*') || value.includes('?');
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function normalizeWorkspaceRelativePath(
  workspaceRoot: string,
  filePath: string | vscode.Uri,
): string {
  const fsPath = typeof filePath === 'string' ? filePath : filePath.fsPath;
  const relativePath = path.isAbsolute(fsPath) ? path.relative(workspaceRoot, fsPath) : fsPath;
  return normalizeRelativePath(relativePath);
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}
