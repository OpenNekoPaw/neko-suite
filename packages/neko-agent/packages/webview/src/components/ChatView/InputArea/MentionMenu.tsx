/**
 * MentionMenu Component
 *
 * Unified @mention popup that shows:
 *   • Files — selecting inserts @path into textarea
 *   • Canvas nodes / characters — selecting creates an AgentContextChip
 *
 * Replaces the old FileReferenceMenu for the @ trigger in InputArea.
 */

import { useRef, type CSSProperties } from 'react';
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

const KIND_SECTION_LABELS: Record<MentionItem['kind'], MentionLocalizedLabel> = {
  file: { key: 'chat.input.mentionSections.file', defaultText: 'Files' },
  asset: { key: 'chat.input.mentionSections.asset', defaultText: 'Assets' },
  media: { key: 'chat.input.mentionSections.media', defaultText: 'Media Library' },
  entity: { key: 'chat.input.mentionSections.entity', defaultText: 'Entities' },
  'canvas-node': { key: 'chat.input.mentionSections.canvasNode', defaultText: 'Canvas nodes' },
  character: { key: 'chat.input.mentionSections.character', defaultText: 'Characters' },
  scene: { key: 'chat.input.mentionSections.scene', defaultText: 'Scenes' },
};

const MEDIA_TYPE_TAG_LABELS: Record<
  NonNullable<MentionItem['mediaType']>,
  MentionLocalizedLabel
> = {
  video: { key: 'chat.input.mentionTags.media.video', defaultText: 'Video' },
  audio: { key: 'chat.input.mentionTags.media.audio', defaultText: 'Audio' },
  image: { key: 'chat.input.mentionTags.media.image', defaultText: 'Image' },
  sequence: { key: 'chat.input.mentionTags.media.sequence', defaultText: 'Sequence' },
  text: { key: 'chat.input.mentionTags.media.text', defaultText: 'Text' },
  document: { key: 'chat.input.mentionTags.media.document', defaultText: 'Document' },
};

const SOURCE_TAG_LABELS: Record<NonNullable<MentionItem['source']>, MentionLocalizedLabel> = {
  workspace: { key: 'chat.input.mentionTags.source.workspace', defaultText: 'Workspace' },
  'asset-library': { key: 'chat.input.mentionTags.source.assetLibrary', defaultText: 'Assets' },
  'media-library': { key: 'chat.input.mentionTags.source.mediaLibrary', defaultText: 'Media' },
  'entity-graph': { key: 'chat.input.mentionTags.source.entityGraph', defaultText: 'Entity' },
  story: { key: 'chat.input.mentionTags.source.story', defaultText: 'Story' },
  canvas: { key: 'chat.input.mentionTags.source.canvas', defaultText: 'Canvas' },
};

const KIND_TAG_LABELS: Record<MentionItem['kind'], MentionLocalizedLabel> = {
  file: { key: 'chat.input.mentionTags.kind.file', defaultText: 'File' },
  asset: { key: 'chat.input.mentionTags.kind.asset', defaultText: 'Asset' },
  media: { key: 'chat.input.mentionTags.kind.media', defaultText: 'Media' },
  entity: { key: 'chat.input.mentionTags.kind.entity', defaultText: 'Entity' },
  'canvas-node': { key: 'chat.input.mentionTags.kind.canvasNode', defaultText: 'Canvas' },
  character: { key: 'chat.input.mentionTags.kind.character', defaultText: 'Character' },
  scene: { key: 'chat.input.mentionTags.kind.scene', defaultText: 'Scene' },
};

const ENTITY_TYPE_TAG_LABELS: Record<string, MentionLocalizedLabel> = {
  asset: { key: 'chat.input.mentionTags.entity.asset', defaultText: 'Asset' },
  character: { key: 'chat.input.mentionTags.entity.character', defaultText: 'Character' },
  scene: { key: 'chat.input.mentionTags.entity.scene', defaultText: 'Scene' },
  shot: { key: 'chat.input.mentionTags.entity.shot', defaultText: 'Shot' },
  canvas: { key: 'chat.input.mentionTags.entity.canvas', defaultText: 'Canvas' },
  'canvas-node': { key: 'chat.input.mentionTags.entity.canvasNode', defaultText: 'Canvas node' },
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

interface MentionSection {
  kind: MentionItem['kind'];
  label: MentionLocalizedLabel;
  items: MentionItem[];
  startIndex: number;
}

interface MentionLocalizedLabel {
  key?: string;
  defaultText: string;
}

interface MentionBadgeProjection {
  label: MentionLocalizedLabel;
  style: CSSProperties;
}

interface MentionGlyphProjection {
  label: string;
  style: CSSProperties;
}

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
  const sections = buildMentionSections(filtered);

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
      className="absolute bottom-full left-0 right-0 z-50 mb-2 max-h-[min(228px,34vh)] overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--agent-fg)_8%,transparent)] bg-[color-mix(in_srgb,var(--agent-elevated)_96%,var(--agent-bg)_4%)] shadow-[0_18px_48px_var(--vscode-widget-shadow,rgba(0,0,0,0.26))]"
    >
      <div className="max-h-[min(228px,34vh)] overflow-y-auto px-1.5 py-1.5">
        <div className="px-2.5 pb-1.5 pt-1 text-[10.5px] leading-4 text-[var(--agent-fg-secondary)]">
          {filter ? t('chat.input.mentionSearching', { filter }) : t('chat.input.mentionHint')}
        </div>

        {flat.length === 0 ? (
          <div className="px-2.5 py-2 text-[10.5px] leading-4 text-[var(--agent-fg-secondary)]">
            {t('chat.input.noMatchingFiles')}
          </div>
        ) : (
          <>
            {sections.map((section) => (
              <div key={section.kind}>
                {/* Section header */}
                <div className="sticky top-0 z-10 flex items-center justify-between bg-[color-mix(in_srgb,var(--agent-elevated)_96%,var(--agent-bg)_4%)] px-2.5 pb-1 pt-1.5 text-[10.5px] font-medium leading-3 text-[var(--agent-fg-secondary)]">
                  <span>{resolveMentionLabel(section.label, t)}</span>
                  <span className="font-normal opacity-70">{section.items.length}</span>
                </div>

                {section.items.map((item, itemIndex) => {
                  const flatIdx = section.startIndex + itemIndex;
                  const isSelected = flatIdx === selectedIndex;
                  const glyph = getMentionGlyph(item, isSelected);
                  const subtitle = getMentionSubtitle(item);
                  const badge = getMentionBadge(item, isSelected);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`grid h-8 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[11px] px-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[color-mix(in_srgb,var(--agent-fg)_10%,transparent)] text-[var(--agent-fg)]'
                          : 'text-[var(--agent-fg)] hover:bg-[color-mix(in_srgb,var(--agent-fg)_5%,transparent)]'
                      }`}
                    >
                      {item.thumbnailUri ? (
                        <img
                          src={item.thumbnailUri}
                          alt=""
                          className="h-6 w-6 rounded-[8px] object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-6 w-6 items-center justify-center rounded-[8px] border text-[8.5px] font-semibold leading-none"
                          style={glyph.style}
                        >
                          {glyph.label}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] font-medium leading-4">
                          {item.label}
                        </span>
                        {subtitle && (
                          <span
                            className={`block truncate text-[9.5px] leading-3 ${
                              isSelected
                                ? 'text-[var(--agent-fg)] opacity-70'
                                : 'text-[var(--agent-fg-secondary)]'
                            }`}
                          >
                            {subtitle}
                          </span>
                        )}
                      </span>
                      {badge && (
                        <span
                          className="max-w-[72px] truncate rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium leading-none"
                          style={badge.style}
                        >
                          {resolveMentionLabel(badge.label, t)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>
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
    .sort((a, b) => {
      const kindOrder = MENTION_KIND_ORDER.indexOf(a.kind) - MENTION_KIND_ORDER.indexOf(b.kind);
      if (kindOrder !== 0) return kindOrder;
      const rankOrder = scoreMentionItem(a, lc) - scoreMentionItem(b, lc);
      if (rankOrder !== 0) return rankOrder;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 20);
}

export function getMentionIcon(item: MentionItem): string {
  if (item.filePath && (!item.icon || isGenericMentionIcon(item.icon))) {
    return getFilePathIcon(item.filePath);
  }
  if (item.icon) return item.icon;
  if (item.mediaType) return getMediaTypeIcon(item.mediaType);
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
  const ext = getFileExtension(filePath);
  if (!ext) return KIND_ICONS.file;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'TS';
  if (['rs', 'toml'].includes(ext)) return 'RS';
  if (['json', 'jsonc'].includes(ext)) return '{}';
  if (['md', 'mdx'].includes(ext)) return 'MD';
  if (['css', 'scss', 'less'].includes(ext)) return '#';
  if (['html', 'xml', 'svg'].includes(ext)) return '<>';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(ext)) {
    return ext === 'jpeg' ? 'JPG' : ext.toUpperCase();
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'VID';
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'].includes(ext)) return 'AUD';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'ZIP';
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub'].includes(ext)) {
    return ext.toUpperCase().slice(0, 4);
  }
  return KIND_ICONS.file;
}

function buildMentionSections(items: MentionItem[]): MentionSection[] {
  const sections: MentionSection[] = [];
  let startIndex = 0;
  for (const kind of MENTION_KIND_ORDER) {
    const sectionItems = items.filter((item) => item.kind === kind);
    if (sectionItems.length === 0) continue;
    sections.push({
      kind,
      label: KIND_SECTION_LABELS[kind] ?? { defaultText: kind },
      items: sectionItems,
      startIndex,
    });
    startIndex += sectionItems.length;
  }
  return sections;
}

function getMentionSubtitle(item: MentionItem): string | undefined {
  if (item.filePath) return item.filePath;
  if (item.description && item.description !== item.label) return item.description;
  if (item.contextPayload?.summary && item.contextPayload.summary !== item.label) {
    return item.contextPayload.summary;
  }
  return undefined;
}

function getMentionBadge(
  item: MentionItem,
  isSelected: boolean,
): MentionBadgeProjection | undefined {
  const label = getMentionBadgeLabel(item);
  if (!label) return undefined;
  return {
    label,
    style: getToneStyle(getMentionBadgeToneKey(item), isSelected, 'badge'),
  };
}

function getMentionBadgeLabel(item: MentionItem): MentionLocalizedLabel | undefined {
  if (item.mediaType) return MEDIA_TYPE_TAG_LABELS[item.mediaType];
  if (item.source) return SOURCE_TAG_LABELS[item.source];
  if (item.entityType) return getMentionEntityTypeLabel(item.entityType);
  if (item.kind !== 'file') return KIND_TAG_LABELS[item.kind];
  return undefined;
}

function getMentionEntityTypeLabel(entityType: string): MentionLocalizedLabel {
  const normalized = entityType.toLowerCase();
  return ENTITY_TYPE_TAG_LABELS[normalized] ?? { defaultText: entityType };
}

function resolveMentionLabel(
  label: MentionLocalizedLabel,
  translate: (key: string) => string,
): string {
  if (!label.key) return label.defaultText;
  const translated = translate(label.key);
  return translated === label.key ? label.defaultText : translated;
}

function getMentionGlyph(item: MentionItem, isSelected: boolean): MentionGlyphProjection {
  return {
    label: getMentionIcon(item),
    style: getToneStyle(getMentionToneKey(item), isSelected, 'glyph'),
  };
}

function getMentionToneKey(item: MentionItem): string {
  const extension = item.filePath ? getFileExtension(item.filePath) : undefined;
  if (extension) {
    if (
      [
        'ts',
        'tsx',
        'js',
        'jsx',
        'mjs',
        'cjs',
        'html',
        'xml',
        'svg',
        'css',
        'scss',
        'less',
      ].includes(extension)
    ) {
      return 'code';
    }
    if (['json', 'jsonc', 'toml'].includes(extension)) return 'data';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(extension))
      return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(extension)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus'].includes(extension)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive';
    if (
      ['md', 'mdx', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'epub'].includes(extension)
    ) {
      return 'document';
    }
  }
  return item.mediaType ?? item.source ?? item.kind;
}

function getMentionBadgeToneKey(item: MentionItem): string {
  return item.mediaType ?? item.source ?? item.entityType ?? item.kind;
}

function getToneStyle(key: string, isSelected: boolean, surface: 'badge' | 'glyph'): CSSProperties {
  if (isSelected) {
    return {
      color: 'var(--agent-fg)',
      backgroundColor:
        surface === 'glyph'
          ? 'color-mix(in srgb, var(--agent-bg) 62%, transparent)'
          : 'color-mix(in srgb, var(--agent-bg) 58%, transparent)',
      borderColor: 'color-mix(in srgb, var(--agent-fg) 18%, transparent)',
    };
  }

  const color = getToneColor(key);
  const strength = surface === 'glyph' ? 16 : 10;
  const borderStrength = surface === 'glyph' ? 42 : 34;
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} ${strength}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} ${borderStrength}%, transparent)`,
  };
}

function getToneColor(key: string): string {
  if (key === 'code') return 'var(--vscode-charts-purple,#b180d7)';
  if (key === 'data') return 'var(--vscode-charts-blue,#3794ff)';
  if (key === 'image') return 'var(--vscode-charts-green,#89d185)';
  if (key === 'video' || key === 'sequence') return 'var(--vscode-charts-orange,#d18616)';
  if (key === 'audio') return 'var(--vscode-charts-yellow,#cca700)';
  if (key === 'archive') return 'var(--vscode-terminal-ansiMagenta,#bc3fbc)';
  if (key === 'document' || key === 'text') return 'var(--vscode-textLink-foreground,#3794ff)';
  if (key === 'workspace') return 'var(--vscode-descriptionForeground,#8a8a8a)';
  if (key === 'asset-library' || key === 'asset') return 'var(--vscode-charts-green,#89d185)';
  if (key === 'media-library' || key === 'media') return 'var(--vscode-charts-orange,#d18616)';
  if (key === 'entity-graph' || key === 'entity') return 'var(--vscode-charts-purple,#b180d7)';
  if (key === 'story' || key === 'scene' || key === 'character')
    return 'var(--vscode-charts-yellow,#cca700)';
  if (key === 'canvas' || key === 'canvas-node') return 'var(--vscode-charts-blue,#3794ff)';
  return 'var(--agent-fg-secondary)';
}

function isGenericMentionIcon(icon: string): boolean {
  return icon === KIND_ICONS.file || icon === '📄' || icon === 'file';
}

function scoreMentionItem(item: MentionItem, filter: string): number {
  if (!filter) return 0;
  const label = item.label.toLowerCase();
  const path = item.filePath?.toLowerCase() ?? '';
  if (label === filter || path === filter) return 0;
  if (label.startsWith(filter)) return 1;
  if (getFileName(path).startsWith(filter)) return 2;
  if (path.includes(`/${filter}`)) return 3;
  if (label.includes(filter)) return 4;
  if (path.includes(filter)) return 5;
  return 6;
}

function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function getFileExtension(path: string): string | undefined {
  const fileName = getFileName(path);
  return fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;
}
