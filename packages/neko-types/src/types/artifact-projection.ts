import type {
  ArtifactDiagnostic,
  CompositeArtifactDomainBlock,
  CompositeArtifact,
} from './composite-artifact';
import type {
  ProjectStoryboardTableToCanvasOptions,
  ProjectStoryboardTableToCutOptions,
  StoryboardCutStoryboardPayload,
  StoryboardTable,
  StoryboardValidationDiagnostic,
} from './storyboard-table';
import type { CanvasStoryboardPayload } from './storyboard-planner';
import {
  normalizeStoryboardTable,
  projectStoryboardTableToCanvasPayload,
  projectStoryboardTableToCutPayload,
  validateStoryboardTable,
} from './storyboard-table';

export const ARTIFACT_PROJECTOR_STORYBOARD_TO_CANVAS = 'projector:storyboard-to-canvas' as const;
export const ARTIFACT_PROJECTOR_STORYBOARD_TO_CUT = 'projector:storyboard-to-cut' as const;
export const ARTIFACT_DOMAIN_STORYBOARD_TABLE = 'StoryboardTable' as const;

export interface ArtifactStoryboardDomainProjectionInput {
  readonly artifact: CompositeArtifact;
}

export interface ArtifactStoryboardDomainProjectionResult {
  readonly table?: StoryboardTable;
  readonly block?: CompositeArtifactDomainBlock;
  readonly diagnostics: readonly ArtifactDiagnostic[];
}

export interface ArtifactCanvasStoryboardProjectionInput extends ArtifactStoryboardDomainProjectionInput {
  readonly options?: ProjectStoryboardTableToCanvasOptions;
}

export interface ArtifactCanvasStoryboardProjectionResult extends ArtifactStoryboardDomainProjectionResult {
  readonly payload?: CanvasStoryboardPayload;
}

export interface ArtifactCutStoryboardProjectionInput extends ArtifactStoryboardDomainProjectionInput {
  readonly options?: ProjectStoryboardTableToCutOptions;
}

export interface ArtifactCutStoryboardProjectionResult extends ArtifactStoryboardDomainProjectionResult {
  readonly payload?: StoryboardCutStoryboardPayload;
}

export function projectCompositeArtifactToStoryboardTable(
  input: ArtifactStoryboardDomainProjectionInput,
): ArtifactStoryboardDomainProjectionResult {
  const block = findStoryboardDomainBlock(input.artifact);
  if (!block) {
    return {
      diagnostics: [
        artifactProjectionDiagnostic(
          'error',
          'missing-required-field',
          ['blocks'],
          'Composite artifact does not contain a StoryboardTable domain block.',
          { expected: ARTIFACT_DOMAIN_STORYBOARD_TABLE },
        ),
      ],
    };
  }

  const normalized = normalizeStoryboardTable({ value: block.payload });
  if (!normalized.table) {
    return {
      block,
      diagnostics: mapStoryboardDiagnostics(normalized.diagnostics, block.blockId),
    };
  }

  const validation = validateStoryboardTable(normalized.table);
  return {
    table: normalized.table,
    block,
    diagnostics: mapStoryboardDiagnostics(
      [...normalized.diagnostics, ...validation.diagnostics],
      block.blockId,
    ),
  };
}

export function projectCompositeArtifactToCanvasStoryboardPayload(
  input: ArtifactCanvasStoryboardProjectionInput,
): ArtifactCanvasStoryboardProjectionResult {
  const storyboard = projectCompositeArtifactToStoryboardTable(input);
  if (!storyboard.table || hasArtifactProjectionErrors(storyboard.diagnostics)) {
    return storyboard;
  }

  return {
    ...storyboard,
    payload: projectStoryboardTableToCanvasPayload(storyboard.table, input.options),
  };
}

export function projectCompositeArtifactToCutStoryboardPayload(
  input: ArtifactCutStoryboardProjectionInput,
): ArtifactCutStoryboardProjectionResult {
  const storyboard = projectCompositeArtifactToStoryboardTable(input);
  if (!storyboard.table || hasArtifactProjectionErrors(storyboard.diagnostics)) {
    return storyboard;
  }

  const payload = projectStoryboardTableToCutPayload(storyboard.table, input.options);
  if (!payload) {
    return {
      ...storyboard,
      diagnostics: [
        ...storyboard.diagnostics,
        artifactProjectionDiagnostic(
          'warning',
          'missing-required-field',
          ['blocks', storyboard.block?.blockId ?? ARTIFACT_DOMAIN_STORYBOARD_TABLE],
          'StoryboardTable does not contain projectable image refs for Cut import.',
        ),
      ],
    };
  }

  return {
    ...storyboard,
    payload,
  };
}

function findStoryboardDomainBlock(
  artifact: CompositeArtifact,
): CompositeArtifactDomainBlock | undefined {
  return artifact.blocks.find(
    (block): block is CompositeArtifactDomainBlock =>
      block.kind === 'domain' && block.domainKind === ARTIFACT_DOMAIN_STORYBOARD_TABLE,
  );
}

function mapStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnostic[],
  blockId: string,
): readonly ArtifactDiagnostic[] {
  return diagnostics.map((diagnostic) =>
    artifactProjectionDiagnostic(
      diagnostic.severity === 'error' ? 'error' : 'warning',
      mapStoryboardDiagnosticCode(diagnostic.code),
      ['blocks', blockId, 'payload', ...diagnostic.path],
      diagnostic.message,
      {
        ...(diagnostic.expected ? { expected: diagnostic.expected } : {}),
        ...(diagnostic.actual !== undefined ? { actual: diagnostic.actual } : {}),
        ...(diagnostic.details ? { details: diagnostic.details } : {}),
      },
    ),
  );
}

function mapStoryboardDiagnosticCode(
  code: StoryboardValidationDiagnostic['code'],
): ArtifactDiagnostic['code'] {
  switch (code) {
    case 'invalid-schema-version':
      return 'invalid-schema-version';
    case 'invalid-kind':
      return 'invalid-kind';
    case 'invalid-root':
      return 'invalid-root';
    case 'invalid-profile':
      return 'invalid-profile';
    case 'unsafe-media-ref':
    case 'runtime-only-media-ref':
      return 'unsafe-runtime-handle';
    default:
      return 'invalid-required-field';
  }
}

function hasArtifactProjectionErrors(diagnostics: readonly ArtifactDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function artifactProjectionDiagnostic(
  severity: ArtifactDiagnostic['severity'],
  code: ArtifactDiagnostic['code'],
  path: ArtifactDiagnostic['path'],
  message: string,
  extra: Omit<ArtifactDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): ArtifactDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...extra,
  };
}
