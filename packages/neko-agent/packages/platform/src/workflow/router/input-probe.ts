/**
 * InputProbe — normalize RawInput into a ProbeContext.
 *
 * Pure(ish): extracts file extension, counts files, measures prompt length.
 * I/O is deliberately optional — consumers can pass a pre-computed RawInput
 * without opening files. This keeps InputProbe testable without VSCode deps.
 *
 * Phase 1: no document reading (no extension host required).
 * Phase 3+: may optionally read the first N KB of a file to refine the
 *           classification (handed in via the `reader` param).
 */

import type { ExtensionId, ProbeContext, RawInput } from '../types';

// =============================================================================
// Options
// =============================================================================

/**
 * Optional async reader — for Phase 3+ when InputProbe peeks into file content
 * (e.g., to estimate character count for .txt / .md / .docx).
 *
 * Omitted in Phase 1 MVP: caller fills textLength manually if known.
 */
export interface InputProbeOptions {
  /** Optional drop target (if the caller knows the user's explicit intent) */
  dropTarget?: ExtensionId;
  /** Optional free-form hint from the user's chat message */
  userHint?: string;
  /** Optional reader to peek into file content (Phase 3+) */
  reader?: (path: string, maxBytes?: number) => Promise<string>;
  /** Max bytes to read when reader is provided (default 8 KB) */
  readPeekBytes?: number;
}

const DEFAULT_PEEK_BYTES = 8 * 1024;

// =============================================================================
// Entry
// =============================================================================

export async function probe(
  input: RawInput,
  options: InputProbeOptions = {},
): Promise<ProbeContext> {
  const ctx: ProbeContext = {
    inputType: mapInputType(input),
    raw: input,
    ...(options.dropTarget !== undefined && { dropTarget: options.dropTarget }),
    ...(options.userHint !== undefined && { userHint: options.userHint }),
  };

  switch (input.kind) {
    case 'prompt':
      ctx.textLength = input.text.length;
      break;

    case 'file': {
      const ext = extractExt(input.path);
      if (ext !== undefined) ctx.fileExt = ext;
      ctx.fileCount = 1;

      // If a reader is provided and the file looks like a document, peek at its content
      if (options.reader && isPeekable(ext)) {
        try {
          const content = await options.reader(
            input.path,
            options.readPeekBytes ?? DEFAULT_PEEK_BYTES,
          );
          ctx.textLength = content.length;
        } catch {
          // Ignore read errors at probe time; downstream can surface them
        }
      }
      break;
    }

    case 'files': {
      ctx.fileCount = input.paths.length;
      // Dominant extension across the batch (simple majority)
      const dominantExt = dominantExtension(input.paths);
      if (dominantExt !== undefined) ctx.fileExt = dominantExt;
      break;
    }

    case 'project': {
      ctx.existingProject = input.path;
      break;
    }
  }

  return ctx;
}

// =============================================================================
// Helpers
// =============================================================================

function mapInputType(input: RawInput): ProbeContext['inputType'] {
  switch (input.kind) {
    case 'prompt':
      return 'prompt';
    case 'file':
      return 'file';
    case 'files':
      return 'images'; // treat multi-file as image batch by default; FastProbe refines
    case 'project':
      return 'project';
  }
}

function extractExt(path: string): string | undefined {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

function dominantExtension(paths: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const e = extractExt(p);
    if (e === undefined) continue;
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [ext, count] of counts) {
    if (count > bestCount) {
      best = ext;
      bestCount = count;
    }
  }
  return best;
}

const PEEKABLE_EXTS = new Set(['txt', 'md', 'markdown', 'fountain', 'nks', 'rtf']);

function isPeekable(ext: string | undefined): boolean {
  return ext !== undefined && PEEKABLE_EXTS.has(ext);
}

// =============================================================================
// Exposed helpers for tests
// =============================================================================

export const __internal = {
  extractExt,
  dominantExtension,
  mapInputType,
  isPeekable,
};
