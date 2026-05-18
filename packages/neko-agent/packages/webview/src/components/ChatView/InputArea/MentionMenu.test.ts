import { describe, expect, it } from 'vitest';
import { getFilteredMentionItems, getMentionIcon } from './MentionMenu';
import type { MentionItem } from './types';

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
});
