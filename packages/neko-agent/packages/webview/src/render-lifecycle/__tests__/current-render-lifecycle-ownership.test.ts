import { describe, expect, it } from 'vitest';

interface RenderLifecycleOwnerInventoryItem {
  readonly concern:
    | 'visible-react-state'
    | 'foreground-refs'
    | 'conversation-cache'
    | 'timeline-scheduler'
    | 'markdown-registry'
    | 'viewport-focus'
    | 'extension-activation';
  readonly currentOwner: string;
  readonly lifecycleScope: 'component' | 'conversation' | 'webview-realm' | 'extension-message';
  readonly writableFromBackground: boolean;
}

const currentRenderLifecycleOwners: readonly RenderLifecycleOwnerInventoryItem[] = [
  {
    concern: 'visible-react-state',
    currentOwner: 'useConversationState React setters',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'foreground-refs',
    currentOwner: 'useConversationState active/streaming refs',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'conversation-cache',
    currentOwner: 'useConversationState per-conversation maps',
    lifecycleScope: 'conversation',
    writableFromBackground: true,
  },
  {
    concern: 'timeline-scheduler',
    currentOwner: 'useMessageHandler Timeline render commit scheduler',
    lifecycleScope: 'webview-realm',
    writableFromBackground: true,
  },
  {
    concern: 'markdown-registry',
    currentOwner: 'Agent Markdown session registry',
    lifecycleScope: 'webview-realm',
    writableFromBackground: true,
  },
  {
    concern: 'viewport-focus',
    currentOwner: 'MessageList and composer effects',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'extension-activation',
    currentOwner: 'tabState and activeConversation handlers',
    lifecycleScope: 'extension-message',
    writableFromBackground: false,
  },
];

describe('current conversation render lifecycle ownership', () => {
  it('keeps every known render concern explicit during coordinator migration', () => {
    expect(currentRenderLifecycleOwners.map(({ concern }) => concern)).toEqual([
      'visible-react-state',
      'foreground-refs',
      'conversation-cache',
      'timeline-scheduler',
      'markdown-registry',
      'viewport-focus',
      'extension-activation',
    ]);
    expect(new Set(currentRenderLifecycleOwners.map(({ currentOwner }) => currentOwner)).size).toBe(
      currentRenderLifecycleOwners.length,
    );
  });

  it('allows background writes only to conversation-owned or derived renderer resources', () => {
    expect(
      currentRenderLifecycleOwners
        .filter(({ writableFromBackground }) => writableFromBackground)
        .map(({ concern }) => concern),
    ).toEqual(['conversation-cache', 'timeline-scheduler', 'markdown-registry']);
  });
});
