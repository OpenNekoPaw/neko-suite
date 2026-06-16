/**
 * ScriptTableView — whole-table storyboard input preview for creators.
 *
 * Main workflow actions live at table level. Scene rows summarize script
 * structure and character references without becoming an asset-status table.
 *
 * It must not become a second storyboard editor.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import type {
  NekoStoryScriptIndex,
  StoryCharacterVisualReadiness,
  StorySceneVideoReadiness,
} from '@neko/shared';
import { Button } from '@neko/ui/primitives';
import { SendIcon } from '@neko/ui/icons';
import type { StoryTableAction, StoryTableActionScope } from '../types';
import { useTranslation } from '../i18n/I18nContext';

interface ScriptTableViewProps {
  scriptIndex: NekoStoryScriptIndex | null;
  readinessRows?: readonly StorySceneVideoReadiness[];
  characterThumbnails?: Record<string, string>;
  onNavigate?: (line: number) => void;
  onTableAction?: (action: StoryTableAction, scope?: StoryTableActionScope) => void;
  onCharacterNavigate?: (name: string, sceneId?: string, characterId?: string) => void;
}

// =============================================================================
// Primitives
// =============================================================================

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="story-table-column-heading"
      style={{
        width,
      }}
    >
      {children}
    </th>
  );
}

function MetricChip({ children }: { children: React.ReactNode }) {
  return <span className="story-table-metric-chip">{children}</span>;
}

function CharacterBadge({
  character,
  defaultName,
  defaultThumbnailUri,
  sceneId,
  thumbnailUri,
  onNavigateToAsset,
}: {
  character?: StoryCharacterVisualReadiness;
  defaultName?: string;
  defaultThumbnailUri?: string;
  sceneId: string;
  thumbnailUri?: string;
  onNavigateToAsset?: (name: string, sceneId?: string, characterId?: string) => void;
}) {
  const [hoverVisible, setHoverVisible] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const name = character?.name ?? defaultName ?? '';
  const resolvedThumbnailUri = character?.thumbnailUri ?? thumbnailUri ?? defaultThumbnailUri;
  const initial = getCharacterInitial(name);

  return (
    <span
      ref={badgeRef}
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 24,
        padding: '2px 7px 2px 4px',
        borderRadius: 4,
        fontSize: 11,
        lineHeight: '16px',
        backgroundColor: 'color-mix(in srgb, var(--vscode-descriptionForeground) 7%, transparent)',
        color: 'var(--vscode-foreground)',
        border:
          '1px solid color-mix(in srgb, var(--vscode-descriptionForeground) 18%, transparent)',
        whiteSpace: 'nowrap',
        cursor: onNavigateToAsset ? 'pointer' : 'default',
        position: 'relative',
        transition: 'background-color 160ms ease, border-color 160ms ease',
      }}
      role={onNavigateToAsset ? 'button' : undefined}
      tabIndex={onNavigateToAsset ? 0 : undefined}
      onMouseEnter={() => setHoverVisible(true)}
      onMouseLeave={() => setHoverVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        onNavigateToAsset?.(name, sceneId, character?.characterId);
      }}
      onKeyDown={(event) => {
        if (!onNavigateToAsset) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onNavigateToAsset(name, sceneId, character?.characterId);
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
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground, var(--vscode-descriptionForeground))',
            border: '1px solid var(--vscode-panel-border)',
          }}
        >
          {initial}
        </span>
      )}
      {name}
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
          </div>
        </div>
      )}
    </span>
  );
}

function getCharacterInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

// =============================================================================
// Action button primitives
// =============================================================================

function TableActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      className="story-table-action-button"
      leadingIcon={<SendIcon size={13} />}
      size="sm"
      variant="default"
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
// Scene row
// =============================================================================

const MAX_VISIBLE_CHARACTERS = 3;

const CELL_STYLE: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--vscode-panel-border)',
};

interface SceneRowProps {
  scene: NekoStoryScriptIndex['scenes'][number];
  sceneIndex: number;
  isOdd: boolean;
  readiness?: StorySceneVideoReadiness;
  characterThumbnails?: Record<string, string>;
  onNavigate?: (line: number) => void;
  onCharacterNavigate?: (name: string, sceneId?: string, characterId?: string) => void;
}

const SceneRow = memo(function SceneRow({
  scene,
  sceneIndex,
  isOdd,
  readiness,
  characterThumbnails,
  onNavigate,
  onCharacterNavigate,
}: SceneRowProps) {
  const displayNumber = scene.sceneNumber
    ? `#${scene.sceneNumber}`
    : `#${String(sceneIndex).padStart(2, '0')}`;
  const readinessCharacters = readiness?.characters ?? [];
  const defaultCharacters =
    readinessCharacters.length > 0
      ? []
      : scene.sceneCharacters.map((name) => ({
          name,
          thumbnailUri: characterThumbnails?.[name],
        }));
  const characterCount =
    readinessCharacters.length > 0 ? readinessCharacters.length : defaultCharacters.length;
  const visibleReadinessChars = readinessCharacters.slice(0, MAX_VISIBLE_CHARACTERS);
  const visibleDefaultChars = defaultCharacters.slice(0, MAX_VISIBLE_CHARACTERS);
  const overflowCount = characterCount - MAX_VISIBLE_CHARACTERS;

  const rowBg = isOdd
    ? 'color-mix(in srgb, var(--vscode-list-hoverBackground) 46%, transparent)'
    : 'transparent';

  return (
    <tr
      onClick={() => onNavigate?.(scene.line_start)}
      style={{
        cursor: 'pointer',
        backgroundColor: rowBg,
        transition: 'background-color 160ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
          'color-mix(in srgb, var(--vscode-list-hoverBackground) 74%, transparent)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor = rowBg;
      }}
    >
      {/* # */}
      <td style={{ ...CELL_STYLE, textAlign: 'center', width: 72 }}>
        <span
          style={{
            display: 'inline-block',
            fontFamily: 'monospace',
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 7px',
            borderRadius: 4,
            backgroundColor:
              'color-mix(in srgb, var(--vscode-descriptionForeground) 13%, transparent)',
            color: 'var(--vscode-foreground)',
            border:
              '1px solid color-mix(in srgb, var(--vscode-descriptionForeground) 20%, transparent)',
            whiteSpace: 'nowrap',
          }}
        >
          {displayNumber}
        </span>
      </td>

      {/* Scene info */}
      <td style={CELL_STYLE}>
        <div
          style={{
            lineHeight: '22px',
          }}
        >
          <span
            style={{
              minWidth: 0,
              fontWeight: 500,
              fontSize: 13,
              color: 'var(--vscode-foreground)',
            }}
          >
            {scene.sceneTitle}
          </span>
        </div>
        {scene.actionSummary && (
          <div
            style={{
              fontSize: 11,
              lineHeight: '19px',
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.86,
              marginTop: 4,
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
      <td style={{ ...CELL_STYLE, width: 220 }}>
        {characterCount > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {visibleReadinessChars.map((character) => (
              <CharacterBadge
                key={character.characterId ?? character.name}
                character={character}
                sceneId={scene.sceneId}
                onNavigateToAsset={onCharacterNavigate}
              />
            ))}
            {visibleDefaultChars.map((character) => (
              <CharacterBadge
                key={character.name}
                defaultName={character.name}
                defaultThumbnailUri={character.thumbnailUri}
                sceneId={scene.sceneId}
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
                  ...defaultCharacters.map((character) => character.name),
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
    </tr>
  );
});

// =============================================================================
// Main component
// =============================================================================

export function ScriptTableView({
  scriptIndex,
  readinessRows,
  characterThumbnails,
  onNavigate,
  onTableAction,
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

  const hasCharacters = useMemo(() => {
    if (!scriptIndex) return false;
    let chars = false;
    for (const scene of scriptIndex.scenes) {
      const readiness = readinessByScene.get(scene.sceneId);
      if ((readiness?.characters.length ?? scene.sceneCharacters.length) > 0) chars = true;
    }
    return chars;
  }, [scriptIndex, readinessByScene]);

  const allSceneIds = useMemo(
    () => scriptIndex?.scenes.map((scene) => scene.sceneId) ?? [],
    [scriptIndex],
  );

  const handleSendTableToAgent = useCallback(() => {
    if (!scriptIndex || !onTableAction) return;
    onTableAction('sendToAgentAll', { sceneIds: allSceneIds });
  }, [scriptIndex, allSceneIds, onTableAction]);

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
    <div className="story-table-scroll">
      {/* Table header */}
      <div
        className="story-table-sticky-header"
        style={{
          backgroundColor:
            'color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-sideBar-background, transparent))',
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <div className="story-table-toolbar" data-testid="story-table-toolbar">
          <div className="story-table-heading">
            <div className="story-table-title-row">
              <h2 className="story-table-title">{t('table.title')}</h2>
              <div className="story-table-metrics" aria-label={t('table.summary')}>
                <MetricChip>{t('table.scenes', { count: total })}</MetricChip>
                {hasCharacters && (
                  <MetricChip>
                    {t('table.characters', { count: scriptIndex.characters.length })}
                  </MetricChip>
                )}
              </div>
            </div>
          </div>
          <div className="story-table-actions">
            <TableActionButton
              label={t('table.batch.sendTableToAgent')}
              onClick={handleSendTableToAgent}
            />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <Th width="72px">#</Th>
              <Th>{t('table.header.scene')}</Th>
              <Th width="220px">{t('table.header.characters')}</Th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          {scriptIndex.scenes.map((scene, i) => (
            <SceneRow
              key={scene.sceneId}
              scene={scene}
              sceneIndex={i + 1}
              isOdd={i % 2 === 1}
              readiness={readinessByScene.get(scene.sceneId)}
              characterThumbnails={characterThumbnails}
              onNavigate={onNavigate}
              onCharacterNavigate={onCharacterNavigate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
