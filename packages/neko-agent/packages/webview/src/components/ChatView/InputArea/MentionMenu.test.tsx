import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MentionMenu, getFilteredMentionItems, getMentionIcon } from './MentionMenu';
import type { MentionItem } from './types';

const translations: Record<string, string> = {
  'chat.input.mentionHint': 'Search mentions',
  'chat.input.mentionSearching': '"{filter}"',
  'chat.input.noMatchingFiles': 'No matching files found',
  'chat.input.mentionSections.file': 'Files',
  'chat.input.mentionSections.asset': 'Assets',
  'chat.input.mentionSections.entity': 'Entities',
  'chat.input.mentionTags.media.image': 'Image',
  'chat.input.mentionTags.source.workspace': 'Workspace',
  'chat.input.mentionTags.source.assetLibrary': 'Assets',
  'chat.input.mentionTags.entity.character': 'Character',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.['filter']
        ? (translations[key] ?? key).replace('{filter}', values['filter'])
        : (translations[key] ?? key),
  }),
}));

function mention(overrides: Partial<MentionItem>): MentionItem {
  return {
    id: 'item-1',
    kind: 'file',
    label: 'Item',
    ...overrides,
  };
}

describe('MentionMenu icon projection', () => {
  it('prefers protocol icons over inferred icons', () => {
    expect(getMentionIcon(mention({ icon: '◎', filePath: 'src/app.ts' }))).toBe('◎');
  });

  it('uses file extensions when host only provides a generic file icon', () => {
    expect(getMentionIcon(mention({ icon: '📄', filePath: 'assets/ref.zip' }))).toBe('ZIP');
    expect(getMentionIcon(mention({ icon: '📄', filePath: 'images/ref.jpeg' }))).toBe('JPG');
  });

  it('infers media icons from media type', () => {
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'video' }))).toBe('🎬');
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'audio' }))).toBe('♪');
    expect(getMentionIcon(mention({ kind: 'media', mediaType: 'image' }))).toBe('🖼');
  });

  it('keeps workspace TypeScript files as code-like entries', () => {
    expect(getMentionIcon(mention({ filePath: 'src/app.ts' }))).toBe('TS');
  });

  it('keeps keyboard filtering aligned with section ordering', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({ id: 'scene', kind: 'scene', label: 'Scene' }),
          mention({ id: 'file', kind: 'file', label: 'File' }),
          mention({ id: 'asset', kind: 'asset', label: 'Asset' }),
        ],
        '',
      ).map((item) => item.kind),
    ).toEqual(['file', 'asset', 'scene']);
  });

  it('filters by host-provided search text and navigation metadata', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({
            id: 'asset',
            kind: 'asset',
            label: 'Portrait',
            searchText: '小橘 alias',
          }),
          mention({
            id: 'entity',
            kind: 'entity',
            label: 'Requirement',
            navigationData: { entityId: '小灰' },
          }),
        ],
        '小灰',
      ).map((item) => item.id),
    ).toEqual(['entity']);
  });

  it('ranks same-kind mentions by stronger text matches before label sort', () => {
    expect(
      getFilteredMentionItems(
        [
          mention({ id: 'deep-path', label: 'z-index.ts', filePath: 'src/ui/index.ts' }),
          mention({ id: 'prefix-label', label: 'index.ts', filePath: 'src/index.ts' }),
          mention({ id: 'later-label', label: 'App index', filePath: 'src/app.ts' }),
        ],
        'index',
      ).map((item) => item.id),
    ).toEqual(['prefix-label', 'deep-path', 'later-label']);
  });

  it('renders compact rows with localized section labels and tags', () => {
    const { container } = render(
      <MentionMenu
        isOpen
        filter=""
        items={[
          mention({
            id: 'file',
            label: 'library.json',
            filePath: 'neko/assets/library.json',
            source: 'workspace',
          }),
          mention({
            id: 'asset',
            kind: 'asset',
            label: 'Hero portrait',
            filePath: 'assets/hero.png',
            mediaType: 'image',
            source: 'asset-library',
            contextPayload: {
              type: 'asset',
              id: 'asset',
              label: 'Hero portrait',
              summary: 'Character reference portrait',
              data: {},
            },
          }),
          mention({
            id: 'entity',
            kind: 'entity',
            label: 'Xiaoju',
            entityType: 'character',
            contextPayload: {
              type: 'character',
              id: 'xiaoju',
              label: 'Xiaoju',
              summary: 'Character profile',
              data: {},
            },
          }),
        ]}
        selectedIndex={1}
        onSelectFile={vi.fn()}
        onSelectContext={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const panel = container.firstElementChild as HTMLElement;

    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('Entities')).toBeTruthy();
    expect(screen.getByText('neko/assets/library.json')).toBeTruthy();
    expect(screen.getByText('assets/hero.png')).toBeTruthy();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(screen.getByText('Character')).toBeTruthy();
    expect(panel.className).toContain('max-h-[min(228px,34vh)]');
    expect(panel.className).toContain('w-[min(480px,calc(100%_-_40px))]');

    const fileButton = screen.getByRole('button', { name: /library\.json/i });
    expect(fileButton.className).toContain('h-8');
    expect(fileButton.className).toContain('rounded-[11px]');
  });

  it('falls back to host-provided tags when no localized entity tag exists', () => {
    render(
      <MentionMenu
        isOpen
        filter=""
        items={[
          mention({
            id: 'entity',
            kind: 'entity',
            label: 'Magic prop',
            entityType: 'prop-special',
            contextPayload: {
              type: 'asset',
              id: 'prop',
              label: 'Magic prop',
              summary: 'Special prop',
              data: {},
            },
          }),
        ]}
        selectedIndex={0}
        onSelectFile={vi.fn()}
        onSelectContext={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('prop-special')).toBeTruthy();
  });
});
