import React from 'react';
import { render as renderInk } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { useAgentStore } from '../../stores/agent-store';
import { useConversationStore } from '../../stores/conversation-store';
import { ActivityIndicator } from './ActivityIndicator';
import { ThinkingBlock } from './ThinkingBlock';

function renderInChinese(node: React.ReactElement): ReturnType<typeof renderInk> {
  return renderInk(
    <AgentTerminalPresentationProvider value={createTestAgentTerminalPresentation('zh-cn')}>
      {node}
    </AgentTerminalPresentationProvider>,
  );
}

afterEach(() => {
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
});

describe('activity Ink presentation', () => {
  it('renders localized processing prose with stable iteration values', () => {
    useAgentStore.getState().setRunning();
    useAgentStore.getState().setIteration(3, 10);

    const view = renderInChinese(<ActivityIndicator />);

    expect(view.lastFrame()).toContain('处理中（3/10）');
    view.unmount();
  });

  it('localizes thinking chrome while preserving authored thinking content', () => {
    const content = 'Inspect ConfigManager\nKeep this authored text unchanged';
    const view = renderInChinese(
      <ThinkingBlock content={content} isThinking={false} maxLines={1} />,
    );

    expect(view.lastFrame()).toContain('* 已思考 2 行');
    expect(view.lastFrame()).toContain('... 另有 1 行');
    expect(view.lastFrame()).toContain('Inspect ConfigManager');
    view.unmount();
  });
});
