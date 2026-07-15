import {
  hashStableValue,
  validateCanvasBoardDocumentRef,
  type CanvasBoardQueryFilter,
  type CanvasBoardQuerySummary,
  type CanvasData,
} from '@neko/shared';

export function projectCanvasBoardQuerySummary(input: {
  readonly workspaceRelativePath: string;
  readonly canvasData: CanvasData;
  readonly updatedAt?: string;
}): CanvasBoardQuerySummary {
  const documentRef = {
    kind: 'workspace-path' as const,
    path: normalizeWorkspaceRelativePath(input.workspaceRelativePath),
  };
  const diagnostics = validateCanvasBoardDocumentRef(documentRef);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map(({ message }) => message).join(' '));
  }
  const documentIdentity = hashStableValue({
    kind: 'canvas-board-document',
    path: documentRef.path,
  });
  const contentDigest = hashStableValue(input.canvasData);
  const scope = input.canvasData.creativeScope;
  const nodeTypeSummary: Record<string, number> = {};
  for (const node of input.canvasData.nodes) {
    nodeTypeSummary[node.type] = (nodeTypeSummary[node.type] ?? 0) + 1;
  }

  return {
    documentRef,
    documentId: `canvas-document:${documentIdentity}`,
    canvasId: `canvas:${documentIdentity}`,
    revision: `nkc:${contentDigest}`,
    title: input.canvasData.name,
    ...(scope?.projectId ? { projectId: scope.projectId } : {}),
    ...(scope?.workId ? { workId: scope.workId } : {}),
    ...(scope?.kind ? { scopeKind: scope.kind } : {}),
    ...(scope?.episodeId ? { episodeId: scope.episodeId } : {}),
    ...(scope?.sequenceId ? { sequenceId: scope.sequenceId } : {}),
    ...(Object.keys(nodeTypeSummary).length > 0 ? { nodeTypeSummary } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export function applyCanvasBoardQueryFilter(
  canvasData: CanvasData,
  filter: CanvasBoardQueryFilter | undefined,
): CanvasData {
  if (!filter || Object.keys(filter).length === 0) return canvasData;
  return {
    ...canvasData,
    creativeScope: {
      kind: filter.scopeKind ?? 'generic',
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.workId ? { workId: filter.workId } : {}),
      ...(filter.episodeId ? { episodeId: filter.episodeId } : {}),
      ...(filter.sequenceId ? { sequenceId: filter.sequenceId } : {}),
    },
  };
}

export function matchesCanvasBoardQueryFilter(
  summary: CanvasBoardQuerySummary,
  filter: CanvasBoardQueryFilter | undefined,
): boolean {
  if (!filter || !hasStableCanvasBoardMatchEvidence(filter)) return false;
  return (Object.keys(filter) as (keyof CanvasBoardQueryFilter)[]).every(
    (key) => filter[key] === undefined || summary[key] === filter[key],
  );
}

function hasStableCanvasBoardMatchEvidence(filter: CanvasBoardQueryFilter): boolean {
  return Boolean(filter.projectId || filter.workId || filter.episodeId || filter.sequenceId);
}

function normalizeWorkspaceRelativePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
