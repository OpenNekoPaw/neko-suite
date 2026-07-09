import { describe, expect, it } from 'vitest';
import {
  closeDesktopEditorTab,
  openDesktopEditorTab,
  reorderDesktopEditorTab,
  type DesktopEditorTabState,
} from './editor-tab-state';

describe('Desktop editor tab state', () => {
  it('opens a file once and makes it active', () => {
    const state: DesktopEditorTabState = { openFileIds: ['a'], activeFileId: 'a' };

    expect(openDesktopEditorTab(state, 'b')).toEqual({
      openFileIds: ['a', 'b'],
      activeFileId: 'b',
    });
    expect(openDesktopEditorTab(state, 'a')).toEqual({
      openFileIds: ['a'],
      activeFileId: 'a',
    });
  });

  it('closes the active tab and selects the next VSCode-style neighbor', () => {
    const state: DesktopEditorTabState = { openFileIds: ['a', 'b', 'c'], activeFileId: 'b' };

    expect(closeDesktopEditorTab(state, 'b')).toEqual({
      openFileIds: ['a', 'c'],
      activeFileId: 'c',
    });
    expect(closeDesktopEditorTab({ openFileIds: ['a', 'b'], activeFileId: 'b' }, 'b')).toEqual({
      openFileIds: ['a'],
      activeFileId: 'a',
    });
    expect(closeDesktopEditorTab({ openFileIds: ['a'], activeFileId: 'a' }, 'a')).toEqual({
      openFileIds: [],
      activeFileId: undefined,
    });
  });

  it('reorders tabs without changing the active editor', () => {
    const state: DesktopEditorTabState = { openFileIds: ['a', 'b', 'c'], activeFileId: 'c' };

    expect(reorderDesktopEditorTab(state, 'c', 'a')).toEqual({
      openFileIds: ['c', 'a', 'b'],
      activeFileId: 'c',
    });
    expect(reorderDesktopEditorTab(state, 'missing', 'a')).toBe(state);
  });
});
