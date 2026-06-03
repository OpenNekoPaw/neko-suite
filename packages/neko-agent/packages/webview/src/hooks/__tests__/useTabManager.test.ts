import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { OpenTab } from '@/components/types';
import { useTabManager } from '../useTabManager';

const vscodeMocks = vi.hoisted(() => ({
  switchConversation: vi.fn(),
  updateTabState: vi.fn(),
  exitCharacterDialogueSession: vi.fn(),
  exitEmbodyCharacterSession: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/components/hooks/useVSCode', () => ({
  VSCodeMessages: vscodeMocks,
}));

describe('useTabManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activates role tabs locally without switching the ordinary Agent conversation', () => {
    const roleTab: OpenTab = {
      id: 'tab-role',
      title: 'Character Dialogue: 小橘',
      conversationId: 'role-session-1',
      kind: 'character-dialogue',
    };
    const onBeforeTabActivation = vi.fn();
    const onActivateCharacterRoleTab = vi.fn();
    const setActiveTab = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-chat', title: 'Chat', conversationId: 'conv-a' },
        roleTab,
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-chat');

      return {
        activeTabId,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          conversations: [{ id: 'conv-a', title: 'Chat', messageCount: 1, updatedAt: 1 }],
          setActiveTab,
          onNewChat: vi.fn(),
          onBeforeTabActivation,
          onActivateCharacterRoleTab,
        }),
      };
    });

    act(() => {
      result.current.handleSwitchTab('tab-role');
    });

    expect(result.current.activeTabId).toBe('tab-role');
    expect(onBeforeTabActivation).toHaveBeenCalledTimes(1);
    expect(onActivateCharacterRoleTab).toHaveBeenCalledWith(roleTab);
    expect(vscodeMocks.switchConversation).not.toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledWith('chat');
  });

  it('switches ordinary tabs through the extension conversation route', () => {
    const onBeforeTabActivation = vi.fn();
    const onActivateCharacterRoleTab = vi.fn();

    const { result } = renderHook(() => {
      const [openTabs, setOpenTabs] = useState<OpenTab[]>([
        { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
        { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      ]);
      const [activeTabId, setActiveTabId] = useState<string | null>('tab-a');

      return {
        activeTabId,
        ...useTabManager({
          openTabs,
          setOpenTabs,
          activeTabId,
          setActiveTabId,
          conversations: [
            { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 1 },
            { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 2 },
          ],
          setActiveTab: vi.fn(),
          onNewChat: vi.fn(),
          onBeforeTabActivation,
          onActivateCharacterRoleTab,
        }),
      };
    });

    act(() => {
      result.current.handleSwitchTab('tab-b');
    });

    expect(result.current.activeTabId).toBe('tab-b');
    expect(onBeforeTabActivation).toHaveBeenCalledTimes(1);
    expect(onActivateCharacterRoleTab).not.toHaveBeenCalled();
    expect(vscodeMocks.switchConversation).toHaveBeenCalledWith('conv-b');
  });
});
