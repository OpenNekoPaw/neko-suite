import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    currentOwner: 'ConversationVisibleStatePort',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'foreground-refs',
    currentOwner: 'ConversationVisibleStatePort',
    lifecycleScope: 'component',
    writableFromBackground: false,
  },
  {
    concern: 'conversation-cache',
    currentOwner: 'ConversationRenderCoordinator with state projection adapter',
    lifecycleScope: 'conversation',
    writableFromBackground: true,
  },
  {
    concern: 'timeline-scheduler',
    currentOwner: 'ConversationRenderRuntimeLifecycle',
    lifecycleScope: 'webview-realm',
    writableFromBackground: true,
  },
  {
    concern: 'markdown-registry',
    currentOwner: 'ConversationMarkdownTimelineResourceOwner',
    lifecycleScope: 'webview-realm',
    writableFromBackground: true,
  },
  {
    concern: 'viewport-focus',
    currentOwner: 'ConversationRenderSnapshot viewport intent',
    lifecycleScope: 'conversation',
    writableFromBackground: false,
  },
  {
    concern: 'extension-activation',
    currentOwner: 'ConversationRenderCoordinator activation transaction',
    lifecycleScope: 'extension-message',
    writableFromBackground: false,
  },
];

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const foregroundActivationFiles = [
  'components/ConversationController.tsx',
  'handlers/conversation-handlers.ts',
  'handlers/conversation-tab-session-state.ts',
  'handlers/tab-handlers.ts',
] as const;

describe('current conversation render lifecycle ownership', () => {
  it('keeps every known render concern explicit after coordinator convergence', () => {
    expect(currentRenderLifecycleOwners.map(({ concern }) => concern)).toEqual([
      'visible-react-state',
      'foreground-refs',
      'conversation-cache',
      'timeline-scheduler',
      'markdown-registry',
      'viewport-focus',
      'extension-activation',
    ]);
  });

  it('allows background writes only to conversation-owned or derived renderer resources', () => {
    expect(
      currentRenderLifecycleOwners
        .filter(({ writableFromBackground }) => writableFromBackground)
        .map(({ concern }) => concern),
    ).toEqual(['conversation-cache', 'timeline-scheduler', 'markdown-registry']);
  });

  it('keeps foreground activation free of direct writable cache access', () => {
    for (const relativePath of foregroundActivationFiles) {
      const source = readFileSync(join(srcRoot, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(
        /conversation(?:Messages|Streaming)Ref\.current\.(?:set|clear)\(/,
      );
    }
  });

  it('keeps prepareActivation private to the coordinator state adapter', () => {
    const productionFiles = [
      'components/ConversationController.tsx',
      'handlers/conversation-handlers.ts',
      'handlers/conversation-tab-session-state.ts',
      'handlers/tab-handlers.ts',
      'render-lifecycle/conversation-render-state-adapter.ts',
    ] as const;
    const prepareActivationCallers = productionFiles.filter((relativePath) =>
      readFileSync(join(srcRoot, relativePath), 'utf8').includes('.prepareActivation('),
    );

    expect(prepareActivationCallers).toEqual([
      'render-lifecycle/conversation-render-state-adapter.ts',
    ]);
    expect(existsSync(join(srcRoot, 'presenters/conversation-tab-activation-presenter.ts'))).toBe(
      false,
    );
    expect(
      existsSync(join(srcRoot, 'render-lifecycle/legacy-conversation-render-adapter.ts')),
    ).toBe(false);
  });
});
