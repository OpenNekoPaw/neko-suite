import {
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  validateCanvasBoardObservedTarget,
  validateCanvasBoardResolutionInput,
  validateCanvasBoardTargetIdentity,
  type CanvasBoardDocumentRef,
  type CanvasBoardQuery,
  type CanvasBoardQueryFilter,
  type CanvasBoardQueryResult,
  type CanvasBoardQuerySummary,
  type CanvasBoardResolutionInput,
  type CanvasBoardResolutionResult,
  type CanvasBoardResolutionSource,
  type CanvasBoardRoutingDiagnostic,
  type ImmutableCanvasWriteTarget,
} from '@neko/shared';

export interface CanvasBoardIndexReader {
  query(query: CanvasBoardQuery): Promise<CanvasBoardQueryResult>;
  get(documentRef: CanvasBoardDocumentRef): Promise<CanvasBoardQuerySummary | undefined>;
}

export interface CanvasBoardDocumentCreator {
  createBoardDocument(
    title: string,
    filter?: CanvasBoardQueryFilter,
  ): Promise<CanvasBoardQuerySummary>;
}

export interface CanvasBoardResolverClock {
  now(): Date;
}

export interface CanvasBoardResolverServiceOptions {
  readonly index: CanvasBoardIndexReader;
  readonly creator: CanvasBoardDocumentCreator;
  readonly clock?: CanvasBoardResolverClock;
}

export class CanvasBoardResolverService {
  private readonly clock: CanvasBoardResolverClock;

  constructor(private readonly options: CanvasBoardResolverServiceOptions) {
    this.clock = options.clock ?? { now: () => new Date() };
  }

  async resolve(input: CanvasBoardResolutionInput): Promise<CanvasBoardResolutionResult> {
    const inputDiagnostics = validateCanvasBoardResolutionInput(input);
    if (inputDiagnostics.length > 0) {
      return blocked(inputDiagnostics);
    }

    if (input.explicitTarget) {
      const observed = await this.options.index.get(input.explicitTarget.documentRef);
      const diagnostics = validateCanvasBoardObservedTarget(input.explicitTarget, {
        exists: Boolean(observed),
        ...(observed ? { summary: observed } : {}),
      });
      return diagnostics.length > 0
        ? blocked(diagnostics)
        : this.resolved(input, input.explicitTarget, 'explicit');
    }

    const recoveryDiagnostics: CanvasBoardRoutingDiagnostic[] = [];
    if (input.binding) {
      const observed = await this.options.index.get(input.binding.target.documentRef);
      const diagnostics = validateCanvasBoardObservedTarget(input.binding.target, {
        exists: Boolean(observed),
        ...(observed ? { summary: observed } : {}),
      });
      if (diagnostics.length === 0) {
        return this.resolved(input, input.binding.target, 'conversation');
      }
      recoveryDiagnostics.push(...diagnostics.map(asWarning));
    }

    const queryResult = await this.options.index.query(input.query);
    const unsafeSummaryDiagnostics = queryResult.summaries.flatMap((summary, index) =>
      validateCanvasBoardTargetIdentity(summary, ['summaries', index]),
    );
    if (unsafeSummaryDiagnostics.length > 0) {
      return blocked([
        ...recoveryDiagnostics,
        ...queryResult.diagnostics,
        ...unsafeSummaryDiagnostics,
      ]);
    }
    if (queryResult.summaries.length === 1) {
      return this.resolved(input, queryResult.summaries[0]!, 'exact-index', [
        ...recoveryDiagnostics,
        ...queryResult.diagnostics,
      ]);
    }

    const diagnostics = [...recoveryDiagnostics, ...queryResult.diagnostics];
    if (queryResult.summaries.length > 1) {
      diagnostics.push({
        code: 'ambiguous-board-match',
        severity: 'warning',
        message: 'Several exact Canvas Board matches exist; created a new Board instead.',
      });
    }
    const created = await this.options.creator.createBoardDocument(
      input.suggestedTitle,
      input.query.filter,
    );
    const createdDiagnostics = validateCanvasBoardTargetIdentity(created, ['created']);
    if (createdDiagnostics.length > 0) {
      return blocked([...diagnostics, ...createdDiagnostics]);
    }
    return this.resolved(input, created, 'created', diagnostics, queryResult.summaries);
  }

  private resolved(
    input: CanvasBoardResolutionInput,
    summary: CanvasBoardQuerySummary,
    source: CanvasBoardResolutionSource,
    diagnostics: readonly CanvasBoardRoutingDiagnostic[] = [],
    suggestions?: readonly CanvasBoardQuerySummary[],
  ): CanvasBoardResolutionResult {
    return {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      status: 'resolved',
      source,
      target: this.freezeTarget(input, summary, source),
      ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
      diagnostics,
    };
  }

  private freezeTarget(
    input: CanvasBoardResolutionInput,
    summary: CanvasBoardQuerySummary,
    source: CanvasBoardResolutionSource,
  ): ImmutableCanvasWriteTarget {
    return {
      documentRef: summary.documentRef,
      documentId: summary.documentId,
      canvasId: summary.canvasId,
      revision: summary.revision,
      conversationId: input.conversationId,
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      resolutionSource: source,
      frozenAt: this.clock.now().toISOString(),
    };
  }
}

function blocked(
  diagnostics: readonly CanvasBoardRoutingDiagnostic[],
): CanvasBoardResolutionResult {
  return {
    version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics,
  };
}

function asWarning(diagnostic: CanvasBoardRoutingDiagnostic): CanvasBoardRoutingDiagnostic {
  return { ...diagnostic, severity: 'warning' };
}
