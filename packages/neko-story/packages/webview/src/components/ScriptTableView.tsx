/**
 * ScriptTableView — scene dispatch panel for creators.
 *
 * 3-column layout: # | Scene | Status + Action
 * Unified 5-state: pending → processing → attention/done/skipped
 * Context-driven single primary action per state.
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
import type { StorySceneAction, StorySceneState } from '../types';
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
    <span
      title={title}
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
    </span>
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
  const title = character
    ? [
        name,
        translateVisualStatus(visualStatus, t),
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
        gap: 3,
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
      onMouseEnter={() => setHoverVisible(true)}
      onMouseLeave={() => setHoverVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        onNavigateToAsset?.(name, sceneId, character?.characterId);
      }}
    >
      {resolvedThumbnailUri && (
        <img
          src={resolvedThumbnailUri}
          alt=""
          style={{
            width: 14,
            height: 14,
            borderRadius: 2,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}
      {name}
      {visualStatus && (
        <span
          style={{
            fontSize: 9,
            lineHeight: '12px',
            opacity: 0.85,
            marginLeft: 1,
          }}
        >
          {translateVisualStatus(visualStatus, t)}
        </span>
      )}
      {onSendToAgent && (
        <span
          role="button"
          title={t('table.character.sendToAgent')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 14,
            height: 14,
            borderRadius: 2,
            fontSize: 9,
            cursor: 'pointer',
            opacity: 0.6,
            flexShrink: 0,
            marginLeft: 1,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLSpanElement).style.opacity = '1';
            (e.currentTarget as HTMLSpanElement).style.backgroundColor =
              'var(--vscode-list-hoverBackground)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLSpanElement).style.opacity = '0.6';
            (e.currentTarget as HTMLSpanElement).style.backgroundColor = 'transparent';
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSendToAgent(name, sceneId, character?.characterId);
          }}
        >
          ↗
        </span>
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

function PrimaryActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 3,
        border: 'none',
        color: 'var(--vscode-button-foreground)',
        backgroundColor: 'var(--vscode-button-background)',
        fontSize: 10,
        lineHeight: '16px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
          'var(--vscode-button-hoverBackground)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
          'var(--vscode-button-background)';
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

function SecondaryActionButton({ label, onClick }: { label: string; onClick: () => void }) {
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
        <button
          key={i}
          role="menuitem"
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
          type="button"
        >
          {item.label}
        </button>
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

interface SceneRowProps {
  scene: NekoStoryScriptIndex['scenes'][number];
  sceneIndex: number;
  isOdd: boolean;
  state: StorySceneState;
  readiness?: StorySceneVideoReadiness;
  characterThumbnails?: Record<string, string>;
  onNavigate?: (line: number) => void;
  onSceneAction?: (sceneId: string, action: StorySceneAction) => void;
  onCharacterSendToAgent?: (name: string, sceneId?: string, characterId?: string) => void;
  onCharacterNavigate?: (name: string, sceneId?: string, characterId?: string) => void;
  t: TranslationFn;
}

const SceneRow = memo(function SceneRow({
  scene,
  sceneIndex,
  isOdd,
  state,
  readiness,
  characterThumbnails,
  onNavigate,
  onSceneAction,
  onCharacterSendToAgent,
  onCharacterNavigate,
  t,
}: SceneRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const creatorStatus = readiness?.creatorStatus ?? deriveCreatorStatus(state);
  const statusDetail = getReadinessStatusDetail(readiness, state, t);
  const isSkipped = creatorStatus === 'skipped';

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

  const rowBg = isOdd ? 'var(--vscode-list-hoverBackground)' : 'transparent';

  const fire = useCallback(
    (action: StorySceneAction) => onSceneAction?.(scene.sceneId, action),
    [onSceneAction, scene.sceneId],
  );
  const isActionAllowed = useCallback(
    (action: StorySceneAction) => !readiness || readiness.allowedActions.includes(action),
    [readiness],
  );

  // Context-driven primary action
  const primaryAction = useMemo(() => {
    if (readiness?.readinessStatus === 'needs-input' && isActionAllowed('analyze')) {
      return { label: t('table.action.review'), action: 'analyze' as StorySceneAction };
    }

    switch (creatorStatus) {
      case 'pending':
        return isActionAllowed('startVideoCreation')
          ? { label: t('table.action.start'), action: 'startVideoCreation' as StorySceneAction }
          : null;
      case 'attention':
        return state.agentStatus === 'failed' || state.generationStatus === 'partial-fail'
          ? isActionAllowed('retryFailed')
            ? { label: t('table.action.retry'), action: 'retryFailed' as StorySceneAction }
            : null
          : isActionAllowed('analyze')
            ? { label: t('table.action.review'), action: 'analyze' as StorySceneAction }
            : null;
      case 'done':
        return isActionAllowed('openCanvas')
          ? { label: t('table.action.view'), action: 'openCanvas' as StorySceneAction }
          : null;
      case 'skipped':
        return isActionAllowed('toggleSkip')
          ? { label: t('table.action.restore'), action: 'toggleSkip' as StorySceneAction }
          : null;
      case 'processing':
      default:
        return null;
    }
  }, [
    creatorStatus,
    isActionAllowed,
    readiness?.readinessStatus,
    state.agentStatus,
    state.generationStatus,
    t,
  ]);

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
    }
    if (creatorStatus === 'done' && isActionAllowed('startVideoCreation')) {
      items.push({ label: t('table.action.restart'), onClick: () => fire('startVideoCreation') });
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

      {/* Status + Actions (merged column) */}
      <td style={{ ...CELL_STYLE, width: 180 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {/* Unified status badge */}
          <StatusBadge status={creatorStatus} label={statusLabel} title={statusDetail} />

          {/* Primary action */}
          {primaryAction && (
            <PrimaryActionButton
              label={primaryAction.label}
              onClick={() => fire(primaryAction.action)}
            />
          )}

          {/* More menu trigger */}
          <button
            ref={moreButtonRef}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 18,
              borderRadius: 3,
              border: '1px solid var(--vscode-panel-border)',
              color: 'var(--vscode-descriptionForeground)',
              backgroundColor: 'transparent',
              fontSize: 11,
              cursor: 'pointer',
              lineHeight: 1,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'var(--vscode-list-hoverBackground)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--vscode-foreground)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color =
                'var(--vscode-descriptionForeground)';
            }}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title={t('table.action.more')}
            type="button"
          >
            ···
          </button>
          {menuOpen && (
            <DropdownMenu items={menuItems} anchorRef={moreButtonRef} onClose={handleCloseMenu} />
          )}
        </div>
        {readiness?.missingInputs.some((input) => input.severity !== 'info') && (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              lineHeight: '14px',
              color: 'var(--vscode-descriptionForeground)',
              maxWidth: 210,
            }}
            title={readiness.missingInputs
              .map((input) => translateMissingInputLabel(input, t))
              .join('\n')}
          >
            {readiness.missingInputs
              .filter((input) => input.severity !== 'info')
              .slice(0, 2)
              .map((input) => translateMissingInputLabel(input, t))
              .join(' · ')}
          </div>
        )}
        {readiness?.canvasSummary && (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              lineHeight: '14px',
              color: 'var(--vscode-descriptionForeground)',
            }}
          >
            {t('table.canvasProgress', {
              done: readiness.canvasSummary.generatedShotCount,
              total: readiness.canvasSummary.shotCount,
            })}
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
  onCharacterSendToAgent,
  onCharacterNavigate,
}: ScriptTableViewProps) {
  const { t } = useTranslation();
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

  const handleBatchStart = useCallback(() => {
    if (!scriptIndex || !onSceneAction) return;
    for (const scene of scriptIndex.scenes) {
      const st = sceneStates[scene.sceneId];
      if (!st || deriveCreatorStatus(st) === 'pending') {
        onSceneAction(scene.sceneId, 'startVideoCreation');
      }
    }
  }, [scriptIndex, sceneStates, onSceneAction]);

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
        <div style={{ marginLeft: 'auto' }}>
          <SecondaryActionButton label={t('table.batch.startAll')} onClick={handleBatchStart} />
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th width="52px">#</Th>
            <Th>{t('table.header.scene')}</Th>
            <Th width="64px">{t('table.header.duration')}</Th>
            <Th width="160px">{t('table.header.characters')}</Th>
            <Th width="180px">{t('table.header.status')}</Th>
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
                  ...DEFAULT_SCENE_STATE,
                }
              }
              readiness={readinessByScene.get(scene.sceneId)}
              characterThumbnails={characterThumbnails}
              onNavigate={onNavigate}
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
