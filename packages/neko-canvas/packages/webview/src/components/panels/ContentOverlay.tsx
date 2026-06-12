import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { CanvasNode, ContainerSection, FieldBinding } from '@neko/shared';
import {
  getDefaultCanvasNodePresetName,
  projectCanvasShotPrompt,
  writeFieldBinding,
} from '@neko/shared';
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
import { t } from '../../i18n';

const PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

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

  return (
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-4 flex flex-col overflow-hidden rounded-xl"
        {...getKeyboardBoundaryMetadata({
          scope: 'modal',
          ownerId: `content-overlay:${node.id}`,
          priority: 40,
          ownedKeys: ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
        })}
        style={{
          zIndex: 9999,
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
        ✕
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
  const detailContent = useMemo(() => createShotDetailContent(content), [content]);
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
          className="grid min-h-0 gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]"
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
          <details className="min-w-0 xl:col-span-2" data-shot-creator-details="true">
            <summary className="cursor-pointer select-none rounded border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
              {t('content.overlayShotDetails')}
            </summary>
            <div className="mt-2 rounded border border-gray-200 bg-white">
              <ContainerRenderer section={detailContent} context={renderContext} />
            </div>
          </details>
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
  const projection = projectCanvasShotPrompt(node);
  const prompt = projection?.prompt ?? '';
  const isCustom = projection?.source === 'generationPrompt';
  const [draft, setDraft] = useState(prompt);
  const skipNextCommitRef = useRef(false);

  useEffect(() => {
    setDraft(prompt);
  }, [prompt]);

  const commitDraft = useCallback(() => {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    const nextPrompt = draft.trim();
    if (nextPrompt === prompt.trim()) return;
    onUpdateData?.(node.id, { generationPrompt: nextPrompt || undefined });
  }, [draft, node.id, onUpdateData, prompt]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.currentTarget.blur();
      }
      if (event.key === 'Escape') {
        skipNextCommitRef.current = true;
        setDraft(prompt);
        event.currentTarget.blur();
      }
    },
    [prompt],
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
          {isCustom
            ? t('content.overlayShotPromptCustom')
            : t('content.overlayShotPromptAssembled')}
        </span>
      </div>
      <textarea
        value={draft}
        rows={4}
        placeholder={t('content.overlayShotPromptPlaceholder')}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyboardEvent}
        onKeyPress={handleKeyboardEvent}
        onMouseDown={(event) => event.stopPropagation()}
        {...getKeyboardBoundaryMetadata({
          scope: 'text-input',
          ownerId: `shot-creator-prompt:${node.id}`,
          ownedKeys: [
            'Backspace',
            'Delete',
            'Enter',
            'Escape',
            'Space',
            'Tab',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
          ],
        })}
        className="min-h-[5.5rem] w-full resize-y rounded border border-gray-200 bg-white px-2 py-1.5 text-[12px] leading-5 text-gray-900 outline-none focus:border-blue-400"
      />
    </div>
  );
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
        {value || <span className="text-gray-400">{t('scene.valueUnavailable')}</span>}
      </div>
    </div>
  );
}

function createShotDetailContent(content: ContainerSection): ContainerSection {
  return {
    ...content,
    sections: content.sections?.filter((section) => section.id !== 'shot-preview'),
  };
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
