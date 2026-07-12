import { describe, expect, it, vi } from 'vitest';
import { createTabRenderRuntime, createTabRenderRuntimeRegistry } from '../tab-render-runtime';

describe('TabRenderRuntime', () => {
  it('owns independent composer, configuration, viewport, and diagnostic state', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });
    const diagnostic = {
      type: 'sessionDiagnostic' as const,
      code: 'active-tab-mismatch' as const,
      severity: 'error' as const,
      action: 'session-mutation',
      message: 'A only',
    };

    runtimeA.store.updateState((state) => ({
      inputValue: 'draft-a',
      attachedFiles: [{ id: 'asset-a', name: 'a.png', type: 'image', data: 'data-a' }],
      selectedModel: 'model-a',
      generationParams: { ...state.generationParams, resolution: '4K' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: state.focus.requestRevision + 1 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
      menus: { entryPrompt: 'generate-assets' },
      diagnostics: [diagnostic],
    }));

    expect(runtimeA.store.getSnapshot().state).toMatchObject({
      inputValue: 'draft-a',
      selectedModel: 'model-a',
      generationParams: { resolution: '4K' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: 1 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
      menus: { entryPrompt: 'generate-assets' },
    });
    expect(runtimeB.store.getSnapshot().state).toMatchObject({
      inputValue: '',
      attachedFiles: [],
      selectedModel: '',
      composition: { isComposing: false },
      focus: { target: 'none', requestRevision: 0 },
      viewport: { followMode: 'follow-tail' },
      menus: { entryPrompt: null },
      diagnostics: [],
    });
  });

  it('owns an independent store and explicit lifecycle per Tab binding', () => {
    const runtimeA = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const runtimeB = createTabRenderRuntime({ tabId: 'tab-b', conversationId: 'conv-b' });

    expect(runtimeA.store).not.toBe(runtimeB.store);
    expect(runtimeA.lifecycle).toBe('attaching');
    runtimeA.markReady();
    runtimeA.setVisible(true);

    expect(runtimeA.lifecycle).toBe('ready');
    expect(runtimeA.store.getSnapshot()).toMatchObject({
      tabId: 'tab-a',
      conversationId: 'conv-a',
      visibility: 'visible',
      revision: 1,
    });
    expect(runtimeB.store.getSnapshot()).toMatchObject({
      tabId: 'tab-b',
      conversationId: 'conv-b',
      visibility: 'hidden',
      revision: 0,
    });
  });

  it('fails visibly for invalid lifecycle transitions and disposed store mutation', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });

    expect(() => runtime.beginAttach()).toThrow(/cannot begin attaching from attaching/);
    runtime.markReady();
    expect(() => runtime.markReady()).toThrow(/cannot become ready from ready/);
    runtime.detach();
    runtime.beginAttach();
    runtime.markReady();
    runtime.dispose();

    expect(() => runtime.setVisible(true)).toThrow(/is disposed/);
    expect(() => runtime.store.setVisibility('visible')).toThrow(/is disposed/);
  });
});

describe('TabRenderRuntimeRegistry', () => {
  it('reconciles open Tabs by tabId and activation changes visibility only', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const storeA = runtimeA.store;
    const storeB = runtimeB.store;

    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-b',
    );

    expect(registry.require('tab-a')).toBe(runtimeA);
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(runtimeA.store).toBe(storeA);
    expect(runtimeB.store).toBe(storeB);
    expect(storeA.getSnapshot().visibility).toBe('hidden');
    expect(storeB.getSnapshot().visibility).toBe('visible');
  });

  it('disposes closed Tabs without touching retained runtimes', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a',
    );
    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const listenerB = vi.fn();
    runtimeB.store.subscribe(listenerB);

    registry.reconcile([{ tabId: 'tab-b', conversationId: 'conv-b' }], 'tab-b');

    expect(runtimeA.lifecycle).toBe('disposed');
    expect(registry.get('tab-a')).toBeUndefined();
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(runtimeB.lifecycle).toBe('ready');
    expect(listenerB).toHaveBeenCalledOnce();
  });

  it('rejects duplicate, missing-active, and conversation-rebinding paths', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }], 'tab-a');

    expect(() =>
      registry.reconcile(
        [
          { tabId: 'tab-a', conversationId: 'conv-a' },
          { tabId: 'tab-a', conversationId: 'conv-a' },
        ],
        'tab-a',
      ),
    ).toThrow(/Duplicate Tab render binding/);
    expect(() =>
      registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-a' }], 'tab-missing'),
    ).toThrow(/has no open render binding/);
    expect(() =>
      registry.reconcile([{ tabId: 'tab-a', conversationId: 'conv-b' }], 'tab-a'),
    ).toThrow(/cannot rebind/);
  });
});
