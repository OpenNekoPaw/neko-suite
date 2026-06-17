import { describe, expect, it } from 'vitest';
import * as creative from '../creative';
import * as hooks from '../hooks';
import * as icons from '../icons';
import * as keyboard from '../keyboard';
import * as primitives from '../primitives';
import * as testUtils from '../test-utils';
import * as ui from '../index';
import * as viewport from '../viewport';
import * as workbench from '../workbench';

describe('@neko/ui public entrypoints', () => {
  it('keeps existing viewport exports available through the canonical entry', () => {
    expect(viewport.ViewportShell).toBe(ui.ViewportShell);
    expect(viewport.OverlayRenderer).toBe(ui.OverlayRenderer);
    expect(viewport.ViewportToolbar).toBe(ui.ViewportToolbar);
    expect(viewport.ViewportPredictionLayer).toBe(ui.ViewportPredictionLayer);
    expect(viewport.bridgeRenderFrameMetaToViewportFrameMeta).toBe(
      ui.bridgeRenderFrameMetaToViewportFrameMeta,
    );
  });

  it('exposes new UI system subpath surfaces', () => {
    expect(primitives).toBeDefined();
    expect(creative.DEFAULT_TREE_VIEW_VIRTUALIZATION.threshold).toBe(200);
    expect(creative.assertNever).toBeTypeOf('function');
    expect(creative.TimelineRuler).toBe(ui.TimelineRuler);
    expect(creative.KeyframeTimeline).toBe(ui.KeyframeTimeline);
    expect(creative.SeekBar).toBe(ui.SeekBar);
    expect(primitives.PositionedContextMenu).toBe(ui.PositionedContextMenu);
    expect(primitives.buildAIMenuSection).toBe(ui.buildAIMenuSection);
    expect(primitives.SegmentedControl).toBe(ui.SegmentedControl);
    expect(icons.toCodiconClassName('play')).toBe('codicon codicon-play');
    expect(hooks.useResizable).toBeTypeOf('function');
    expect(workbench.CreativeWorkbenchShell).toBe(ui.CreativeWorkbenchShell);
    expect(workbench.CreativeLeftRail).toBe(ui.CreativeLeftRail);
    expect(workbench.MainPanelControlLayer).toBe(ui.MainPanelControlLayer);
    expect(workbench).toHaveProperty('CreativeWorkbenchShell');
    expect(ui.ResizeHandle).toBeTypeOf('function');
    expect(testUtils.hasAccessibleName).toBeTypeOf('function');
    expect(keyboard.KeyboardBoundary).toBe(ui.KeyboardBoundary);
    expect(keyboard.isEditableTarget).toBe(ui.isEditableTarget);
    expect(keyboard.useKeyboardDispatcher).toBe(ui.useKeyboardDispatcher);
  });
});
