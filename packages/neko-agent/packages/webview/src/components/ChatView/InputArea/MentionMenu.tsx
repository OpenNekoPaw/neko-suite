/**
 * MentionMenu Component
 *
 * Unified @mention popup that shows:
 *   • Files — selecting inserts @path into textarea
 *   • Canvas nodes / characters — selecting creates an AgentContextChip
 *
 * Replaces the old FileReferenceMenu for the @ trigger in InputArea.
 */

import { useRef } from 'react';
import type { MentionItem } from './types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';
import type { AgentContextPayload } from '@neko/shared';

const KIND_ICONS: Record<string, string> = {
  file: '📄',
  'canvas-node': '⬡',
  character: '🎭',
  scene: '🎬',
  asset: '◈',
  media: '🎞',
  entity: '◇',
};

const KIND_SECTION_LABELS: Record<string, string> = {
  file: 'Files',
  asset: 'Assets',
  media: 'Media Library',
  entity: 'Entities',
  'canvas-node': 'Canvas nodes',
  character: 'Characters',
  scene: 'Scenes',
};

const MENTION_KIND_ORDER: MentionItem['kind'][] = [
  'file',
  'asset',
  'media',
  'entity',
  'canvas-node',
  'character',
  'scene',
];

interface MentionMenuProps {
  isOpen: boolean;
  filter: string;
  items: MentionItem[];
  selectedIndex: number;
  /** Called when user picks a file item — provides the workspace-relative path */
  onSelectFile: (path: string) => void;
  /** Called when user picks a non-file item — provides context payload for chip creation */
  onSelectContext: (payload: AgentContextPayload) => void;
  onClose: () => void;
}

export function MentionMenu({
  isOpen,
  filter,
  items,
  selectedIndex,
  onSelectFile,
  onSelectContext,
  onClose,
}: MentionMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, onClose);

  if (!isOpen) return null;

  const filtered = getFilteredMentionItems(items, filter);

  const sections = MENTION_KIND_ORDER.map((kind) => ({
    kind,
    items: filtered.filter((i) => i.kind === kind),
  })).filter((s) => s.items.length > 0);

  // Build a flat list for keyboard navigation index alignment
  const flat = sections.flatMap((s) => s.items);

  const handleSelect = (item: MentionItem) => {
    if (item.kind === 'file' && item.filePath) {
      onSelectFile(item.filePath);
    } else if (item.contextPayload) {
      onSelectContext(item.contextPayload);
    }
  };

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-1 w-full bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg max-h-[280px] overflow-y-auto py-1 z-50"
    >
      {/* Search hint */}
      <div className="px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-dropdown-border)]">
        {filter ? t('chat.input.mentionSearching', { filter }) : t('chat.input.mentionHint')}
      </div>

      {flat.length === 0 ? (
        <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {t('chat.input.noMatchingFiles')}
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.kind}>
            {/* Section header */}
            <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)] opacity-70">
              {KIND_SECTION_LABELS[section.kind] ?? section.kind}
            </div>

            {section.items.map((item) => {
              const flatIdx = flat.indexOf(item);
              const isSelected = flatIdx === selectedIndex;
              const icon = getMentionIcon(item);

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`w-full px-3 py-1 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors flex items-center gap-2 ${
                    isSelected ? 'bg-[var(--vscode-list-hoverBackground)]' : ''
                  }`}
                >
                  {item.thumbnailUri ? (
                    <img
                      src={item.thumbnailUri}
                      alt=""
                      className="flex-shrink-0 rounded-sm object-cover"
                      style={{ width: 14, height: 14 }}
                    />
                  ) : (
                    <span aria-hidden="true" className="flex-shrink-0 text-[12px]">
                      {icon}
                    </span>
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.description && item.description !== item.label && (
                    <span className="flex-shrink-0 text-[9px] text-[var(--vscode-descriptionForeground)] truncate max-w-[100px]">
                      {item.description}
                    </span>
                  )}
                  {item.kind !== 'file' && (
                    <span className="flex-shrink-0 text-[9px] px-1 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                      chip
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Filter mention items by text (used in InputArea for keyboard navigation count)
 */
export function getFilteredMentionItems(items: MentionItem[], filter: string): MentionItem[] {
  const lc = filter.toLowerCase();
  return items
    .filter(
      (item) =>
        !filter ||
        item.label.toLowerCase().includes(lc) ||
        (item.description ?? '').toLowerCase().includes(lc) ||
        (item.filePath ?? '').toLowerCase().includes(lc) ||
        (item.entityType ?? '').toLowerCase().includes(lc) ||
        (item.mediaType ?? '').toLowerCase().includes(lc) ||
        (item.searchText ?? '').toLowerCase().includes(lc) ||
        Object.values(item.navigationData ?? {}).some((value) => value.toLowerCase().includes(lc)),
    )
    .sort((a, b) => MENTION_KIND_ORDER.indexOf(a.kind) - MENTION_KIND_ORDER.indexOf(b.kind))
    .slice(0, 20);
}

export function getMentionIcon(item: MentionItem): string {
  if (item.icon) return item.icon;
  if (item.mediaType) return getMediaTypeIcon(item.mediaType);
  if (item.filePath) return getFilePathIcon(item.filePath);
  return KIND_ICONS[item.kind] ?? '◈';
}

function getMediaTypeIcon(mediaType: NonNullable<MentionItem['mediaType']>): string {
  if (mediaType === 'video') return '🎬';
  if (mediaType === 'audio') return '♪';
  if (mediaType === 'image') return '🖼';
  if (mediaType === 'sequence') return '▦';
  if (mediaType === 'text') return 'TXT';
  return '📄';
}

function getFilePathIcon(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;
  if (!ext) return KIND_ICONS.file;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'TS';
  if (['rs', 'toml'].includes(ext)) return 'RS';
  if (['json', 'jsonc'].includes(ext)) return '{}';
  if (['md', 'mdx'].includes(ext)) return 'MD';
  if (['css', 'scss', 'less'].includes(ext)) return '#';
  if (['html', 'xml', 'svg'].includes(ext)) return '<>';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(ext)) return '🖼';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'].includes(ext)) return '♪';
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub'].includes(ext)) return '📄';
  return KIND_ICONS.file;
}
