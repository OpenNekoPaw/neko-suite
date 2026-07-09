import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { InlineMarkdownEditor, MarkdownInlineText } from '@neko/ui/markdown';
import type {
  CanvasAuthoringDiagnostic,
  CanvasAuthoringPromptFieldProjection,
  CanvasAuthoringSemanticPromptSpan,
  CanvasNode,
  CanvasStoryboardPromptBlockKind,
  CanvasStoryboardPromptBlocks,
  CanvasStoryboardPromptState,
  CanvasStoryboardSemanticPromptDocument,
  ContainerSection,
  FieldBinding,
} from '@neko/shared';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  getDefaultCanvasNodePresetName,
  isCanvasStoryboardPromptState,
  projectCanvasShotPrompt,
  writeFieldBinding,
} from '@neko/shared';
import { CloseIcon } from '@neko/shared/icons';
import { useCanvasStore } from '../../stores/canvasStore';
import { ContainerRenderer } from '../content/ContainerRenderer';
import { ContainerActionBar, readNumber, readString } from '../content/node-card';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import {
  createBuiltInCanvasNodePresetRegistry,
  getCanvasNodePreset,
} from '../../utils/canvasPresetRegistry';
import type { CanvasNodeDraft } from '../../utils/canvasPresetRegistry';
import type { FieldBindingUpdate, NodeContentRenderContext } from '../content/types';
import {
  createCanvasMarkdownSemanticSpans,
  getSemanticPromptFieldLabel,
  renderCanvasSemanticPromptToken,
} from '../common/SemanticPromptText';
import { t } from '../../i18n';

const PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();
const CONTENT_OVERLAY_BACKDROP_Z_INDEX = 20000;
const CONTENT_OVERLAY_PANEL_Z_INDEX = 20001;

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

const STORYBOARD_PROMPT_BLOCKS = [
  {
    kind: 'video',
    labelKey: 'content.overlayShotPromptBlockVideo',
    placeholderKey: 'content.overlayShotPromptVideoPlaceholder',
  },
  {
    kind: 'image',
    labelKey: 'content.overlayShotPromptBlockImage',
    placeholderKey: 'content.overlayShotPromptImagePlaceholder',
  },
  {
    kind: 'voice',
    labelKey: 'content.overlayShotPromptBlockVoice',
    placeholderKey: 'content.overlayShotPromptVoicePlaceholder',
  },
] as const satisfies readonly {
  readonly kind: CanvasStoryboardPromptBlockKind;
  readonly labelKey: string;
  readonly placeholderKey: string;
}[];

type ShotPromptDrafts = Record<CanvasStoryboardPromptBlockKind, string>;
type ShotPromptBlockSources = Record<CanvasStoryboardPromptBlockKind, string>;

export interface ContentOverlayProps {
  nodeId: string;
  onClose: () => void;
}

export function ContentOverlay({ nodeId, onClose }: ContentOverlayProps) {
  const nodes = useCanvasStore((s) => s.canvasData?.nodes ?? []);
  const selectedNodeIds = useCanvasStore((s) => s.selection.nodeIds);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const removeChildFromContainer = useCanvasStore((s) => s.removeChildFromContainer);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const node = useMemo(() => nodes.find((n) => n.id === nodeId), [nodes, nodeId]);

  if (!node) return null;

  const content = resolveOverlayContent(node);
  if (!content) return null;

  const overlay = (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: CONTENT_OVERLAY_BACKDROP_Z_INDEX, backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-4 flex flex-col overflow-hidden rounded-xl"
        data-content-overlay-root="true"
        data-content-overlay-panel="true"
        {...getKeyboardBoundaryMetadata({
          scope: 'modal',
          ownerId: `content-overlay:${node.id}`,
          priority: 40,
          ownedKeys: ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
        })}
        style={{
          zIndex: CONTENT_OVERLAY_PANEL_Z_INDEX,
          backgroundColor: 'var(--node-bg)',
          border: '1px solid var(--node-border)',
        }}
      >
        <OverlayHeader node={node} onClose={onClose} />
        {node.type === 'shot' ? (
          <ShotCreatorOverlayBody
            node={node}
            content={content}
            allNodes={nodes}
            selectedNodeIds={selectedNodeIds}
            onUpdateData={updateNodeData}
            onSelectNode={selectNode}
            onRemoveChild={removeChildFromContainer}
          />
        ) : (
          <OverlayBody
            node={node}
            content={content}
            allNodes={nodes}
            selectedNodeIds={selectedNodeIds}
            onUpdateData={updateNodeData}
            onSelectNode={selectNode}
            onRemoveChild={removeChildFromContainer}
          />
        )}
      </div>
    </>
  );

  return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
}

function OverlayHeader({ node, onClose }: { node: CanvasNode; onClose: () => void }) {
  const descriptors = useMemo(() => createBuiltInNodeTypeDescriptors(), []);
  const descriptor = descriptors[node.type];
  const tagLabel = descriptor?.tagLabel ?? node.type.toUpperCase();
  const tagColor = descriptor?.tagColor ?? '#6b7280';

  const key = NODE_TYPE_I18N_KEY[node.type] ?? `node.${node.type}`;
  const title = node.preview?.title ?? t(key) ?? node.id;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid var(--node-divider)' }}
    >
      <span
        className="flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${tagColor}20`, color: tagColor }}
      >
        {tagLabel}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium"
        style={{ color: 'var(--node-fg)' }}
      >
        {title}
      </span>
      <button
        type="button"
        className="flex-shrink-0 rounded px-2 py-1 text-sm hover:bg-white/10"
        style={{ color: 'var(--node-fg-secondary)' }}
        onClick={onClose}
      >
        <CloseIcon size={13} strokeWidth={1.9} />
      </button>
    </div>
  );
}

function OverlayBody({
  node,
  content,
  allNodes,
  selectedNodeIds,
  onUpdateData,
  onSelectNode,
  onRemoveChild,
}: {
  node: CanvasNode;
  content: ContainerSection;
  allNodes: CanvasNode[];
  selectedNodeIds: readonly string[];
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onSelectNode?: (nodeId: string, multi?: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}) {
  const handleUpdateBinding = useCallback(
    (update: FieldBindingUpdate) => {
      const binding: FieldBinding = { path: update.path as FieldBinding['path'] };
      const result = writeFieldBinding(node.data, binding, update.value);
      if (result.changed && isRecord(result.data)) {
        onUpdateData?.(node.id, result.data);
      }
    },
    [node, onUpdateData],
  );

  const renderContext: NodeContentRenderContext = {
    node,
    allNodes,
    selectedNodeIds: [...selectedNodeIds],
    isSelected: true,
    isExpanded: true,
    layout: {
      width: Math.max(720, node.size.width),
      height: Math.max(420, node.size.height),
      density: 'expanded',
      surface: 'overlay',
      overflow: 'scroll',
    },
    depth: 0,
    previewSurfaceKind: 'overlay',
    onUpdateBinding: handleUpdateBinding,
    onUpdateNodeData: onUpdateData,
    onSelectNode,
    onRemoveChild,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <ContainerActionBar
        node={node}
        allNodes={allNodes}
        selectedNodeIds={selectedNodeIds}
        isSelected={true}
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto"
        data-content-overlay-scroll-region="true"
      >
        <ContainerRenderer section={content} context={renderContext} />
      </div>
    </div>
  );
}

function ShotCreatorOverlayBody({
  node,
  content,
  allNodes,
  selectedNodeIds,
  onUpdateData,
  onSelectNode,
  onRemoveChild,
}: {
  node: CanvasNode;
  content: ContainerSection;
  allNodes: CanvasNode[];
  selectedNodeIds: readonly string[];
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onSelectNode?: (nodeId: string, multi?: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}) {
  const previewContent = useMemo(() => createShotPreviewContent(content), [content]);
  const renderContext = useShotOverlayRenderContext({
    node,
    allNodes,
    selectedNodeIds,
    onUpdateData,
    onSelectNode,
    onRemoveChild,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <ContainerActionBar
        node={node}
        allNodes={allNodes}
        selectedNodeIds={selectedNodeIds}
        isSelected={true}
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-auto"
        data-content-overlay-scroll-region="true"
      >
        <div
          className="grid min-h-0 w-full max-w-[1440px] min-w-0 self-center gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(380px,1.1fr)]"
          data-shot-creator-overlay="true"
        >
          <section className="min-w-0" data-shot-creator-preview="true">
            <div className="overflow-hidden rounded border border-gray-200 bg-gray-50">
              <ContainerRenderer section={previewContent} context={renderContext} />
            </div>
          </section>
          <section className="min-w-0" data-shot-creator-summary="true">
            <ShotCreatorSummary node={node} onUpdateData={onUpdateData} />
          </section>
        </div>
      </div>
    </div>
  );
}

function useShotOverlayRenderContext({
  node,
  allNodes,
  selectedNodeIds,
  onUpdateData,
  onSelectNode,
  onRemoveChild,
}: {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: readonly string[];
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onSelectNode?: (nodeId: string, multi?: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}): NodeContentRenderContext {
  const handleUpdateBinding = useCallback(
    (update: FieldBindingUpdate) => {
      const binding: FieldBinding = { path: update.path as FieldBinding['path'] };
      const result = writeFieldBinding(node.data, binding, update.value);
      if (result.changed && isRecord(result.data)) {
        onUpdateData?.(node.id, result.data);
      }
    },
    [node, onUpdateData],
  );

  return {
    node,
    allNodes,
    selectedNodeIds: [...selectedNodeIds],
    isSelected: true,
    isExpanded: true,
    layout: {
      width: Math.max(720, node.size.width),
      height: Math.max(420, node.size.height),
      density: 'expanded',
      surface: 'overlay',
      overflow: 'scroll',
    },
    depth: 0,
    previewSurfaceKind: 'overlay',
    onUpdateBinding: handleUpdateBinding,
    onUpdateNodeData: onUpdateData,
    onSelectNode,
    onRemoveChild,
  };
}

function ShotCreatorSummary({
  node,
  onUpdateData,
}: {
  node: CanvasNode;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}) {
  const data = readRecordValue(node.data);
  const camera = joinDisplayValues([
    readString(data, 'shotScale'),
    readString(data, 'cameraAngle'),
    readString(data, 'cameraMovement'),
  ]);
  const characters = readShotCreatorCharacterNames(data).join(', ');
  const visual = joinDisplayValues([
    readString(data, 'visualDescription'),
    readString(data, 'characterAction'),
  ]);
  const audio = joinDisplayValues([
    readString(data, 'dialogue'),
    readString(data, 'voiceOver'),
    readString(data, 'soundCue'),
  ]);
  const tags = joinDisplayValues([
    ...readStringArrayValue(data['emotion']),
    ...readStringArrayValue(data['sceneTags']),
    readString(data, 'visualStyle'),
    ...readStringArrayValue(data['vfx']),
  ]);
  const duration = readNumber(data, 'duration');

  return (
    <div className="grid min-w-0 gap-3 rounded border border-gray-200 bg-white p-3 text-xs text-gray-700 md:grid-cols-2">
      <ShotCreatorSummaryItem
        label={t('preset.shot.duration')}
        value={duration === undefined ? '' : t('scene.shotDuration', { seconds: duration })}
      />
      <ShotCreatorSummaryItem label={t('scene.column.camera')} value={camera} />
      <ShotCreatorSummaryItem label={t('preset.shot.characters')} value={characters} />
      <ShotCreatorSummaryItem label={t('scene.column.tagsStyle')} value={tags} />
      <ShotCreatorSummaryItem
        label={t('scene.column.visualAction')}
        value={visual}
        className="md:col-span-2"
      />
      <ShotCreatorSummaryItem
        label={t('scene.column.dialogueSfx')}
        value={audio}
        className="md:col-span-2"
      />
      <ShotCreatorPromptEditor node={node} onUpdateData={onUpdateData} className="md:col-span-2" />
    </div>
  );
}

function ShotCreatorPromptEditor({
  node,
  onUpdateData,
  className,
}: {
  node: CanvasNode;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  className?: string;
}) {
  if (node.type !== 'shot') return null;

  const storyboardPromptState = readShotStoryboardPromptState(node);
  const projection = useMemo(() => projectCanvasShotPrompt(node), [node]);
  const promptDrafts = useMemo(
    () => resolveShotPromptDrafts(storyboardPromptState, projection),
    [projection, storyboardPromptState],
  );
  const blockSources = useMemo(
    () => resolveShotPromptBlockSources(storyboardPromptState, projection),
    [projection, storyboardPromptState],
  );
  const [drafts, setDrafts] = useState<ShotPromptDrafts>(promptDrafts);
  const skipNextCommitBlockRef = useRef<CanvasStoryboardPromptBlockKind | undefined>();

  useEffect(() => {
    setDrafts(promptDrafts);
  }, [promptDrafts]);

  const commitBlockDraft = useCallback(
    (blockKind: CanvasStoryboardPromptBlockKind) => {
      if (skipNextCommitBlockRef.current === blockKind) {
        skipNextCommitBlockRef.current = undefined;
        return;
      }
      const nextPrompt = drafts[blockKind].trim();
      if (nextPrompt === promptDrafts[blockKind].trim()) return;
      onUpdateData?.(node.id, {
        storyboardPrompt: createEditedStoryboardPromptState(node, blockKind, nextPrompt),
      });
    },
    [drafts, node, onUpdateData, promptDrafts],
  );

  const updateDraft = useCallback((blockKind: CanvasStoryboardPromptBlockKind, value: string) => {
    setDrafts((current) => ({ ...current, [blockKind]: value }));
  }, []);

  const handleKeyDown = useCallback(
    (blockKind: CanvasStoryboardPromptBlockKind, event: KeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        skipNextCommitBlockRef.current = blockKind;
        updateDraft(blockKind, promptDrafts[blockKind]);
        event.currentTarget.blur();
      }
    },
    [promptDrafts, updateDraft],
  );

  const handleKeyboardEvent = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  }, []);

  return (
    <div className={`min-w-0 ${className ?? ''}`} data-shot-creator-prompt="true">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] text-gray-500">{t('content.overlayShotPrompt')}</div>
        <span
          className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500"
          data-shot-creator-prompt-source={projection?.source ?? 'empty'}
        >
          {formatShotPromptSourceLabel(projection?.source ?? 'empty')}
        </span>
      </div>
      <div className="grid min-w-0 gap-2 md:grid-cols-3">
        {STORYBOARD_PROMPT_BLOCKS.map((block) => {
          const document = readPromptDocument(
            storyboardPromptState?.promptBlocks ?? {},
            block.kind,
          );
          return (
            <div key={block.kind} className="min-w-0" data-shot-creator-prompt-block={block.kind}>
              <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <div className="truncate text-[11px] text-gray-500">{t(block.labelKey)}</div>
                <span
                  className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500"
                  data-shot-creator-prompt-block-source={blockSources[block.kind]}
                >
                  {formatShotPromptSourceLabel(blockSources[block.kind])}
                </span>
              </div>
              <ShotPromptSemanticEditor
                nodeId={node.id}
                blockKind={block.kind}
                value={drafts[block.kind]}
                document={document}
                rows={4}
                placeholder={t(block.placeholderKey)}
                ariaLabel={t(block.labelKey)}
                onInput={(value) => updateDraft(block.kind, value)}
                onBlur={() => commitBlockDraft(block.kind)}
                onKeyDown={(event) => handleKeyDown(block.kind, event)}
                onKeyUp={handleKeyboardEvent}
                onKeyPress={handleKeyboardEvent}
              />
              <ShotPromptAlignmentSummary document={document} />
            </div>
          );
        })}
      </div>
      <ShotPromptDiagnostics diagnostics={storyboardPromptState?.diagnostics} />
      <ShotPromptAdvancedSummary state={storyboardPromptState} />
      {projection?.legacyMigrationPrompt ? (
        <div
          className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800"
          data-shot-creator-legacy-prompt="true"
        >
          {t('content.overlayShotPromptLegacyMigration')}
        </div>
      ) : null}
    </div>
  );
}

function ShotPromptAdvancedSummary({ state }: { state?: CanvasStoryboardPromptState }) {
  const chips = createShotPromptAdvancedChips(state);
  if (chips.length === 0) return null;
  return (
    <div
      className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5"
      data-shot-creator-advanced-params="true"
      aria-label={t('content.overlayShotPromptAdvancedParameters')}
    >
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {t('content.overlayShotPromptAdvancedParameters')}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex max-w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] leading-none text-slate-700"
            data-shot-creator-advanced-param={chip.id}
            title={`${chip.label}: ${chip.value}`}
          >
            <span className="truncate">
              {chip.label}: {chip.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ShotPromptSemanticEditor({
  nodeId,
  blockKind,
  value,
  document,
  rows,
  placeholder,
  ariaLabel,
  onInput,
  onBlur,
  onKeyDown,
  onKeyUp,
  onKeyPress,
}: {
  nodeId: string;
  blockKind: CanvasStoryboardPromptBlockKind;
  value: string;
  document?: CanvasStoryboardSemanticPromptDocument;
  rows: number;
  placeholder: string;
  ariaLabel: string;
  onInput: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onKeyUp: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onKeyPress: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const displayDocument = useMemo(
    () => resolvePromptDisplayDocument(document, value),
    [document, value],
  );
  const semanticSpans = useMemo(
    () => createCanvasMarkdownSemanticSpans(value, displayDocument?.spans ?? []),
    [displayDocument?.spans, value],
  );

  return (
    <div
      data-semantic-prompt-editor="true"
      data-shot-creator-prompt-block-editor={blockKind}
    >
      <InlineMarkdownEditor
        value={value}
        onChange={onInput}
        profile="semantic-prompt"
        semanticSpans={semanticSpans}
        rows={rows}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        keyboardOwnerId={`shot-creator-prompt:${nodeId}:${blockKind}`}
        textareaDataAttributes={{ 'data-shot-creator-prompt-block-input': blockKind }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onKeyPress={onKeyPress}
        renderToken={(context) => renderCanvasSemanticPromptToken(context, 'editor')}
      />
    </div>
  );
}

function ShotPromptAlignmentSummary({
  document,
}: {
  document?: CanvasStoryboardSemanticPromptDocument;
}) {
  const fieldProjections = document?.fieldProjections ?? [];
  if (fieldProjections.length === 0) return null;
  return (
    <div className="mt-1.5 flex min-w-0 flex-col gap-1">
      <div
        className="flex min-w-0 flex-wrap gap-1"
        aria-label={t('content.overlayShotPromptAlignment')}
      >
        {fieldProjections.map((projection, index) => (
          <span
            key={`${projection.fieldId}-${index}`}
            className={getPromptProjectionClassName(projection.alignmentState)}
            data-shot-creator-prompt-alignment-state={projection.alignmentState}
            title={formatFieldProjectionTitle(projection)}
          >
            {formatFieldProjectionLabel(projection)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShotPromptDiagnostics({
  diagnostics,
}: {
  diagnostics?: readonly CanvasAuthoringDiagnostic[];
}) {
  if (!diagnostics || diagnostics.length === 0) return null;
  return (
    <div
      className="mt-2 flex min-w-0 flex-col gap-1"
      aria-label={t('content.overlayShotPromptDiagnostics')}
    >
      {diagnostics.map((diagnostic, index) => (
        <div
          key={`${diagnostic.code}-${index}`}
          className={getPromptDiagnosticClassName(diagnostic.severity)}
          data-shot-creator-prompt-diagnostic={diagnostic.code}
        >
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function clampPromptOffset(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), textLength);
}

function formatFieldProjectionLabel(projection: CanvasAuthoringPromptFieldProjection): string {
  return `${getSemanticPromptFieldLabel(projection.fieldId)}: ${getPromptAlignmentLabel(
    projection.alignmentState,
  )}`;
}

function formatFieldProjectionTitle(projection: CanvasAuthoringPromptFieldProjection): string {
  const fieldLabel = getSemanticPromptFieldLabel(projection.fieldId);
  const alignmentLabel = getPromptAlignmentLabel(projection.alignmentState);
  const fieldTitle =
    fieldLabel === projection.fieldId
      ? projection.fieldId
      : `${fieldLabel} · ${projection.fieldId}`;
  return `${fieldTitle} · ${alignmentLabel}`;
}

function createShotPromptAdvancedChips(
  state: CanvasStoryboardPromptState | undefined,
): Array<{ id: string; label: string; value: string }> {
  if (!state) return [];
  const chips: Array<{ id: string; label: string; value: string }> = [];
  const advancedParameters = state.generationParams?.advancedParameters;
  if (advancedParameters) {
    for (const [key, value] of Object.entries(advancedParameters)) {
      chips.push({
        id: key,
        label: formatAdvancedParameterLabel(key),
        value: formatAdvancedParameterValue(value),
      });
    }
  }
  if (state.generationParams?.aspectRatio && !advancedParameters?.aspectRatio) {
    chips.push({
      id: 'aspectRatio',
      label: formatAdvancedParameterLabel('aspectRatio'),
      value: state.generationParams.aspectRatio,
    });
  }
  const videoReferenceCount = state.referenceMedia?.videoRefs?.length ?? 0;
  if (videoReferenceCount > 0) {
    chips.push({
      id: 'videoReference',
      label: formatAdvancedParameterLabel('videoReference'),
      value: String(videoReferenceCount),
    });
  }
  const audioReferenceCount = state.referenceMedia?.audioRefs?.length ?? 0;
  if (audioReferenceCount > 0) {
    chips.push({
      id: 'audioReference',
      label: formatAdvancedParameterLabel('audioReference'),
      value: String(audioReferenceCount),
    });
  }
  return chips;
}

function formatAdvancedParameterLabel(key: string): string {
  return translateDisplayKey(`content.advancedParam.${key}`, key);
}

function getPromptAlignmentLabel(alignmentState: string): string {
  return translateDisplayKey(`content.promptAlignment.${alignmentState}`, alignmentState);
}

function translateDisplayKey(key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function formatAdvancedParameterValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return String(value.length);
  }
  const serialized = JSON.stringify(value);
  return serialized && serialized !== '{}' ? serialized : 'configured';
}

function getPromptProjectionClassName(alignmentState: string): string {
  const base = 'inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] leading-none';
  switch (alignmentState) {
    case 'in-sync':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    case 'prompt-overridden':
    case 'suggestion-pending':
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    case 'conflict':
      return `${base} border-red-200 bg-red-50 text-red-700`;
    default:
      return `${base} border-gray-200 bg-gray-50 text-gray-700`;
  }
}

function getPromptDiagnosticClassName(severity: CanvasAuthoringDiagnostic['severity']): string {
  const base = 'rounded border px-2 py-1 text-[11px] leading-4';
  switch (severity) {
    case 'error':
      return `${base} border-red-200 bg-red-50 text-red-700`;
    case 'warning':
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    case 'info':
      return `${base} border-blue-200 bg-blue-50 text-blue-700`;
  }
}

function readShotStoryboardPromptState(node: CanvasNode): CanvasStoryboardPromptState | undefined {
  if (node.type !== 'shot') return undefined;
  const state = node.data.storyboardPrompt;
  if (state === undefined) return undefined;
  if (!isCanvasStoryboardPromptState(state)) {
    throw new Error(`Invalid storyboardPrompt state on shot node ${node.id}.`);
  }
  return state;
}

function resolveShotPromptDrafts(
  state: CanvasStoryboardPromptState | undefined,
  projection: ReturnType<typeof projectCanvasShotPrompt>,
): ShotPromptDrafts {
  return {
    image: state?.promptBlocks?.imagePromptDocument?.text ?? '',
    video:
      state?.promptBlocks?.videoPromptDocument?.text ??
      (projection?.source === 'assembled' ? projection.prompt : ''),
    voice: state?.promptBlocks?.voicePromptDocument?.text ?? '',
  };
}

function resolveShotPromptBlockSources(
  state: CanvasStoryboardPromptState | undefined,
  projection: ReturnType<typeof projectCanvasShotPrompt>,
): ShotPromptBlockSources {
  return {
    image: state?.promptBlocks?.imagePromptDocument ? 'semantic-prompt-document' : 'empty',
    video: state?.promptBlocks?.videoPromptDocument
      ? 'semantic-prompt-document'
      : projection?.source === 'assembled'
        ? 'assembled'
        : 'empty',
    voice: state?.promptBlocks?.voicePromptDocument ? 'semantic-prompt-document' : 'empty',
  };
}

function createEditedStoryboardPromptState(
  node: CanvasNode,
  blockKind: CanvasStoryboardPromptBlockKind,
  text: string,
): CanvasStoryboardPromptState {
  const existingState = readShotStoryboardPromptState(node);
  const promptBlocks = copyPromptBlocks(existingState?.promptBlocks);
  const existingDocument = readPromptDocument(promptBlocks, blockKind);
  const editProjection = projectPromptEdit(node.id, blockKind, text, existingDocument);
  const nextDocument = editProjection.document;
  writePromptDocument(promptBlocks, blockKind, nextDocument);
  const diagnostics = mergePromptEditDiagnostics(
    existingState?.diagnostics,
    blockKind,
    editProjection.diagnostic,
  );

  if (!hasPromptBlocks(promptBlocks)) {
    if (!existingState) {
      return {
        version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    }
    const {
      promptBlocks: _promptBlocks,
      diagnostics: _diagnostics,
      ...stateWithoutPromptBlocks
    } = existingState;
    return {
      ...stateWithoutPromptBlocks,
      version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
  }

  const { diagnostics: _diagnostics, ...stateWithoutDiagnostics } = existingState ?? {};
  return {
    ...stateWithoutDiagnostics,
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    promptBlocks,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function copyPromptBlocks(blocks: CanvasStoryboardPromptBlocks | undefined): {
  imagePromptDocument?: CanvasStoryboardSemanticPromptDocument;
  videoPromptDocument?: CanvasStoryboardSemanticPromptDocument;
  voicePromptDocument?: CanvasStoryboardSemanticPromptDocument;
} {
  return {
    ...(blocks?.imagePromptDocument ? { imagePromptDocument: blocks.imagePromptDocument } : {}),
    ...(blocks?.videoPromptDocument ? { videoPromptDocument: blocks.videoPromptDocument } : {}),
    ...(blocks?.voicePromptDocument ? { voicePromptDocument: blocks.voicePromptDocument } : {}),
  };
}

function readPromptDocument(
  blocks: CanvasStoryboardPromptBlocks,
  blockKind: CanvasStoryboardPromptBlockKind,
): CanvasStoryboardSemanticPromptDocument | undefined {
  switch (blockKind) {
    case 'image':
      return blocks.imagePromptDocument;
    case 'video':
      return blocks.videoPromptDocument;
    case 'voice':
      return blocks.voicePromptDocument;
  }
}

function writePromptDocument(
  blocks: {
    imagePromptDocument?: CanvasStoryboardSemanticPromptDocument;
    videoPromptDocument?: CanvasStoryboardSemanticPromptDocument;
    voicePromptDocument?: CanvasStoryboardSemanticPromptDocument;
  },
  blockKind: CanvasStoryboardPromptBlockKind,
  document: CanvasStoryboardSemanticPromptDocument | undefined,
): void {
  switch (blockKind) {
    case 'image':
      if (document) blocks.imagePromptDocument = document;
      else delete blocks.imagePromptDocument;
      return;
    case 'video':
      if (document) blocks.videoPromptDocument = document;
      else delete blocks.videoPromptDocument;
      return;
    case 'voice':
      if (document) blocks.voicePromptDocument = document;
      else delete blocks.voicePromptDocument;
  }
}

function resolvePromptDisplayDocument(
  document: CanvasStoryboardSemanticPromptDocument | undefined,
  text: string,
): CanvasStoryboardSemanticPromptDocument | undefined {
  if (!document) return undefined;
  if (text === document.text) return document;
  const taggedSpanEdit = projectTaggedSpanEdit(document, text);
  if (!taggedSpanEdit) {
    return { ...document, text };
  }
  return {
    ...document,
    text,
    spans: taggedSpanEdit.spans,
    fieldProjections: taggedSpanEdit.fieldProjections,
  };
}

interface PromptEditProjection {
  readonly document?: CanvasStoryboardSemanticPromptDocument;
  readonly diagnostic?: CanvasAuthoringDiagnostic;
}

function projectPromptEdit(
  nodeId: string,
  blockKind: CanvasStoryboardPromptBlockKind,
  text: string,
  existingDocument: CanvasStoryboardSemanticPromptDocument | undefined,
): PromptEditProjection {
  if (!text) {
    return {
      ...(existingDocument
        ? {
            diagnostic: createPromptEditDiagnostic(
              blockKind,
              'warning',
              'semantic-prompt-block-cleared',
              'Semantic prompt block was cleared; bound field projections require explicit review.',
            ),
          }
        : {}),
    };
  }

  const taggedSpanEdit = existingDocument
    ? projectTaggedSpanEdit(existingDocument, text)
    : undefined;
  if (existingDocument && taggedSpanEdit) {
    return {
      document: {
        ...existingDocument,
        text,
        spans: taggedSpanEdit.spans,
        fieldProjections: taggedSpanEdit.fieldProjections,
        profileId: existingDocument.profileId ?? 'canvas.storyboard.semantic-prompt',
        userOverride: false,
      },
    };
  }

  return {
    document: createFreeformEditedPromptDocument(nodeId, blockKind, text, existingDocument),
    diagnostic: createPromptEditDiagnostic(
      blockKind,
      'warning',
      'semantic-prompt-freeform-edit',
      'Free-form prompt edit was preserved; apply field suggestions explicitly to keep projections aligned.',
    ),
  };
}

interface TaggedSpanEditProjection {
  readonly spans: readonly CanvasAuthoringSemanticPromptSpan[];
  readonly fieldProjections: readonly CanvasAuthoringPromptFieldProjection[];
}

function projectTaggedSpanEdit(
  document: CanvasStoryboardSemanticPromptDocument,
  nextText: string,
): TaggedSpanEditProjection | undefined {
  const spans = [...(document.spans ?? [])];
  if (spans.length === 0 || nextText === document.text) return undefined;

  for (const span of spans) {
    const replacement = readTaggedSpanReplacement(document.text, nextText, span, spans);
    if (!replacement) continue;
    const delta = replacement.value.length - (span.range.end - span.range.start);
    const nextSpans = spans.map((current) => {
      if (current === span) {
        return {
          ...current,
          range: { start: span.range.start, end: span.range.start + replacement.value.length },
          source: 'user' as const,
        };
      }
      if (current.range.start >= span.range.end) {
        return {
          ...current,
          range: {
            start: current.range.start + delta,
            end: current.range.end + delta,
          },
        };
      }
      return current;
    });
    return {
      spans: nextSpans,
      fieldProjections: upsertTaggedSpanFieldProjection(
        document.fieldProjections ?? [],
        span,
        replacement.value,
      ),
    };
  }

  return undefined;
}

function readTaggedSpanReplacement(
  previousText: string,
  nextText: string,
  span: CanvasAuthoringSemanticPromptSpan,
  spans: readonly CanvasAuthoringSemanticPromptSpan[],
): { readonly value: string } | undefined {
  const start = clampPromptOffset(span.range.start, previousText.length);
  const end = clampPromptOffset(span.range.end, previousText.length);
  if (end <= start) return undefined;
  if (spans.some((other) => other !== span && rangesOverlap(start, end, other.range))) {
    return undefined;
  }
  const prefix = previousText.slice(0, start);
  const suffix = previousText.slice(end);
  if (!nextText.startsWith(prefix) || !nextText.endsWith(suffix)) {
    return undefined;
  }
  const value = nextText.slice(prefix.length, nextText.length - suffix.length).trim();
  return value ? { value } : undefined;
}

function rangesOverlap(
  start: number,
  end: number,
  range: { readonly start: number; readonly end: number },
): boolean {
  return range.start < end && start < range.end;
}

function upsertTaggedSpanFieldProjection(
  fieldProjections: readonly CanvasAuthoringPromptFieldProjection[],
  span: CanvasAuthoringSemanticPromptSpan,
  value: string,
): readonly CanvasAuthoringPromptFieldProjection[] {
  const fieldId = span.fieldId;
  if (!fieldId) return fieldProjections;
  let updated = false;
  const next = fieldProjections.map((projection) => {
    if (projection.fieldId !== fieldId && projection.sourceSpanId !== span.id) {
      return projection;
    }
    updated = true;
    return {
      ...projection,
      fieldId,
      value,
      sourceSpanId: span.id,
      alignmentState: 'in-sync' as const,
      userOverride: false,
    };
  });
  if (updated) return next;
  return [
    ...next,
    {
      fieldId,
      value,
      ...(span.id ? { sourceSpanId: span.id } : {}),
      alignmentState: 'in-sync',
      userOverride: false,
    },
  ];
}

function createFreeformEditedPromptDocument(
  nodeId: string,
  blockKind: CanvasStoryboardPromptBlockKind,
  text: string,
  existingDocument: CanvasStoryboardSemanticPromptDocument | undefined,
): CanvasStoryboardSemanticPromptDocument {
  return {
    version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
    documentId: existingDocument?.documentId ?? `${nodeId}:${blockKind}:prompt`,
    blockKind,
    text,
    fieldProjections: [
      {
        fieldId: getPromptBlockFieldId(blockKind),
        value: text,
        alignmentState: 'prompt-overridden',
        userOverride: true,
      },
    ],
    fieldSuggestions: [
      {
        fieldId: getPromptBlockFieldId(blockKind),
        suggestedValue: text,
        sourceRange: { start: 0, end: text.length },
        confidence: 0.3,
      },
    ],
    profileId: existingDocument?.profileId ?? 'canvas.storyboard.semantic-prompt',
    userOverride: true,
    ...(existingDocument?.baseRevision ? { baseRevision: existingDocument.baseRevision } : {}),
  };
}

function mergePromptEditDiagnostics(
  current: readonly CanvasAuthoringDiagnostic[] | undefined,
  blockKind: CanvasStoryboardPromptBlockKind,
  diagnostic: CanvasAuthoringDiagnostic | undefined,
): readonly CanvasAuthoringDiagnostic[] {
  const target = promptEditDiagnosticTarget(blockKind);
  const preserved = (current ?? []).filter(
    (item) =>
      item.target !== target ||
      (item.code !== 'semantic-prompt-freeform-edit' &&
        item.code !== 'semantic-prompt-block-cleared'),
  );
  return diagnostic ? [...preserved, diagnostic] : preserved;
}

function createPromptEditDiagnostic(
  blockKind: CanvasStoryboardPromptBlockKind,
  severity: CanvasAuthoringDiagnostic['severity'],
  code: string,
  message: string,
): CanvasAuthoringDiagnostic {
  return {
    severity,
    code,
    message,
    target: promptEditDiagnosticTarget(blockKind),
    retryable: true,
  };
}

function promptEditDiagnosticTarget(blockKind: CanvasStoryboardPromptBlockKind): string {
  return `/storyboardPrompt/promptBlocks/${blockKind}PromptDocument`;
}

function getPromptBlockFieldId(blockKind: CanvasStoryboardPromptBlockKind): string {
  switch (blockKind) {
    case 'image':
      return 'shot.imagePrompt';
    case 'video':
      return 'scene.videoPrompt';
    case 'voice':
      return 'voice.dialogue';
  }
}

function hasPromptBlocks(blocks: CanvasStoryboardPromptBlocks): boolean {
  return Boolean(
    blocks.imagePromptDocument || blocks.videoPromptDocument || blocks.voicePromptDocument,
  );
}

function formatShotPromptSourceLabel(source: string): string {
  switch (source) {
    case 'semantic-prompt-document':
      return t('content.overlayShotPromptSemantic');
    case 'assembled':
      return t('content.overlayShotPromptAssembled');
    case 'legacy-migration-required':
      return t('content.overlayShotPromptMigrationRequired');
    default:
      return t('content.overlayShotPromptEmpty');
  }
}

function ShotCreatorSummaryItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className="mb-1 text-[11px] text-gray-500">{label}</div>
      <div
        className="max-h-32 min-h-[1.25rem] overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-gray-900"
        data-shot-creator-summary-value="true"
      >
        {value ? (
          <MarkdownInlineText value={value} className="contents" />
        ) : (
          <span className="text-gray-400">{t('scene.valueUnavailable')}</span>
        )}
      </div>
    </div>
  );
}

function createShotPreviewContent(content: ContainerSection): ContainerSection {
  return {
    ...content,
    id: `${content.id}-preview-only`,
    sections: content.sections?.filter((section) => section.id === 'shot-preview'),
  };
}

function resolveOverlayContent(node: CanvasNode): ContainerSection | undefined {
  const presetName = node.preset ?? getDefaultCanvasNodePresetName(node.type);
  const preset = getCanvasNodePreset(PRESET_REGISTRY, presetName);
  if (preset && preset.nodeType === node.type) {
    return preset.createContent(node as CanvasNodeDraft);
  }
  return node.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readStringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readShotCreatorCharacterNames(data: Record<string, unknown>): readonly string[] {
  const characters = data['characters'];
  if (!Array.isArray(characters)) {
    return [];
  }
  return characters
    .map((character) => {
      const record = readRecordValue(character);
      const name = readString(record, 'characterName') ?? readString(record, 'name');
      const role = readString(record, 'role');
      return name && role ? `${name} (${role})` : name;
    })
    .filter((value): value is string => Boolean(value));
}

function joinDisplayValues(values: readonly (string | undefined)[]): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}
