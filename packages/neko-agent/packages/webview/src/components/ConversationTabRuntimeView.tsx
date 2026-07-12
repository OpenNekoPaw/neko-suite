import type { OpenTab } from '@neko-agent/types';
import { ChatWorkspace, type ChatWorkspaceProps } from './ChatWorkspace';
import type { TabRenderRuntime } from '@/render-runtime/tab-render-runtime';

export interface ConversationTabRuntimeViewProps extends Omit<
  ChatWorkspaceProps,
  'isVisible' | 'tabRenderStore'
> {
  readonly tab: OpenTab;
  readonly runtime: TabRenderRuntime;
  readonly visible: boolean;
}

/**
 * Retains one immutable React render subtree for one Tab binding.
 * Visibility changes must never rebind this component to another runtime.
 */
export function ConversationTabRuntimeView({
  tab,
  runtime,
  visible,
  ...workspaceProps
}: ConversationTabRuntimeViewProps) {
  if (runtime.tabId !== tab.id || runtime.conversationId !== tab.conversationId) {
    throw new Error(
      `Tab runtime binding mismatch: expected ${tab.id}/${tab.conversationId}, received ${runtime.tabId}/${runtime.conversationId}.`,
    );
  }

  return (
    <div
      data-agent-tab-runtime={tab.id}
      data-agent-conversation={tab.conversationId}
      hidden={!visible}
      aria-hidden={!visible}
      className={visible ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
    >
      <ChatWorkspace {...workspaceProps} tabRenderStore={runtime.store} isVisible={visible} />
    </div>
  );
}
