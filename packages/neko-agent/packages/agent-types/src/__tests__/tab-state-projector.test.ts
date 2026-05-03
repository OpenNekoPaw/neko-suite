import { describe, expect, it } from 'vitest';
import {
  buildTabStateMessage,
  normalizeTabState,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
} from '..';

describe('tab state projector', () => {
  it('normalizes unknown persisted tab state', () => {
    expect(
      normalizeTabState({
        openTabs: [
          { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' },
          { id: 'bad', title: 'Missing conversation' },
          null,
        ],
        activeTabId: 'tab-1',
      }),
    ).toEqual({
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    });

    expect(normalizeTabState({ openTabs: 'bad', activeTabId: 1 })).toEqual({
      openTabs: [],
      activeTabId: null,
    });
  });

  it('projects tab updates without sharing mutable tab references', () => {
    const tab = { id: 'tab-1', title: 'Chat', conversationId: 'conv-1' };
    const projected = projectTabStateUpdate({ openTabs: [tab], activeTabId: 'tab-1' });

    expect(projected).toEqual({ openTabs: [tab], activeTabId: 'tab-1' });
    expect(projected.openTabs[0]).not.toBe(tab);
  });

  it('resolves the active conversation only when the tab and conversation exist', () => {
    const tabState = {
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    };

    expect(
      resolveActiveTabConversationId({
        tabState,
        hasConversation: (conversationId) => conversationId === 'conv-1',
      }),
    ).toBe('conv-1');

    expect(
      resolveActiveTabConversationId({
        tabState,
        hasConversation: () => false,
      }),
    ).toBeNull();
  });

  it('builds a tabState webview message', () => {
    expect(
      buildTabStateMessage({
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
        activeTabId: 'tab-1',
      }),
    ).toEqual({
      type: 'tabState',
      tabState: {
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
        activeTabId: 'tab-1',
      },
    });
  });
});
