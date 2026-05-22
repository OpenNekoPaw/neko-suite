import React from 'react';
import { lazy } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLocale } from '../../i18n';
import { CanvasTopToolbar } from './CanvasTopToolbar';

(globalThis as { React?: typeof React }).React = React;

describe('CanvasTopToolbar', () => {
  it('renders a localized active node library toggle', () => {
    setLocale('zh-cn');

    const markup = renderToStaticMarkup(
      React.createElement(CanvasTopToolbar, {
        interactionTool: 'select',
        onInteractionToolChange: () => undefined,
        onUndo: () => undefined,
        onRedo: () => undefined,
        isNodeLibraryVisible: true,
        onToggleNodeLibrary: () => undefined,
        autoArrangeChoices: [],
      }),
    );

    expect(markup).toContain('aria-label="切换节点库"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('marks the node library toggle inactive when hidden', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(CanvasTopToolbar, {
        interactionTool: 'select',
        onInteractionToolChange: () => undefined,
        onUndo: () => undefined,
        onRedo: () => undefined,
        isNodeLibraryVisible: false,
        onToggleNodeLibrary: () => undefined,
        autoArrangeChoices: [],
      }),
    );

    expect(markup).toContain('aria-label="Toggle Node Library"');
    expect(markup).toContain('aria-pressed="false"');
  });

  it('hides empty playback and settings placeholders when no controller exists', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(CanvasTopToolbar, {
        interactionTool: 'select',
        onInteractionToolChange: () => undefined,
        onUndo: () => undefined,
        onRedo: () => undefined,
        autoArrangeChoices: [],
      }),
    );

    expect(markup).not.toContain('data-canvas-toolbar-section="playback-settings"');
    expect(markup).not.toContain('Canvas Settings');
  });

  it('renders playback controls only when a controller is registered', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(CanvasTopToolbar, {
        interactionTool: 'select',
        onInteractionToolChange: () => undefined,
        onUndo: () => undefined,
        onRedo: () => undefined,
        autoArrangeChoices: [],
        playbackControllers: [
          {
            id: 'test.playback',
            title: 'Test Playback',
            component: lazy(async () => ({
              default: function TestPlaybackController() {
                return React.createElement('button', { type: 'button' }, 'Playable');
              },
            })),
          },
        ],
      }),
    );

    expect(markup).toContain('data-canvas-toolbar-section="playback-settings"');
    expect(markup).toContain('h-8 w-24 rounded');
    expect(markup).not.toContain('No playback');
  });
});
