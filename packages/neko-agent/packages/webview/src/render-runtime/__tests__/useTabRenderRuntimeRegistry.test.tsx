import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OpenTab } from '@neko-agent/types';
import { useTabRenderRuntimeRegistry } from '../useTabRenderRuntimeRegistry';

const tabA: OpenTab = { id: 'tab-a', title: 'A', conversationId: 'conv-a' };
const tabB: OpenTab = { id: 'tab-b', title: 'B', conversationId: 'conv-b' };

describe('useTabRenderRuntimeRegistry', () => {
  it('retains Tab runtimes across activation and disposes them with the Webview root', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ tabs, activeTabId }: { tabs: readonly OpenTab[]; activeTabId: string | null }) =>
        useTabRenderRuntimeRegistry(tabs, activeTabId),
      { initialProps: { tabs: [tabA, tabB], activeTabId: 'tab-a' } },
    );
    const runtimeA = result.current.require('tab-a');
    const runtimeB = result.current.require('tab-b');

    act(() => rerender({ tabs: [tabA, tabB], activeTabId: 'tab-b' }));

    expect(result.current.require('tab-a')).toBe(runtimeA);
    expect(result.current.require('tab-b')).toBe(runtimeB);
    expect(runtimeA.store.getSnapshot().visibility).toBe('hidden');
    expect(runtimeB.store.getSnapshot().visibility).toBe('visible');

    unmount();

    await waitFor(() => {
      expect(runtimeA.lifecycle).toBe('disposed');
      expect(runtimeB.lifecycle).toBe('disposed');
    });
  });
});
