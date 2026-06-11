/**
 * ScriptTableView — table-level storyboard dispatch panel for creators.
 *
 * Main workflow actions live at table level. Scene rows summarize readiness,
 * visual references, Canvas progress, and local recovery issues.
 *
 * It must not become a second storyboard editor.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  NekoStoryScriptIndex,
  StoryCharacterVisualReadiness,
  StoryCharacterVisualStatus,
  StoryCreatorStatus,
  StoryMissingInput,
  StorySceneVideoReadiness,
} from '@neko/shared';
import { Badge, Button, IconButton } from '@neko/ui/primitives';
import { SendIcon, MoreHorizontalIcon } from '@neko/ui/icons';
import type {
  StorySceneAction,
  StorySceneState,
  StoryTableAction,
  StoryTableActionScope,
} from '../types';
import { formatDurationShort } from '../utils/sceneBreakdown';
import { useTranslation } from '../i18n/I18nContext';

type TranslationFn = ReturnType<typeof useTranslation>['t'];

interface ScriptTableViewProps {
  scriptIndex: NekoStoryScriptIndex | null;
  sceneStates: Record<string, StorySceneState>;
  readinessRows?: readonly StorySceneVideoReadiness[];
  characterThumbnails?: Record<string, string>;
  onNavigate?: (line: number) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
  onTableAction?: (action: StoryTableAction, scope?: StoryTableActionScope) => void;
  onCharacterSendToAgent?: (name: string, sceneId?: string, characterId?: string) => void;
  onCharacterNavigate?: (name: string, sceneId?: string, characterId?: string) => void;
}

const DEFAULT_SCENE_STATE: Omit<StorySceneState, 'sceneId'> = {
  agentStatus: 'not-requested',
  canvasStatus: 'not-sent',
};

// =============================================================================
// Unified status mapping (creator perspective)
// =============================================================================

type CreatorStatus = StoryCreatorStatus;

function deriveCreatorStatus(state: StorySceneState): CreatorStatus {
  const { agentStatus, canvasStatus, generationStatus } = state;

  if (agentStatus === 'skipped' || canvasStatus === 'skipped') return 'skipped';

  if (
    agentStatus === 'failed' ||
    generationStatus === 'partial-fail' ||
    agentStatus === 'review' ||
    agentStatus === 'prompt-review' ||
    agentStatus === 'pilot-review'
  ) {
    return 'attention';
  }

  if (
    (agentStatus === 'timeline-arranged' || agentStatus === 'sent') &&
    (canvasStatus === 'sent' || canvasStatus === 'opened')
  ) {
    return 'done';
  }

  if (
    agentStatus === 'parsing' ||
    agentStatus === 'generating' ||
    generationStatus === 'generating' ||
    canvasStatus === 'queued' ||
    canvasStatus === 'sent'
  ) {
    return 'processing';
  }

  if (agentStatus === 'ready') return 'processing';

  return 'pending';
}

function getStatusDetail(state: StorySceneState, t: TranslationFn): string | undefined {
  if (state.agentStatus === 'failed' || state.generationStatus === 'partial-fail') {
    return t('table.status.detail.failed');
  }
  if (
    state.agentStatus === 'review' ||
    state.agentStatus === 'prompt-review' ||
    state.agentStatus === 'pilot-review'
  ) {
    return t('table.status.detail.review');
  }
  if (state.agentStatus === 'parsing' || state.agentStatus === 'ready') {
    return t('table.status.detail.analyzing');
  }
  if (state.agentStatus === 'generating' || state.generationStatus === 'generating') {
    return t('table.status.detail.generating');
  }
  if (state.canvasStatus === 'queued' || state.canvasStatus === 'sent') {
    return t('table.status.detail.sending');
  }
  return undefined;
}

function getReadinessStatusDetail(
  readiness: StorySceneVideoReadiness | undefined,
  state: StorySceneState,
  t: TranslationFn,
): string | undefined {
  const missing = readiness?.missingInputs
    .filter((input) => input.severity !== 'info')
    .map((input) => translateMissingInputLabel(input, t));
  if (missing && missing.length > 0) {
    return missing.slice(0, 3).join('\n');
  }
  return getStatusDetail(state, t);
}

const STATUS_PALETTE = {
  pending: { bg: 'var(--vscode-badge-background)', fg: 'var(--vscode-badge-foreground)' },
  processing: { bg: '#3b82f620', fg: '#3b82f6' },
  attention: { bg: '#f59e0b20', fg: '#f59e0b' },
  done: { bg: '#16a34a20', fg: '#16a34a' },
  skipped: { bg: 'var(--vscode-badge-background)', fg: 'var(--vscode-badge-foreground)' },
} as const;

const VISUAL_STATUS_PALETTE: Record<
  StoryCharacterVisualStatus,
  { bg: string; fg: string; border?: string }
> = {
  bound: { bg: '#16a34a20', fg: '#16a34a' },
  generated: { bg: '#3b82f620', fg: '#3b82f6' },
  missing: { bg: '#f59e0b20', fg: '#f59e0b' },
  unresolved: { bg: '#ef444420', fg: '#ef4444' },
  unknown: {
    bg: 'var(--vscode-badge-background)',
    fg: 'var(--vscode-descriptionForeground)',
  },
  stale: { bg: '#f9731620', fg: '#f97316' },
};

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
  status,
  label,
  title,
}: {
  status: CreatorStatus;
  label: string;
  title?: string;
}) {
  const palette = STATUS_PALETTE[status];
  return (
    <Badge
      title={title}
      tone={status === 'done' ? 'success' : status === 'attention' ? 'warning' : 'neutral'}
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize: 10,
        lineHeight: '16px',
        opacity: status === 'skipped' ? 0.6 : 1,
        cursor: title ? 'help' : undefined,
      }}
    >
      {label}
    </Badge>
  );
}

function CharacterBadge({
  character,
  fallbackName,
  fallbackThumbnailUri,
  sceneId,
  thumbnailUri,
  onSendToAgent,
  onNavigateToAsset,
}: {
  character?: StoryCharacterVisualReadiness;
  fallbackName?: string;
  fallbackThumbnailUri?: string;
  sceneId: string;
  thumbnailUri?: string;
  onSendToAgent?: (name: string, sceneId?: string, characterId?: string) => void;
  onNavigateToAsset?: (name: string, sceneId?: string, characterId?: string) => void;
}) {
  const [hoverVisible, setHoverVisible] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const { t } = useTranslation();
  const name = character?.name ?? fallbackName ?? '';
  const visualStatus = character?.status;
  const resolvedThumbnailUri = character?.thumbnailUri ?? thumbnailUri ?? fallbackThumbnailUri;
  const palette = visualStatus ? VISUAL_STATUS_PALETTE[visualStatus] : undefined;
  const visualLabel = visualStatus
    ? translateVisualStatus(visualStatus, t)
    : resolvedThumbnailUri
      ? t('table.visualStatus.referenced')
      : '';
  const title = character
    ? [
        name,
        visualLabel,
        translateLocalizedText(
          t,
          character.missingReasonKey,
          character.missingReasonParams,
          character.missingReason,
        ),
      ]
        .filter(Boolean)
        .join('\n')
    : name;

  return (
    <span
      ref={badgeRef}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 3,
        fontSize: 11,
        lineHeight: '16px',
        backgroundColor: palette?.bg ?? 'var(--vscode-badge-background)',
        color: palette?.fg ?? 'var(--vscode-badge-foreground)',
        border: palette?.border ? `1px solid ${palette.border}` : undefined,
        whiteSpace: 'nowrap',
        cursor: onNavigateToAsset ? 'pointer' : 'default',
        position: 'relative',
      }}
      data-character-visual-status={visualStatus ?? (resolvedThumbnailUri ? 'referenced' : 'none')}
      onMouseEnter={() => setHoverVisible(true)}
      onMouseLeave={() => setHoverVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        onNavigateToAsset?.(name, sceneId, character?.characterId);
      }}
    >
      {resolvedThumbnailUri ? (
        <img
          src={resolvedThumbnailUri}
          alt=""
          style={{
            width: 18,
            height: 18,
            borderRadius: 2,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: 2,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            lineHeight: 1,
            backgroundColor: palette?.bg ?? 'var(--vscode-badge-background)',
            color: palette?.fg ?? 'var(--vscode-descriptionForeground)',
            border: '1px solid var(--vscode-panel-border)',
          }}
        >
          {visualStatus === 'bound' || visualStatus === 'generated' ? '✓' : '?'}
        </span>
      )}
      {name}
      {visualLabel && (
        <span
          style={{
            fontSize: 9,
            lineHeight: '12px',
            opacity: 0.85,
            marginLeft: 1,
          }}
        >
          {visualLabel}
        </span>
      )}
      {onSendToAgent && (
        <IconButton
          label={t('table.character.sendToAgent')}
          title={t('table.character.sendToAgent')}
          icon={<SendIcon size={10} />}
          size="xs"
          variant="ghost"
          className="h-4 w-4 flex-shrink-0 opacity-60"
          style={{
            borderRadius: 2,
            fontSize: 9,
            marginLeft: 1,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSendToAgent(name, sceneId, character?.characterId);
          }}
        />
      )}
      {/* Hover preview */}
      {hoverVisible && resolvedThumbnailUri && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            padding: 6,
            borderRadius: 6,
            border: '1px solid var(--vscode-panel-border)',
            backgroundColor: 'var(--vscode-editor-background)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}
        >
          <img
            src={resolvedThumbnailUri}
            alt={name}
            style={{
              width: 120,
              height: 120,
              borderRadius: 4,
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: 'var(--vscode-foreground)',
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            {name}
            {visualStatus ? ` · ${translateVisualStatus(visualStatus, t)}` : ''}
          </div>
        </div>
      )}
    </span>
  );
}

function translateMissingInputLabel(input: StoryMissingInput, t: TranslationFn): string {
  return translateLocalizedText(t, input.labelKey, input.labelParams, input.label);
}

function translateLocalizedText(
  t: TranslationFn,
  key: string | undefined,
  params: Readonly<Record<string, string | number>> | undefined,
  fallback: string | undefined,
): string {
  if (key) {
    const translated = t(key, params ? { ...params } : undefined);
    if (translated !== key) {
      return translated;
    }
  }
  return fallback ?? '';
}

function translateVisualStatus(
  status: StoryCharacterVisualStatus | undefined,
  t: TranslationFn,
): string {
  switch (status) {
    case 'bound':
      return t('table.visualStatus.bound');
    case 'generated':
      return t('table.visualStatus.generated');
    case 'missing':
      return t('table.visualStatus.missing');
    case 'unresolved':
      return t('table.visualStatus.unresolved');
    case 'stale':
      return t('table.visualStatus.stale');
    case 'unknown':
      return t('table.visualStatus.unknown');
    default:
      return '';
  }
}

// =============================================================================
// Action button primitives
// =============================================================================

function SecondaryActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      className="h-5 px-2 text-[10px] leading-4"
      size="xs"
      variant="secondary"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </Button>
  );
}

// =============================================================================
// Inline dropdown menu
// =============================================================================

interface DropdownMenuItem {
  label: string;
  onClick: () => void;
}

function DropdownMenu({
  items,
  anchorRef,
  onClose,
}: {
  items: DropdownMenuItem[];
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 140;
    const vw = window.innerWidth;
    const x = rect.right + menuWidth > vw ? rect.right - menuWidth : rect.left;
    setPos({ x, y: rect.bottom + 2 });
  }, [anchorRef]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 999,
        minWidth: 120,
        padding: '4px 0',
        borderRadius: 4,
        border: '1px solid var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-menu-background, var(--vscode-editor-background))',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      {items.map((item, i) => (
        <Button
          key={i}
          role="menuitem"
          size="xs"
          variant="ghost"
          style={{
            display: 'block',
            width: '100%',
            padding: '4px 12px',
            border: 'none',
            background: 'none',
            textAlign: 'left',
            fontSize: 11,
            color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground))';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--vscode-menu-selectionForeground, var(--vscode-foreground))';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--vscode-menu-foreground, var(--vscode-foreground))';
          }}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </Button>
      ))}
    </div>,
    document.body,
  );
}

// =============================================================================
// Scene row
// =============================================================================

const MAX_VISIBLE_CHARACTERS = 3;

const CELL_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--vscode-panel-border)',
};

function getSceneProgressLabel(
  readiness: StorySceneVideoReadiness | undefined,
  t: TranslationFn,
): string | undefined {
  if (readiness?.canvasSummary) {
    return t('table.canvasProgress', {
      done: readiness.canvasSummary.generatedShotCount,
      total: readiness.canvasSummary.shotCount,
    });
  }

  if (readiness?.recommendedShotCount) {
    return t('table.shotPlan', { count: readiness.recommendedShotCount });
  }

  return undefined;
}

function getSceneIssueLabels(
  readiness: StorySceneVideoReadiness | undefined,
  state: StorySceneState,
  t: TranslationFn,
): readonly string[] {
  const missingInputs =
    readiness?.missingInputs
      .filter((input) => input.severity !== 'info')
      .map((input) => translateMissingInputLabel(input, t)) ?? [];
  if (missingInputs.length > 0) {
    return missingInputs;
  }

  const statusDetail = getStatusDetail(state, t);
  return statusDetail ? [statusDetail] : [];
}

interface SceneRowProps {
  scene: NekoStoryScriptIndex['scenes'][number];
  sceneIndex: number;
  isOdd: boolean;
  selected: boolean;
  state: StorySceneState;
  readiness?: StorySceneVideoReadiness;
  characterThumbnails?: Record<string, string>;
  onNavigate?: (line: number) => void;
  onToggleSelected?: (sceneId: string, selected: boolean) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
  onCharacterSendToAgent?: (name: string, sceneId?: string, characterId?: string) => void;
  onCharacterNavigate?: (name: string, sceneId?: string, characterId?: string) => void;
  t: TranslationFn;
}

const SceneRow = memo(function SceneRow({
  scene,
  sceneIndex,
  isOdd,
  selected,
  state,
  readiness,
  characterThumbnails,
  onNavigate,
  onToggleSelected,
  onSceneAction,
  onCharacterSendToAgent,
  onCharacterNavigate,
  t,
}: SceneRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const creatorStatus = readiness?.creatorStatus ?? deriveCreatorStatus(state);
  const isSkipped = creatorStatus === 'skipped';
  const progressLabel = getSceneProgressLabel(readiness, t);
  const issueLabels = getSceneIssueLabels(readiness, state, t);
  const statusDetail = [
    getReadinessStatusDetail(readiness, state, t),
    progressLabel,
    ...issueLabels,
  ]
    .filter(Boolean)
    .join('\n');

  const displayNumber = scene.sceneNumber
    ? `#${scene.sceneNumber}`
    : `#${String(sceneIndex).padStart(2, '0')}`;
  const readinessCharacters = readiness?.characters ?? [];
  const fallbackCharacters =
    readinessCharacters.length > 0
      ? []
      : scene.sceneCharacters.map((name) => ({
          name,
          thumbnailUri: characterThumbnails?.[name],
        }));
  const characterCount =
    readinessCharacters.length > 0 ? readinessCharacters.length : fallbackCharacters.length;
  const visibleReadinessChars = readinessCharacters.slice(0, MAX_VISIBLE_CHARACTERS);
  const visibleFallbackChars = fallbackCharacters.slice(0, MAX_VISIBLE_CHARACTERS);
  const overflowCount = characterCount - MAX_VISIBLE_CHARACTERS;

  const rowBg = selected
    ? 'var(--vscode-list-activeSelectionBackground)'
    : isOdd
      ? 'var(--vscode-list-hoverBackground)'
      : 'transparent';

  const fire = useCallback(
    (action: StorySceneAction) => onSceneAction?.(scene.sceneId, action),
    [onSceneAction, scene.sceneId],
  );
  const isActionAllowed = useCallback(
    (action: StorySceneAction) => !readiness || readiness.allowedActions.includes(action),
    [readiness],
  );

  // Dropdown items vary by state
  const menuItems = useMemo<DropdownMenuItem[]>(() => {
    const items: DropdownMenuItem[] = [];
    if (creatorStatus !== 'skipped') {
      if (isActionAllowed('analyze')) {
        items.push({ label: t('table.action.analyze'), onClick: () => fire('analyze') });
      }
      if (isActionAllowed('generateStoryboard')) {
        items.push({
          label: t('table.action.storyboard'),
          onClick: () => fire('generateStoryboard'),
        });
      }
      if (isActionAllowed('sendToCanvas')) {
        items.push({ label: t('table.action.sendToCanvas'), onClick: () => fire('sendToCanvas') });
      }
      if (isActionAllowed('openCanvas')) {
        items.push({ label: t('table.action.openCanvas'), onClick: () => fire('openCanvas') });
      }
      if (isActionAllowed('retryFailed')) {
        items.push({ label: t('table.action.retry'), onClick: () => fire('retryFailed') });
      }
      if (isActionAllowed('startVideoCreation')) {
        items.push({
          label: t('table.action.startScene'),
          onClick: () => fire('startVideoCreation'),
        });
      }
    }
    if (isActionAllowed('toggleSkip')) {
      items.push({
        label: isSkipped ? t('table.action.unskip') : t('table.action.skip'),
        onClick: () => fire('toggleSkip'),
      });
    }
    return items;
  }, [t, fire, creatorStatus, isSkipped, isActionAllowed]);

  const handleCloseMenu = useCallback(() => setMenuOpen(false), []);

  const statusLabel = t(`table.status.${creatorStatus}` as Parameters<TranslationFn>[0]);

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
      {/* Select */}
      <td style={{ ...CELL_STYLE, textAlign: 'center', width: 32 }}>
        <input
          type="checkbox"
          aria-label={t('table.selection.row', { scene: displayNumber })}
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onToggleSelected?.(scene.sceneId, event.currentTarget.checked)}
        />
      </td>

      {/* # */}
      <td style={{ ...CELL_STYLE, textAlign: 'center', width: 52 }}>
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

      {/* Scene info (title + summary only) */}
      <td style={CELL_STYLE}>
        <div style={{ lineHeight: '22px' }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--vscode-foreground)' }}>
            {scene.sceneTitle}
          </span>
        </div>
        {scene.actionSummary && (
          <div
            style={{
              fontSize: 11,
              lineHeight: '18px',
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.6,
              marginTop: 3,
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

      {/* Duration */}
      <td style={{ ...CELL_STYLE, width: 64, textAlign: 'right' }}>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'var(--vscode-descriptionForeground)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatDurationShort(scene.estimatedDuration)}
        </span>
      </td>

      {/* Characters */}
      <td style={{ ...CELL_STYLE, width: 160 }}>
        {characterCount > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {visibleReadinessChars.map((character) => (
              <CharacterBadge
                key={character.characterId ?? character.name}
                character={character}
                sceneId={scene.sceneId}
                onSendToAgent={onCharacterSendToAgent}
                onNavigateToAsset={onCharacterNavigate}
              />
            ))}
            {visibleFallbackChars.map((character) => (
              <CharacterBadge
                key={character.name}
                fallbackName={character.name}
                fallbackThumbnailUri={character.thumbnailUri}
                sceneId={scene.sceneId}
                onSendToAgent={onCharacterSendToAgent}
                onNavigateToAsset={onCharacterNavigate}
              />
            ))}
            {overflowCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  lineHeight: '20px',
                  color: 'var(--vscode-descriptionForeground)',
                }}
                title={[
                  ...readinessCharacters.map((character) => character.name),
                  ...fallbackCharacters.map((character) => character.name),
                ]
                  .slice(MAX_VISIBLE_CHARACTERS)
                  .join(', ')}
              >
                +{overflowCount}
              </span>
            )}
          </div>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.65,
            }}
          >
            —
          </span>
        )}
      </td>

      {/* Progress, issues, and local recovery actions */}
      <td style={{ ...CELL_STYLE, width: 200 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* Unified status badge */}
          <StatusBadge status={creatorStatus} label={statusLabel} title={statusDetail} />

          {/* More menu trigger */}
          <IconButton
            ref={moreButtonRef}
            label={t('table.action.more')}
            icon={<MoreHorizontalIcon size={14} />}
            size="xs"
            variant="secondary"
            className="h-[18px] w-5 flex-shrink-0"
            style={{
              borderRadius: 3,
              border: '1px solid var(--vscode-panel-border)',
              color: 'var(--vscode-descriptionForeground)',
              fontSize: 11,
              lineHeight: 1,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title={t('table.action.more')}
          />
          {menuOpen && (
            <DropdownMenu items={menuItems} anchorRef={moreButtonRef} onClose={handleCloseMenu} />
          )}
        </div>
        {progressLabel && (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              lineHeight: '14px',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            {progressLabel}
          </div>
        )}
        {issueLabels.length > 0 ? (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              lineHeight: '14px',
              color: 'var(--vscode-descriptionForeground)',
              maxWidth: 210,
            }}
            title={issueLabels.join('\n')}
          >
            {issueLabels.slice(0, 2).join(' · ')}
          </div>
        ) : (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              lineHeight: '14px',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            {t('table.sceneIssues.none')}
          </div>
        )}
      </td>
    </tr>
  );
});

// =============================================================================
// Main component
// =============================================================================

export function ScriptTableView({
  scriptIndex,
  sceneStates,
  readinessRows,
  characterThumbnails,
  onNavigate,
  onSceneAction,
  onTableAction,
  onCharacterSendToAgent,
  onCharacterNavigate,
}: ScriptTableViewProps) {
  const { t } = useTranslation();
  const [selectedSceneIds, setSelectedSceneIds] = useState<readonly string[]>([]);
  const readinessByScene = useMemo(() => {
    const rows = new Map<string, StorySceneVideoReadiness>();
    for (const row of readinessRows ?? []) {
      rows.set(row.sceneId, row);
    }
    return rows;
  }, [readinessRows]);

  const { totalDuration, doneCount, hasCharacters } = useMemo(() => {
    if (!scriptIndex) return { totalDuration: 0, doneCount: 0, hasCharacters: false };
    let duration = 0;
    let done = 0;
    let chars = false;
    for (const scene of scriptIndex.scenes) {
      const readiness = readinessByScene.get(scene.sceneId);
      duration += readiness?.estimatedDuration ?? scene.estimatedDuration;
      if ((readiness?.characters.length ?? scene.sceneCharacters.length) > 0) chars = true;
      const st = sceneStates[scene.sceneId];
      const creatorStatus = readiness?.creatorStatus ?? (st ? deriveCreatorStatus(st) : 'pending');
      if (creatorStatus === 'done') done++;
    }
    return { totalDuration: duration, doneCount: done, hasCharacters: chars };
  }, [scriptIndex, sceneStates, readinessByScene]);

  const pendingSceneIds = useMemo(() => {
    if (!scriptIndex) return [];
    return scriptIndex.scenes.flatMap((scene) => {
      const st = sceneStates[scene.sceneId];
      if (!st || deriveCreatorStatus(st) === 'pending') {
        return [scene.sceneId];
      }
      return [];
    });
  }, [scriptIndex, sceneStates]);

  useEffect(() => {
    if (!scriptIndex) {
      setSelectedSceneIds([]);
      return;
    }
    const validSceneIds = new Set(scriptIndex.scenes.map((scene) => scene.sceneId));
    setSelectedSceneIds((current) => current.filter((sceneId) => validSceneIds.has(sceneId)));
  }, [scriptIndex]);

  const allSceneIds = useMemo(
    () => scriptIndex?.scenes.map((scene) => scene.sceneId) ?? [],
    [scriptIndex],
  );
  const selectedSceneIdSet = useMemo(() => new Set(selectedSceneIds), [selectedSceneIds]);
  const actionSceneIds = selectedSceneIds.length > 0 ? selectedSceneIds : allSceneIds;
  const selectedPendingSceneIds = pendingSceneIds.filter((sceneId) =>
    selectedSceneIdSet.has(sceneId),
  );
  const startSceneIds = selectedSceneIds.length > 0 ? selectedPendingSceneIds : pendingSceneIds;
  const allSelected = allSceneIds.length > 0 && selectedSceneIds.length === allSceneIds.length;
  const partiallySelected = selectedSceneIds.length > 0 && !allSelected;

  const handleToggleSceneSelected = useCallback((sceneId: string, selected: boolean) => {
    setSelectedSceneIds((current) => {
      if (selected) {
        return current.includes(sceneId) ? current : [...current, sceneId];
      }
      return current.filter((candidate) => candidate !== sceneId);
    });
  }, []);

  const handleToggleAllSelected = useCallback(
    (selected: boolean) => {
      setSelectedSceneIds(selected ? allSceneIds : []);
    },
    [allSceneIds],
  );

  const handleBatchStart = useCallback(() => {
    if (!scriptIndex || !onTableAction) return;
    if (startSceneIds.length === 0) return;
    onTableAction('startVideoCreationAll', {
      sceneIds: startSceneIds,
    });
  }, [scriptIndex, startSceneIds, onTableAction]);

  const handleSendTableToAgent = useCallback(() => {
    if (!scriptIndex || !onTableAction) return;
    onTableAction('sendToAgentAll', { sceneIds: actionSceneIds });
  }, [scriptIndex, actionSceneIds, onTableAction]);

  const handleSendTableToCanvas = useCallback(() => {
    if (!scriptIndex || !onTableAction) return;
    onTableAction('sendToCanvasAll', { sceneIds: actionSceneIds });
  }, [scriptIndex, actionSceneIds, onTableAction]);

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

  const total = scriptIndex.scenes.length;
  const actionScopeLabel =
    selectedSceneIds.length > 0
      ? t('table.selection.selected', { count: selectedSceneIds.length })
      : t('table.selection.all');

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
        <span>{t('table.scenes', { count: total })}</span>
        {hasCharacters && (
          <span>{t('table.characters', { count: scriptIndex.characters.length })}</span>
        )}
        <span>{t('table.totalDuration', { duration: formatDurationShort(totalDuration) })}</span>
        <span style={{ opacity: 0.7 }}>|</span>
        <StatusBadge
          status={doneCount === total ? 'done' : doneCount > 0 ? 'processing' : 'pending'}
          label={t('table.summary.progress', { done: doneCount, total })}
        />
        <span>{actionScopeLabel}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SecondaryActionButton
            label={
              selectedSceneIds.length > 0
                ? t('table.batch.sendSelectedToAgent')
                : t('table.batch.generateStoryboard')
            }
            onClick={handleSendTableToAgent}
          />
          <SecondaryActionButton
            label={
              selectedSceneIds.length > 0
                ? t('table.batch.sendSelectedToCanvas')
                : t('table.batch.syncCanvas')
            }
            onClick={handleSendTableToCanvas}
          />
          <SecondaryActionButton
            label={
              selectedSceneIds.length > 0
                ? t('table.batch.startSelected')
                : t('table.batch.startVideo')
            }
            onClick={handleBatchStart}
          />
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th width="32px">
              <input
                type="checkbox"
                aria-label={t('table.selection.allRows')}
                checked={allSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = partiallySelected;
                  }
                }}
                onChange={(event) => handleToggleAllSelected(event.currentTarget.checked)}
              />
            </Th>
            <Th width="52px">#</Th>
            <Th>{t('table.header.scene')}</Th>
            <Th width="64px">{t('table.header.duration')}</Th>
            <Th width="160px">{t('table.header.characters')}</Th>
            <Th width="200px">{t('table.header.progressIssues')}</Th>
          </tr>
        </thead>
        <tbody>
          {scriptIndex.scenes.map((scene, i) => (
            <SceneRow
              key={scene.sceneId}
              scene={scene}
              sceneIndex={i + 1}
              isOdd={i % 2 === 1}
              selected={selectedSceneIdSet.has(scene.sceneId)}
              state={
                sceneStates[scene.sceneId] ?? {
                  sceneId: scene.sceneId,
                  ...DEFAULT_SCENE_STATE,
                }
              }
              readiness={readinessByScene.get(scene.sceneId)}
              characterThumbnails={characterThumbnails}
              onNavigate={onNavigate}
              onToggleSelected={handleToggleSceneSelected}
              onSceneAction={onSceneAction}
              onCharacterSendToAgent={onCharacterSendToAgent}
              onCharacterNavigate={onCharacterNavigate}
              t={t}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
