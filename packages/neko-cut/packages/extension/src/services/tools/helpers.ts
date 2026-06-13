/**
 * Pure helper functions for timeline tool operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  PathResolver,
  contractWorkspaceMediaPath,
  resolveWorkspaceMediaPath,
  type ProjectData,
  type TimelineElement,
  type TimelineTrack,
  type WorkspaceMediaPathContext,
} from '@neko/shared';

// =============================================================================
// Tool Element Types
// =============================================================================

/**
 * Runtime element shape as seen by tool handlers.
 *
 * ProjectData from the webview stores EditorElement objects which carry
 * UI extension fields (animTransform, colorCorrection, masks, etc.) alongside
 * engine-aligned TimelineElement fields. This type makes those runtime
 * fields visible to handlers without importing webview-internal types.
 */
export interface ToolElementExtensions {
  /** Animatable transform tracks (UI-only, pending engine support) */
  animTransform?: Record<string, unknown>;
  /** Color correction settings (UI-only, not engine field) */
  colorCorrection?: Record<string, unknown>;
  /** Mask instances (UI-only, pending engine support) */
  masks?: Array<Record<string, unknown>>;
}

/** TimelineElement with optional UI extension fields visible at runtime */
export type ToolElement = TimelineElement & Partial<ToolElementExtensions>;

/**
 * Runtime track shape as seen by tool handlers.
 * Tracks may carry UI extension fields like shapes.
 */
export interface ToolTrackExtensions {
  /** Shape instances on the track (UI-only) */
  shapes?: Array<Record<string, unknown>>;
}

/** TimelineTrack with optional UI extension fields visible at runtime */
export type ToolTrack = TimelineTrack & Partial<ToolTrackExtensions>;

// =============================================================================
// Element Utilities
// =============================================================================

/**
 * Merge updates into an element, returning a TimelineElement.
 * Centralizes the spread+cast pattern that TS requires when updating
 * discriminated union members (spread loses the discriminant tag).
 */
export function mergeElement(base: ToolElement, updates: Record<string, unknown>): TimelineElement {
  return { ...base, ...updates } as TimelineElement;
}

/**
 * Create a TimelineElement from a partial object literal.
 * Used by AddElement where the handler constructs a new element
 * with only the fields relevant to its type.
 */
export function createElement(fields: Record<string, unknown>): TimelineElement {
  return fields as unknown as TimelineElement;
}

// =============================================================================
// Portable Path Utilities (PathVariable integration)
// =============================================================================

export interface CutMediaPathContextOptions {
  readonly projectFilePath?: string;
  readonly documentUri?: vscode.Uri;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceRoots?: readonly string[];
  readonly allowedRoots?: readonly string[];
  readonly fileExists?: (filePath: string) => boolean;
}

interface AssetPathCommandContext {
  readonly sourceDocumentUri?: string;
  readonly documentPath?: string;
  readonly owningWorkspaceRoot?: string;
  readonly workspaceRoots?: readonly string[];
  readonly allowedRoots?: readonly string[];
}

/**
 * Contract an absolute path to a portable path for storage.
 *
 * Priority:
 * 1. PathVariable: /Volumes/NAS/footage/clip.mp4 → ${FOOTAGE}/clip.mp4
 * 2. Workspace-relative: /project/assets/clip.mp4 → assets/clip.mp4
 */
async function contractPath(
  absolutePath: string,
  baseDir: string,
  options: CutMediaPathContextOptions = {},
): Promise<string> {
  const context = createCutWorkspaceMediaPathContext(baseDir, options);
  const commandContext = createAssetPathCommandContext(context, options);

  try {
    const contracted = await vscode.commands.executeCommand<string>(
      'neko.assets.contractPath',
      absolutePath,
      commandContext,
    );
    if (contracted && !path.isAbsolute(contracted)) return contracted;
  } catch {
    // neko-assets not active, fallback to relative
  }

  const contracted = contractWorkspaceMediaPath(absolutePath, context);
  if (
    contracted.format === 'workspace-relative' ||
    contracted.format === 'variable' ||
    contracted.format === 'remote-url'
  ) {
    return contracted.path;
  }

  let relativePath = path.relative(baseDir, absolutePath);
  relativePath = relativePath.split(path.sep).join('/');
  return relativePath;
}

/**
 * Resolve a stored path (PathVariable or relative) to an absolute path.
 *
 * Uses @neko/shared PathResolver for variable expansion when a resolver
 * is available, otherwise falls back to neko.assets VSCode command.
 */
export async function resolveMediaPath(
  storedPath: string,
  baseDir: string,
  resolver?: PathResolver,
  options: CutMediaPathContextOptions = {},
): Promise<string> {
  const context = createCutWorkspaceMediaPathContext(baseDir, options);
  const commandContext = createAssetPathCommandContext(context, options);

  try {
    const resolved = await vscode.commands.executeCommand<string>(
      'neko.assets.resolvePath',
      storedPath,
      commandContext,
    );
    if (resolved && resolved !== storedPath) {
      return resolved;
    }
  } catch {
    // neko-assets not active
  }

  const planned = resolveWorkspaceMediaPath({
    source: storedPath,
    context,
    fileExists: options.fileExists,
    isPathAuthorized: (filePath) => isPathAuthorized(filePath, context.allowedRoots),
  });

  if (planned.status === 'resolved-local') return planned.path;
  if (planned.status === 'remote') return planned.url;

  // If resolver is provided, use it as a final compatibility path-variable source.
  if (resolver) {
    const result = resolver.resolveSource(storedPath, baseDir);
    if (result.type === 'remote') return result.url;
    if (!result.path.includes('${') && (path.isAbsolute(result.path) || isRemoteUrl(result.path))) {
      return result.path;
    }
  }

  const diagnostic = planned.diagnostics[planned.diagnostics.length - 1];
  throw new Error(
    diagnostic?.message ?? `Unable to resolve media path with project context: ${storedPath}`,
  );
}

export function toRelativeIfAbsolute(filePath: string, baseDir: string): string {
  if (!path.isAbsolute(filePath)) return filePath;
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

/**
 * Normalize all element paths in a project for saving.
 *
 * Converts absolute paths to portable paths:
 * - External paths → ${VAR}/rest (via PathResolver)
 * - Project-internal paths → relative to project dir
 */
export async function normalizePathsForSave(
  project: ProjectData,
  projectFilePath?: string,
  options: CutMediaPathContextOptions = {},
): Promise<ProjectData> {
  if (!projectFilePath) return project;

  const baseDir = path.dirname(projectFilePath);
  const contextOptions = { ...options, projectFilePath };

  const tracks = await Promise.all(
    project.tracks.map(async (track) => ({
      ...track,
      elements: await Promise.all(
        track.elements.map(async (element) => {
          if (
            (element.type === 'media' ||
              element.type === 'audio' ||
              element.type === 'scene3d' ||
              element.type === 'puppet') &&
            typeof element.src === 'string' &&
            path.isAbsolute(element.src)
          ) {
            const portable = await contractPath(element.src, baseDir, contextOptions);
            return { ...element, src: portable } as TimelineElement;
          }
          return element;
        }),
      ),
    })),
  );

  return { ...project, tracks };
}

export async function resolveProjectMediaSourcesForRuntime(
  project: ProjectData,
  projectFilePath: string,
  options: CutMediaPathContextOptions = {},
): Promise<ProjectData> {
  const baseDir = path.dirname(projectFilePath);
  const contextOptions = { ...options, projectFilePath };

  const tracks = await Promise.all(
    project.tracks.map(async (track) => ({
      ...track,
      elements: await Promise.all(
        track.elements.map(async (element) => {
          if (
            (element.type === 'media' ||
              element.type === 'audio' ||
              element.type === 'scene3d' ||
              element.type === 'puppet') &&
            typeof element.src === 'string' &&
            !isRemoteUrl(element.src)
          ) {
            const resolved = await resolveMediaPath(
              element.src,
              baseDir,
              undefined,
              contextOptions,
            );
            return { ...element, src: resolved } as TimelineElement;
          }
          return element;
        }),
      ),
    })),
  );

  return { ...project, tracks };
}

export function createCutWorkspaceMediaPathContext(
  baseDir: string,
  options: CutMediaPathContextOptions = {},
): WorkspaceMediaPathContext {
  const documentPath = options.projectFilePath ?? options.documentUri?.fsPath;
  const documentDir = documentPath ? path.dirname(documentPath) : baseDir;
  const workspaceRoots =
    options.workspaceRoots ??
    vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ??
    [];
  const owningWorkspaceRoot =
    options.owningWorkspaceRoot ??
    findOwningWorkspaceRoot(documentPath ?? documentDir, workspaceRoots) ??
    workspaceRoots[0];
  const pathVariables = new Map<string, string>();
  if (owningWorkspaceRoot) {
    pathVariables.set('WORKSPACE', owningWorkspaceRoot);
    pathVariables.set('PROJECT', owningWorkspaceRoot);
  }
  const allowedRoots = uniquePaths([
    ...(options.allowedRoots ?? []),
    ...workspaceRoots,
    ...(documentDir ? [documentDir] : []),
  ]);

  return {
    ...(options.documentUri ? { sourceDocumentUri: options.documentUri.toString() } : {}),
    ...(owningWorkspaceRoot ? { owningWorkspaceRoot } : {}),
    workspaceRoots,
    documentDir,
    pathVariables,
    allowedRoots,
  };
}

function createAssetPathCommandContext(
  context: WorkspaceMediaPathContext,
  options: CutMediaPathContextOptions,
): AssetPathCommandContext {
  const documentPath = options.projectFilePath ?? options.documentUri?.fsPath;
  return {
    ...(context.sourceDocumentUri ? { sourceDocumentUri: context.sourceDocumentUri } : {}),
    ...(documentPath ? { documentPath } : {}),
    ...(context.owningWorkspaceRoot ? { owningWorkspaceRoot: context.owningWorkspaceRoot } : {}),
    ...(context.workspaceRoots ? { workspaceRoots: context.workspaceRoots } : {}),
    ...(options.allowedRoots ? { allowedRoots: options.allowedRoots } : {}),
  };
}

function findOwningWorkspaceRoot(
  documentPath: string | undefined,
  workspaceRoots: readonly string[],
): string | undefined {
  if (!documentPath) return undefined;
  return workspaceRoots
    .filter((root) => isPathInsideOrEqual(documentPath, root))
    .sort((left, right) => right.length - left.length)[0];
}

export function isExistingLocalFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathAuthorized(filePath: string, roots: readonly string[] | undefined): boolean {
  if (!roots || roots.length === 0) return true;
  return roots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isRemoteUrl(source: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(source) && !/^[A-Za-z]:[\\/]/.test(source);
}

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(Boolean).map((value) => path.normalize(value)))];
}

export function findElement(
  project: ProjectData,
  elementId: string,
): {
  trackIndex: number;
  elementIndex: number;
  track: ToolTrack;
  element: ToolElement;
} | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex];
    if (!track) continue;
    const elementIndex = track.elements.findIndex((e) => e.id === elementId);
    if (elementIndex !== -1) {
      const element = track.elements[elementIndex];
      if (!element) continue;
      return {
        trackIndex,
        elementIndex,
        track: track as ToolTrack,
        element: element as ToolElement,
      };
    }
  }
  return null;
}

export function updateElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
  updatedElement: TimelineElement,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements[elementIndex] = updatedElement;
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

export function removeElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
): ProjectData {
  const track = project.tracks[trackIndex];
  if (!track) throw new Error(`Track index out of bounds: ${trackIndex}`);
  const updatedElements = [...track.elements];
  updatedElements.splice(elementIndex, 1);
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

export function normalizePercent(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}
