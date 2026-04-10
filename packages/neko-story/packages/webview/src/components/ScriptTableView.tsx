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

// =============================================================================
// Primitives
// =============================================================================

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="px-3 py-1.5 text-left font-medium whitespace-nowrap"
      style={{
        color: 'var(--vscode-descriptionForeground)',
        borderBottom: '1px solid var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-editor-background)',
        fontSize: 11,
        position: 'sticky',
        top: 0,
        zIndex: 1,
        width,
      }}
    >
      {children}
    </th>
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
    neutral: { bg: 'var(--vscode-badge-background)', fg: 'var(--vscode-badge-foreground)' },
    info: { bg: '#3b82f620', fg: '#3b82f6' },
    success: { bg: '#16a34a20', fg: '#16a34a' },
    warn: { bg: '#f59e0b20', fg: '#f59e0b' },
  } as const;

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        backgroundColor: palette[tone].bg,
        color: palette[tone].fg,
        fontSize: 10,
        lineHeight: '16px',
      }}
    >
      {label}
    </span>
  );
}

function IntExtBadge({ value }: { value: string | null | undefined }) {
  const label = value ?? '—';
  const isExt = value === 'EXT';
  const isInt = value === 'INT';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0 4px',
        borderRadius: 3,
        fontSize: 9,
        lineHeight: '16px',
        fontWeight: 600,
        backgroundColor: isExt ? '#16a34a20' : isInt ? '#3b82f620' : '#6b728020',
        color: isExt ? '#16a34a' : isInt ? '#3b82f6' : 'var(--vscode-descriptionForeground)',
        marginLeft: 6,
      }}
    >
      {label}
    </span>
  );
}

function CharacterBadge({ name }: { name: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 3,
        fontSize: 10,
        lineHeight: '14px',
        backgroundColor: 'var(--vscode-badge-background)',
        color: 'var(--vscode-badge-foreground)',
        whiteSpace: 'nowrap',
        marginRight: 4,
        marginBottom: 2,
      }}
    >
      {name}
    </span>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: 3,
        border: '1px solid var(--vscode-panel-border)',
        color: 'var(--vscode-descriptionForeground)',
        backgroundColor: 'transparent',
        fontSize: 10,
        lineHeight: '14px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        marginRight: 3,
        marginBottom: 2,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        el.style.color = 'var(--vscode-foreground)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.backgroundColor = 'transparent';
        el.style.color = 'var(--vscode-descriptionForeground)';
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

// =============================================================================
// Status helpers
// =============================================================================

type TranslationFn = ReturnType<typeof useTranslation>['t'];

function getAgentStatusMeta(status: StorySceneState['agentStatus'], t: TranslationFn) {
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

function getCanvasStatusMeta(status: StorySceneState['canvasStatus'], t: TranslationFn) {
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

// =============================================================================
// Scene row
// =============================================================================

const MAX_VISIBLE_CHARACTERS = 3;

function SceneRow({
  scene,
  sceneIndex,
  isOdd,
  state,
  onNavigate,
  onSceneAction,
  t,
}: {
  scene: NekoStoryScriptIndex['scenes'][number];
  sceneIndex: number;
  isOdd: boolean;
  state: StorySceneState;
  onNavigate?: (line: number) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
  t: TranslationFn;
}) {
  const agentStatus = getAgentStatusMeta(state.agentStatus, t);
  const canvasStatus = getCanvasStatusMeta(state.canvasStatus, t);
  const isSkipped = state.agentStatus === 'skipped' || state.canvasStatus === 'skipped';
  const displayNumber = scene.sceneNumber
    ? `#${scene.sceneNumber}`
    : `#${String(sceneIndex).padStart(2, '0')}`;
  const visibleChars = scene.sceneCharacters.slice(0, MAX_VISIBLE_CHARACTERS);
  const overflowCount = scene.sceneCharacters.length - MAX_VISIBLE_CHARACTERS;

  const rowBg = isOdd ? 'var(--vscode-list-hoverBackground)' : 'transparent';

  return (
    <tr
      onClick={() => onNavigate?.(scene.line_start)}
      style={{
        cursor: 'pointer',
        opacity: isSkipped ? 0.45 : 1,
        backgroundColor: rowBg,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
          'var(--vscode-list-activeSelectionBackground)';
        (e.currentTarget as HTMLTableRowElement).style.opacity = isSkipped ? '0.55' : '0.85';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = rowBg;
        (e.currentTarget as HTMLTableRowElement).style.opacity = isSkipped ? '0.45' : '1';
      }}
    >
      {/* # */}
      <td
        style={{
          padding: '8px 12px',
          textAlign: 'center',
          verticalAlign: 'top',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 3,
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
            whiteSpace: 'nowrap',
          }}
        >
          {displayNumber}
        </span>
      </td>

      {/* Scene info */}
      <td
        style={{
          padding: '8px 12px',
          verticalAlign: 'top',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        {/* Title + INT/EXT */}
        <div style={{ lineHeight: '20px' }}>
          <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--vscode-foreground)' }}>
            {scene.sceneTitle}
          </span>
          <IntExtBadge value={scene.intExt} />
        </div>
        {/* Location · Time · Duration */}
        <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 2 }}>
          {scene.location && <span>{scene.location}</span>}
          {scene.location && scene.timeOfDay && (
            <span style={{ margin: '0 3px', opacity: 0.5 }}>·</span>
          )}
          {scene.timeOfDay && <span>{scene.timeOfDay}</span>}
          {(scene.location || scene.timeOfDay) && (
            <span style={{ margin: '0 3px', opacity: 0.5 }}>·</span>
          )}
          <span style={{ opacity: 0.6 }}>{formatDurationShort(scene.estimatedDuration)}</span>
        </div>
        {/* Summary */}
        {scene.actionSummary && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.6,
              marginTop: 2,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {scene.actionSummary}
          </div>
        )}
      </td>

      {/* Characters */}
      <td
        style={{
          padding: '8px 12px',
          verticalAlign: 'top',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        {scene.sceneCharacters.length > 0 ? (
          <div>
            {visibleChars.map((name) => (
              <CharacterBadge key={name} name={name} />
            ))}
            {overflowCount > 0 && (
              <span
                style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}
                title={scene.sceneCharacters.slice(MAX_VISIBLE_CHARACTERS).join(', ')}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>—</span>
        )}
      </td>

      {/* Status */}
      <td
        style={{
          padding: '8px 12px',
          verticalAlign: 'top',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <div>
          <div style={{ marginBottom: 4 }}>
            <span
              style={{
                fontSize: 9,
                color: 'var(--vscode-descriptionForeground)',
                opacity: 0.5,
                marginRight: 4,
              }}
            >
              A
            </span>
            <StatusBadge label={agentStatus.label} tone={agentStatus.tone} />
          </div>
          <div>
            <span
              style={{
                fontSize: 9,
                color: 'var(--vscode-descriptionForeground)',
                opacity: 0.5,
                marginRight: 4,
              }}
            >
              C
            </span>
            <StatusBadge label={canvasStatus.label} tone={canvasStatus.tone} />
          </div>
        </div>
      </td>

      {/* Actions */}
      <td
        style={{
          padding: '8px 12px',
          verticalAlign: 'top',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <div>
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
            label={isSkipped ? t('table.action.unskip') : t('table.action.skip')}
            onClick={() => onSceneAction?.(scene.sceneId, 'toggleSkip')}
          />
        </div>
      </td>
    </tr>
  );
}

// =============================================================================
// Main component
// =============================================================================

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
      {/* Summary bar */}
      <div
        className="flex items-center gap-4 px-4 py-1.5 sticky top-0 z-20"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-descriptionForeground)',
          fontSize: 11,
        }}
      >
        <span>{t('table.scenes', { count: scriptIndex.scenes.length })}</span>
        <span>{t('table.characters', { count: scriptIndex.characters.length })}</span>
        <span>{t('table.totalDuration', { duration: formatDurationShort(totalDuration) })}</span>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th width="52px">#</Th>
            <Th>{t('table.header.heading')}</Th>
            <Th width="150px">{t('table.header.characters')}</Th>
            <Th width="120px">{t('table.header.status')}</Th>
            <Th width="auto">{t('table.header.action')}</Th>
          </tr>
        </thead>
        <tbody>
          {scriptIndex.scenes.map((scene, i) => (
            <SceneRow
              key={scene.sceneId}
              scene={scene}
              sceneIndex={i + 1}
              isOdd={i % 2 === 1}
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
