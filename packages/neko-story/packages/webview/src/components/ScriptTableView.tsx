/**
 * ScriptTableView — Storyboard breakdown table.
 *
 * Rows  = scenes parsed from the Fountain document.
 * Cols  = #, Heading, Ext, Location, Time, Duration, [Character…]
 *
 * Character columns are dynamic: one column per unique character name
 * found across all scenes. A filled circle ● indicates the character
 * appears in that scene.
 */

import type { FountainDocument } from '../types';
import {
  buildSceneBreakdowns,
  extractAllCharacters,
  formatDurationShort,
  type SceneBreakdown,
} from '../utils/sceneBreakdown';

// =============================================================================
// Types
// =============================================================================

interface ScriptTableViewProps {
  document: FountainDocument | null;
  onNavigate?: (line: number) => void;
}

// =============================================================================
// Sub-components
// =============================================================================

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

function SceneRow({
  scene,
  characters,
  onNavigate,
}: {
  scene: SceneBreakdown;
  characters: string[];
  onNavigate?: (line: number) => void;
}) {
  const intExtLabel =
    scene.intExt === 'INT'
      ? 'INT'
      : scene.intExt === 'EXT'
        ? 'EXT'
        : scene.intExt
          ? scene.intExt
          : '—';

  return (
    <tr
      className="hover:opacity-80 cursor-pointer"
      onClick={() => onNavigate?.(scene.line)}
      style={{ transition: 'opacity 0.1s' }}
    >
      <Td muted>
        <span className="font-mono text-xs">
          {scene.sceneNumber ?? String(scene.sceneIndex).padStart(2, '0')}
        </span>
      </Td>
      <Td>
        <span style={{ fontWeight: 500 }}>{scene.heading}</span>
        {scene.actionPreview && (
          <div
            className="mt-0.5 line-clamp-1"
            style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}
          >
            {scene.actionPreview}
          </div>
        )}
      </Td>
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
      <Td muted>{scene.location || '—'}</Td>
      <Td muted center>
        {scene.time ?? '—'}
      </Td>
      <Td muted center>
        {formatDurationShort(scene.estimatedDurationSec)}
      </Td>
      {characters.map((char) => (
        <Td key={char} center>
          {scene.characters.includes(char) ? (
            <span style={{ color: '#3b82f6', fontSize: 14 }}>●</span>
          ) : null}
        </Td>
      ))}
    </tr>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ScriptTableView({ document, onNavigate }: ScriptTableViewProps) {
  if (!document) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        打开剧本文件以生成分镜表
      </div>
    );
  }

  const scenes = buildSceneBreakdowns(document);
  const characters = extractAllCharacters(scenes);

  if (scenes.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--vscode-descriptionForeground)' }}
      >
        未找到场景标题（以 INT./EXT. 开头的行）
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      {/* Summary bar */}
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs sticky top-0 z-10"
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          borderBottom: '1px solid var(--vscode-panel-border)',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <span>{scenes.length} 个场景</span>
        <span>{characters.length} 个角色</span>
        <span>
          预计总时长{' '}
          {formatDurationShort(scenes.reduce((acc, s) => acc + s.estimatedDurationSec, 0))}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Th title="场景编号">#</Th>
            <Th>场景标题</Th>
            <Th title="内景/外景">景</Th>
            <Th>地点</Th>
            <Th title="时间">时</Th>
            <Th title="预计时长">时长</Th>
            {characters.map((char) => (
              <Th key={char} title={char}>
                {char.length > 6 ? char.slice(0, 5) + '…' : char}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenes.map((scene) => (
            <SceneRow
              key={scene.line}
              scene={scene}
              characters={characters}
              onNavigate={onNavigate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
