import { describe, expect, it, vi } from 'vitest';
import type { MenuAction } from '@neko/ui/primitives';
import { buildNodeMenuItems } from './ContextMenu';

describe('Canvas ContextMenu builders', () => {
  it('exposes a node playback entry action before AI actions', () => {
    const onSetPlaybackEntry = vi.fn();
    const items = buildNodeMenuItems({
      canvasPosition: { x: 0, y: 0 },
      hasSelection: true,
      selectedCount: 1,
      contextNodeId: 'scene-1',
      onSetPlaybackEntry,
      onAddText: vi.fn(),
      onAddScene: vi.fn(),
      onDelete: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });

    const playbackEntry = items.find(
      (item): item is MenuAction =>
        !('separator' in item) && item.label === 'Set as Playback Start',
    );

    expect(playbackEntry).toBeDefined();
    expect(playbackEntry?.disabled).toBe(false);

    playbackEntry?.onClick?.();

    expect(onSetPlaybackEntry).toHaveBeenCalledWith('scene-1');
  });
});
