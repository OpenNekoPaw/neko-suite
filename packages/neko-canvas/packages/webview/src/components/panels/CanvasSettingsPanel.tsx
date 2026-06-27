import { useMemo, type ReactNode } from 'react';
import type { CanvasData, CanvasSubsystemId } from '@neko/shared';
import { CloseIcon } from '@neko/ui/icons';
import { SegmentedControl, Switch } from '@neko/ui/primitives';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { t } from '../../i18n';

export type CanvasNodeTreeMode = 'basic' | 'professional';

export interface CanvasSettingsPanelProps {
  canvasData: CanvasData;
  viewportZoom: number;
  nodeTypeSummary: Readonly<Record<string, number>>;
  activeSubsystemIds: readonly CanvasSubsystemId[];
  isGridVisible: boolean;
  onGridVisibleChange: (visible: boolean) => void;
  isHudVisible: boolean;
  onHudVisibleChange: (visible: boolean) => void;
  isNodeTreeVisible: boolean;
  onNodeTreeVisibleChange: (visible: boolean) => void;
  nodeTreeMode: CanvasNodeTreeMode;
  onNodeTreeModeChange: (mode: CanvasNodeTreeMode) => void;
  onClose: () => void;
}

export function CanvasSettingsPanel({
  canvasData,
  viewportZoom,
  nodeTypeSummary,
  activeSubsystemIds,
  isGridVisible,
  onGridVisibleChange,
  isHudVisible,
  onHudVisibleChange,
  isNodeTreeVisible,
  onNodeTreeVisibleChange,
  nodeTreeMode,
  onNodeTreeModeChange,
  onClose,
}: CanvasSettingsPanelProps) {
  const nodeTypeSummaryText = useMemo(
    () => formatNodeTypeSummary(nodeTypeSummary),
    [nodeTypeSummary],
  );
  const activeSubsystemText =
    activeSubsystemIds.length > 0 ? activeSubsystemIds.join(', ') : t('settings.none');

  return (
    <section
      id="canvas-settings-panel"
      aria-labelledby="canvas-settings-panel-title"
      className="pointer-events-auto absolute bottom-4 left-16 z-30 w-[360px] max-w-[calc(100%-5rem)] overflow-hidden rounded-lg text-xs"
      role="dialog"
      {...getKeyboardBoundaryMetadata({
        scope: 'property-panel',
        ownerId: 'canvas-settings-panel',
        priority: 25,
        ownedKeys: [
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
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        border: '1px solid var(--toolbar-border)',
        boxShadow: 'var(--neko-shadow-lg)',
        color: 'var(--toolbar-fg)',
      }}
    >
      <header
        className="flex items-center gap-2 px-3 py-2"
        style={{
          borderBottom: '1px solid var(--toolbar-border)',
          backgroundColor: 'var(--node-header-bg)',
        }}
      >
        <h2
          id="canvas-settings-panel-title"
          className="min-w-0 flex-1 truncate text-xs font-semibold"
        >
          {t('settings.title')}
        </h2>
        <button
          type="button"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]"
          style={{ color: 'var(--toolbar-fg-secondary)' }}
          aria-label={t('settings.close')}
          onClick={onClose}
        >
          <CloseIcon size={14} />
        </button>
      </header>

      <div className="grid max-h-[min(560px,calc(100vh-6rem))] gap-3 overflow-y-auto p-3">
        <SettingsSection title={t('settings.overview')}>
          <InfoGrid
            items={[
              { label: t('settings.name'), value: canvasData.name },
              { label: t('settings.version'), value: canvasData.version },
              { label: t('settings.nodes'), value: String(canvasData.nodes.length) },
              { label: t('settings.connections'), value: String(canvasData.connections.length) },
              { label: t('settings.zoom'), value: `${Math.round(viewportZoom * 100)}%` },
              {
                label: t('settings.linkedProject'),
                value: canvasData.linkedProject ?? t('settings.none'),
              },
              {
                label: t('settings.relatedBoards'),
                value: String(canvasData.relatedBoards?.length ?? 0),
              },
              {
                label: t('settings.playback'),
                value: canvasData.playback ? t('settings.enabled') : t('settings.disabled'),
              },
              {
                label: t('settings.projected'),
                value: canvasData.projected ? t('settings.enabled') : t('settings.disabled'),
              },
            ]}
          />
          <DetailRow label={t('settings.activeSubsystems')} value={activeSubsystemText} />
          <DetailRow label={t('settings.nodeTypes')} value={nodeTypeSummaryText} />
        </SettingsSection>

        <SettingsSection title={t('settings.view')}>
          <Switch
            checked={isGridVisible}
            id="canvas-settings-grid-visible"
            label={t('settings.gridVisible')}
            onCheckedChange={onGridVisibleChange}
          />
          <Switch
            checked={isHudVisible}
            id="canvas-settings-hud-visible"
            label={t('settings.hudVisible')}
            onCheckedChange={onHudVisibleChange}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.nodeTree')}>
          <Switch
            checked={isNodeTreeVisible}
            id="canvas-settings-node-tree-visible"
            label={t('settings.nodeTreeVisible')}
            onCheckedChange={onNodeTreeVisibleChange}
          />
          <div className="grid gap-2">
            <span style={{ color: 'var(--toolbar-fg-secondary)' }}>
              {t('settings.nodeTreeMode')}
            </span>
            <SegmentedControl
              className="mx-0"
              controls="canvas-right-node-tree-panel"
              label={t('settings.nodeTreeMode')}
              options={[
                { value: 'basic', label: t('rightDock.mode.basic') },
                { value: 'professional', label: t('rightDock.mode.professional') },
              ]}
              value={nodeTreeMode}
              onValueChange={(value) => onNodeTreeModeChange(toCanvasNodeTreeMode(value))}
            />
          </div>
        </SettingsSection>
      </div>
    </section>
  );
}

interface InfoGridItem {
  label: string;
  value: string;
}

function SettingsSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-2">
      <h3
        className="text-[11px] font-semibold uppercase"
        style={{ color: 'var(--toolbar-fg-secondary)' }}
      >
        {title}
      </h3>
      <div
        className="grid gap-2 rounded-md p-2"
        style={{
          backgroundColor: 'var(--control-bg)',
          border: '1px solid var(--control-border)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function InfoGrid({ items }: { items: readonly InfoGridItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate text-[11px]" style={{ color: 'var(--toolbar-fg-secondary)' }}>
            {item.label}
          </dt>
          <dd className="truncate font-medium" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailRow({ label, value }: InfoGridItem) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px]" style={{ color: 'var(--toolbar-fg-secondary)' }}>
        {label}
      </div>
      <div className="truncate font-medium" title={value}>
        {value}
      </div>
    </div>
  );
}

function formatNodeTypeSummary(summary: Readonly<Record<string, number>>): string {
  const entries = Object.entries(summary).filter(([, count]) => count > 0);
  if (entries.length === 0) return t('settings.none');
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `${type} ${count}`)
    .join(' / ');
}

function toCanvasNodeTreeMode(value: string): CanvasNodeTreeMode {
  return value === 'professional' ? 'professional' : 'basic';
}
