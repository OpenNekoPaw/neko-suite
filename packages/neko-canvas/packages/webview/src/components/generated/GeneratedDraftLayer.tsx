import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  type CanvasGeneratedDraftCandidateProjection,
  type CanvasGeneratedDraftGroupProjection,
  type CanvasGeneratedDraftSelection,
  type CanvasViewport,
} from '@neko/shared';
import { Button, Dialog, IconButton } from '@neko/ui/primitives';
import {
  ErrorIcon,
  LoadingIcon,
  PackageIcon,
  SuccessIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/shared/icons';
import { toCodiconClassName } from '@neko/ui/icons';
import { useNodeDrag } from '../../hooks/useNodeDrag';
import {
  useGeneratedDraftStore,
  type GeneratedDraftRuntimeLayout,
} from '../../stores/generatedDraftStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { t } from '../../i18n';

export interface GeneratedDraftLayerProps {
  readonly viewport: CanvasViewport;
}

export function GeneratedDraftLayer({ viewport }: GeneratedDraftLayerProps): ReactNode {
  const projectionMap = useGeneratedDraftStore((state) => state.projections);
  const layouts = useGeneratedDraftStore((state) => state.layouts);
  const promotionDiagnostics = useGeneratedDraftStore((state) => state.promotionDiagnostics);
  const projections = useMemo(() => Object.values(projectionMap), [projectionMap]);

  return projections.map((projection) => (
    <GeneratedDraftGroup
      key={projection.projectionId}
      projection={projection}
      layout={layouts[projection.projectionId]}
      promotionDiagnostic={promotionDiagnostics[projection.projectionId]}
      viewport={viewport}
    />
  ));
}

function GeneratedDraftGroup({
  projection,
  layout,
  promotionDiagnostic,
  viewport,
}: {
  readonly projection: CanvasGeneratedDraftGroupProjection;
  readonly layout: GeneratedDraftRuntimeLayout | undefined;
  readonly promotionDiagnostic: string | undefined;
  readonly viewport: CanvasViewport;
}) {
  const moveGroup = useGeneratedDraftStore((state) => state.moveGroup);
  const setCollapsed = useGeneratedDraftStore((state) => state.setCollapsed);
  const groupPosition = layout?.groupPosition ?? projection.position;
  const collapsed = layout?.collapsed ?? projection.collapsed;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(selectableCandidates(projection).map((candidate) => candidate.candidateId)),
  );
  const { position, isDragging, handlers } = useNodeDrag({
    nodeId: projection.projectionId,
    initialPosition: groupPosition,
    viewport,
    onDragEnd: (_id, nextPosition) => moveGroup(projection.projectionId, nextPosition),
  });

  useEffect(() => {
    const selectable = new Set(
      selectableCandidates(projection).map((candidate) => candidate.candidateId),
    );
    setSelectedIds((current) => {
      const retained = [...current].filter((id) => selectable.has(id));
      for (const id of selectable) retained.push(id);
      return new Set(retained);
    });
  }, [projection.updatedAt]);

  const selectedCandidates = selectableCandidates(projection).filter((candidate) =>
    selectedIds.has(candidate.candidateId),
  );
  const hasUnsaved = projection.candidates.some(
    (candidate) => candidate.state !== 'saved-to-assets' && candidate.state !== 'added-to-board',
  );
  const promotionInProgress = projection.candidates.some(
    (candidate) => candidate.state === 'promoting',
  );

  return (
    <>
      <div
        className="runtime-generated-group"
        data-runtime-generated-group={projection.projectionId}
        data-runtime-generated-group-collapsed={collapsed ? 'true' : 'false'}
        data-runtime-generated-group-pinned={projection.pinned ? 'true' : 'false'}
        style={{
          left: position.x,
          top: position.y,
          width: projection.size.width,
          height: collapsed ? 42 : projection.size.height,
          zIndex: isDragging ? 1000 : 500,
        }}
        onMouseDown={handlers.onMouseDown}
      >
        <div className="runtime-generated-group-label">
          <button
            type="button"
            className="runtime-generated-collapse"
            aria-label={collapsed ? t('group.expand') : t('group.collapse')}
            aria-expanded={!collapsed}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed(projection.projectionId, !collapsed)}
          >
            <span
              className={toCodiconClassName(collapsed ? 'chevron-right' : 'chevron-down')}
              aria-hidden="true"
            />
          </button>
          <span className="min-w-0 flex-1 truncate font-semibold">{projection.title}</span>
          <span className="runtime-generated-unsaved-badge">
            {t('generatedDraft.reviewCount', { count: projection.candidates.length })}
          </span>
          {projection.pinned && (
            <span className={toCodiconClassName('lock')} aria-label={t('generatedDraft.pinned')} />
          )}
        </div>
        {!collapsed && (
          <div className="runtime-generated-group-actions" data-node-drag-block="true">
            <Button
              size="xs"
              variant="secondary"
              leadingIcon={<PackageIcon size={13} />}
              disabled={selectedCandidates.length === 0}
              onClick={() => requestPromotion(projection, selectedCandidates)}
            >
              {selectedCandidates.length === selectableCandidates(projection).length
                ? t('generatedDraft.saveAll')
                : t('generatedDraft.saveSelected', { count: selectedCandidates.length })}
            </Button>
            <IconButton
              size="xs"
              variant="ghost"
              label={t('generatedDraft.discard')}
              icon={<TrashIcon size={13} />}
              disabled={promotionInProgress}
              onClick={() => setDiscardOpen(true)}
            />
          </div>
        )}
        {promotionDiagnostic && !collapsed && (
          <div className="runtime-generated-group-diagnostic" role="alert">
            <ErrorIcon size={13} />
            <span>{promotionDiagnostic}</span>
          </div>
        )}
      </div>
      {!collapsed &&
        projection.candidates.map((candidate) => (
          <GeneratedDraftCandidate
            key={candidate.candidateId}
            projectionId={projection.projectionId}
            projection={projection}
            candidate={candidate}
            position={layout?.candidatePositions[candidate.candidateId] ?? candidate.position}
            viewport={viewport}
            selected={selectedIds.has(candidate.candidateId)}
            onSelectedChange={(selected) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                if (selected) next.add(candidate.candidateId);
                else next.delete(candidate.candidateId);
                return next;
              })
            }
          />
        ))}
      <Dialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('generatedDraft.discardTitle')}
        description={t('generatedDraft.discardDescription')}
        closeLabel={t('generatedDraft.keepReviewing')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
              {t('generatedDraft.keepReviewing')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                postMessage({
                  type: 'canvas.generatedDraft.discard',
                  projectionId: projection.projectionId,
                  discardUnsaved: hasUnsaved,
                });
                setDiscardOpen(false);
              }}
            >
              {t('generatedDraft.discard')}
            </Button>
          </>
        }
      >
        <p role={hasUnsaved ? 'alert' : 'status'}>
          {hasUnsaved ? t('generatedDraft.unsavedWarning') : t('generatedDraft.savedDiscardInfo')}
        </p>
      </Dialog>
    </>
  );
}

function GeneratedDraftCandidate({
  projectionId,
  projection,
  candidate,
  position,
  viewport,
  selected,
  onSelectedChange,
}: {
  readonly projectionId: string;
  readonly projection: CanvasGeneratedDraftGroupProjection;
  readonly candidate: CanvasGeneratedDraftCandidateProjection;
  readonly position: { readonly x: number; readonly y: number };
  readonly viewport: CanvasViewport;
  readonly selected: boolean;
  readonly onSelectedChange: (selected: boolean) => void;
}) {
  const moveCandidate = useGeneratedDraftStore((state) => state.moveCandidate);
  const {
    position: dragPosition,
    isDragging,
    handlers,
  } = useNodeDrag({
    nodeId: candidate.candidateId,
    initialPosition: position,
    viewport,
    onDragEnd: (_id, nextPosition) =>
      moveCandidate(projectionId, candidate.candidateId, nextPosition),
  });
  const canSave =
    candidate.state === 'unsaved' ||
    candidate.state === 'failed' ||
    candidate.state === 'saved-to-assets';

  return (
    <article
      className="runtime-generated-candidate"
      data-runtime-generated-candidate={candidate.candidateId}
      data-runtime-generated-candidate-state={candidate.state}
      style={{
        left: dragPosition.x,
        top: dragPosition.y,
        width: candidate.size.width,
        height: candidate.size.height,
        zIndex: isDragging ? 1001 : 501,
      }}
      onMouseDown={handlers.onMouseDown}
    >
      <header className="runtime-generated-candidate-header">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSave}
          aria-label={t('generatedDraft.selectCandidate', { title: candidate.title })}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
        <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
        <span className="runtime-generated-state">
          {candidateStateIcon(candidate.state)}
          {t(`generatedDraft.state.${candidate.state}`)}
        </span>
      </header>
      <div className="runtime-generated-preview" data-node-drag-block="true">
        {renderCandidatePreview(candidate)}
      </div>
      <footer className="runtime-generated-candidate-footer" data-node-drag-block="true">
        {candidate.diagnostic && (
          <span className="runtime-generated-diagnostic" role="alert" title={candidate.diagnostic}>
            {candidate.diagnostic}
          </span>
        )}
        <Button
          size="xs"
          variant="secondary"
          disabled={!canSave}
          leadingIcon={<PackageIcon size={13} />}
          onClick={() => requestPromotion(projection, [candidate])}
        >
          {candidate.state === 'failed' || candidate.state === 'saved-to-assets'
            ? t('generatedDraft.retry')
            : t('generatedDraft.saveOne')}
        </Button>
      </footer>
    </article>
  );
}

function renderCandidatePreview(candidate: CanvasGeneratedDraftCandidateProjection): ReactNode {
  if (!candidate.renderUri) {
    return (
      <div className="runtime-generated-preview-unavailable" role="alert">
        <WarningIcon size={18} />
        <span>{candidate.diagnostic ?? t('generatedDraft.previewUnavailable')}</span>
      </div>
    );
  }
  if (candidate.mediaKind === 'image') {
    return <img src={candidate.renderUri} alt={candidate.title} draggable={false} />;
  }
  if (candidate.mediaKind === 'video') {
    return <video src={candidate.renderUri} controls aria-label={candidate.title} />;
  }
  return <audio src={candidate.renderUri} controls aria-label={candidate.title} />;
}

function candidateStateIcon(state: CanvasGeneratedDraftCandidateProjection['state']): ReactNode {
  switch (state) {
    case 'promoting':
      return <LoadingIcon size={12} className="animate-spin motion-reduce:animate-none" />;
    case 'saved-to-assets':
    case 'added-to-board':
      return <SuccessIcon size={12} />;
    case 'unavailable':
      return <WarningIcon size={12} />;
    case 'failed':
      return <ErrorIcon size={12} />;
    case 'unsaved':
      return <WarningIcon size={12} />;
  }
}

function selectableCandidates(
  projection: CanvasGeneratedDraftGroupProjection,
): CanvasGeneratedDraftCandidateProjection[] {
  return projection.candidates.filter((candidate) =>
    ['unsaved', 'failed', 'saved-to-assets'].includes(candidate.state),
  );
}

function requestPromotion(
  projection: CanvasGeneratedDraftGroupProjection,
  candidates: readonly CanvasGeneratedDraftCandidateProjection[],
): void {
  const selections: CanvasGeneratedDraftSelection[] = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    revision: candidate.revision,
    contentDigest: candidate.contentDigest,
  }));
  if (selections.length === 0) return;
  postMessage({
    type: 'canvas.generatedDraft.saveToAssets',
    request: {
      version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
      requestId: crypto.randomUUID(),
      projectionId: projection.projectionId,
      target: projection.target,
      selections,
      requestedAt: new Date().toISOString(),
    },
  });
}

function postMessage(message: unknown): void {
  const vscode = getGlobalVSCodeApi();
  if (!vscode) throw new Error('Canvas VS Code API is unavailable.');
  vscode.postMessage(message);
}
