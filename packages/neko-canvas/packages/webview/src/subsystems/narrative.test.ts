import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import narrativeRegistration from './narrative';
import { FloatingPanelHost } from '../components/panels/FloatingPanelHost';
import { resolveNarrativePlaybackState } from './narrative/NarrativePlaybackController';
import NarrativeVariablesPanel from './narrative/NarrativeVariablesPanel';
import { setLocale } from '../i18n';
import { useCanvasStore } from '../stores/canvasStore';

(globalThis as { React?: typeof React }).React = React;

describe('narrative subsystem panel metadata', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
    setLocale('en');
  });

  it('localizes floating panel titles through titleKey metadata', () => {
    setLocale('zh-cn');
    const markup = renderToStaticMarkup(
      React.createElement(FloatingPanelHost, {
        panels: narrativeRegistration.floatingPanels ?? [],
      }),
    );
    setLocale('en');

    expect(narrativeRegistration.floatingPanels?.[0]?.titleKey).toBe(
      'panel.narrativeVariables.title',
    );
    expect(markup).toContain('叙事变量');
    expect(markup).not.toContain('Narrative Variables');
  });

  it('keeps narrative variables documented as canvas-level agent context', () => {
    setLocale('zh-cn');
    const markup = renderToStaticMarkup(React.createElement(NarrativeVariablesPanel, {}));
    setLocale('en');

    expect(markup).toContain('画布级故事状态');
    expect(markup).toContain('暂无变量');
  });

  it('enables narrative playback actions when a default path exists', () => {
    const playbackState = resolveNarrativePlaybackState({
      path: ['start', 'choice'],
      selectedNodeId: 'start',
    });

    expect(playbackState).toEqual({
      currentNodeId: 'start',
      currentIndex: 0,
      canStepPrevious: false,
      canStepNext: true,
      canPlay: true,
    });
  });
});
