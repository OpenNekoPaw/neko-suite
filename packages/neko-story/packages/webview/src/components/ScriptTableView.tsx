/**
 * ScriptTableView — lightweight storyboard review table.
 *
 * This is intentionally scene-level only:
 * - review Agent planning readiness
 * - inspect Canvas handoff status
 * - trigger downstream actions
 *
 * It must not become a second storyboard editor.
 */

import type { NekoStoryScriptIndex } from '@neko/shared';
import type { StorySceneAction, StorySceneState } from '../types';
import { formatDurationShort } from '../utils/sceneBreakdown';
import { useTranslation } from '../i18n/I18nContext';

interface ScriptTableViewProps {
  scriptIndex: NekoStoryScriptIndex | null;
  sceneStates: Record<string, StorySceneState>;
  onNavigate?: (line: number) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
}

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th
      className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
      style={{
        color: 'var(--vscode-foreground)',
        borderBottom: '2px solid var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-editor-background)',
        opacity: 0.75,
        fontSize: 11,
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
      title={title}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  center,
  muted,
}: {
  children: React.ReactNode;
  center?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className="px-2 py-1.5"
      style={{
        borderBottom: '1px solid var(--vscode-panel-border)',
        color: muted ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
        fontSize: 12,
        textAlign: center ? 'center' : 'left',
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warn';
}) {
  const palette = {
    neutral: {
      background: '#6b728020',
      foreground: 'var(--vscode-descriptionForeground)',
    },
    info: {
      background: '#3b82f620',
      foreground: '#3b82f6',
    },
    success: {
      background: '#16a34a20',
      foreground: '#16a34a',
    },
    warn: {
      background: '#f59e0b20',
      foreground: '#f59e0b',
    },
  } as const;

  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
      style={{
        backgroundColor: palette[tone].background,
        color: palette[tone].foreground,
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="px-1.5 py-0.5 rounded border"
      style={{
        borderColor: 'var(--vscode-panel-border)',
        color: 'var(--vscode-foreground)',
        backgroundColor: 'var(--vscode-button-secondaryBackground)',
        fontSize: 11,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function getAgentStatusMeta(status: StorySceneState['agentStatus'], t: ScriptTableViewTranslation) {
  switch (status) {
    case 'ready':
      return { label: t('table.status.agent.ready'), tone: 'info' as const };
    case 'review':
      return { label: t('table.status.agent.review'), tone: 'warn' as const };
    case 'sent':
      return { label: t('table.status.agent.sent'), tone: 'success' as const };
    case 'skipped':
      return { label: t('table.status.skipped'), tone: 'neutral' as const };
    case 'not-requested':
    default:
      return { label: t('table.status.agent.pending'), tone: 'neutral' as const };
  }
}

function getCanvasStatusMeta(
  status: StorySceneState['canvasStatus'],
  t: ScriptTableViewTranslation,
) {
  switch (status) {
    case 'queued':
      return { label: t('table.status.canvas.queued'), tone: 'warn' as const };
    case 'sent':
      return { label: t('table.status.canvas.sent'), tone: 'info' as const };
    case 'opened':
      return { label: t('table.status.canvas.opened'), tone: 'success' as const };
    case 'skipped':
      return { label: t('table.status.skipped'), tone: 'neutral' as const };
    case 'not-sent':
    default:
      return { label: t('table.status.canvas.pending'), tone: 'neutral' as const };
  }
}

type ScriptTableViewTranslation = ReturnType<typeof useTranslation>['t'];

function SceneRow({
  scene,
  state,
  onNavigate,
  onSceneAction,
  t,
}: {
  scene: NekoStoryScriptIndex['scenes'][number];
  state: StorySceneState;
  onNavigate?: (line: number) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
  t: ScriptTableViewTranslation;
}) {
  const agentStatus = getAgentStatusMeta(state.agentStatus, t);
  const canvasStatus = getCanvasStatusMeta(state.canvasStatus, t);
  const intExtLabel = scene.intExt ?? '—';
  const summary = scene.actionSummary || '—';
  const sceneCharacters = scene.sceneCharacters.join(', ') || '—';

  return (
    <tr
      className="hover:opacity-80 cursor-pointer"
      onClick={() => onNavigate?.(scene.line_start)}
      style={{ transition: 'opacity 0.1s' }}
    >
      <Td muted>
        <span className="font-mono text-xs">{scene.sceneNumber ?? scene.sceneId.slice(-6)}</span>
      </Td>
      <Td>
        <div style={{ fontWeight: 500 }}>{scene.sceneTitle}</div>
        <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}>
          {summary}
        </div>
      </Td>
      <Td muted>{scene.location || '—'}</Td>
      <Td muted center>
        {scene.timeOfDay ?? '—'}
      </Td>
      <Td muted>{sceneCharacters}</Td>
      <Td muted center>
        <span
          className="px-1 rounded text-xs"
          style={{
            backgroundColor:
              scene.intExt === 'EXT'
                ? '#16a34a20'
                : scene.intExt === 'INT'
                  ? '#3b82f620'
                  : '#6b728020',
            color:
              scene.intExt === 'EXT'
                ? '#16a34a'
                : scene.intExt === 'INT'
                  ? '#3b82f6'
                  : 'var(--vscode-descriptionForeground)',
          }}
        >
          {intExtLabel}
        </span>
      </Td>
      <Td muted center>{formatDurationShort(scene.estimatedDuration)}</Td>
      <Td center>
        <StatusBadge label={agentStatus.label} tone={agentStatus.tone} />
      </Td>
      <Td center>
        <StatusBadge label={canvasStatus.label} tone={canvasStatus.tone} />
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          <ActionButton label={t('table.action.jump')} onClick={() => onNavigate?.(scene.line_start)} />
          <ActionButton
            label={t('table.action.analyze')}
            onClick={() => onSceneAction?.(scene.sceneId, 'analyze')}
          />
          <ActionButton
            label={t('table.action.storyboard')}
            onClick={() => onSceneAction?.(scene.sceneId, 'generateStoryboard')}
          />
          <ActionButton
            label={t('table.action.canvas')}
            onClick={() => onSceneAction?.(scene.sceneId, 'sendToCanvas')}
          />
          <ActionButton
            label={t('table.action.openCanvas')}
            onClick={() => onSceneAction?.(scene.sceneId, 'openCanvas')}
          />
          <ActionButton
            label={
              state.agentStatus === 'skipped' || state.canvasStatus === 'skipped'
                ? t('table.action.unskip')
                : t('table.action.skip')
            }
            onClick={() => onSceneAction?.(scene.sceneId, 'toggleSkip')}
          />
        </div>
      </Td>
    </tr>
  );
}

export function ScriptTableView({
  scriptIndex,
  sceneStates,
  onNavigate,
  onSceneAction,
}: ScriptTableViewProps) {
  const { t } = useTranslation();

  if (!scriptIndex) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        {t('table.empty')}
      </div>
    );
  }

  if (scriptIndex.scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        {t('table.noScenes')}
      </div>
    );
  }

  const totalDuration = scriptIndex.scenes.reduce((sum, scene) => sum + scene.estimatedDuration, 0);

  return (
    <div
      className="h-full overflow-auto"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <span>{t('table.scenes', { count: scriptIndex.scenes.length })}</span>
        <span>{t('table.characters', { count: scriptIndex.characters.length })}</span>
        <span>{t('table.totalDuration', { duration: formatDurationShort(totalDuration) })}</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th title={t('table.header.number')}>#</Th>
            <Th>{t('table.header.heading')}</Th>
            <Th>{t('table.header.location')}</Th>
            <Th title={t('table.header.time')}>{t('table.header.time')}</Th>
            <Th>{t('table.header.characters')}</Th>
            <Th title={t('table.header.intExt')}>{t('table.header.intExt')}</Th>
            <Th title={t('table.header.duration')}>{t('table.header.duration')}</Th>
            <Th>{t('table.header.agent')}</Th>
            <Th>{t('table.header.canvas')}</Th>
            <Th>{t('table.header.action')}</Th>
          </tr>
        </thead>
        <tbody>
          {scriptIndex.scenes.map((scene) => (
            <SceneRow
              key={scene.sceneId}
              scene={scene}
              state={
                sceneStates[scene.sceneId] ?? {
                  sceneId: scene.sceneId,
                  agentStatus: 'not-requested',
                  canvasStatus: 'not-sent',
                }
              }
              onNavigate={onNavigate}
              onSceneAction={onSceneAction}
              t={t}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
