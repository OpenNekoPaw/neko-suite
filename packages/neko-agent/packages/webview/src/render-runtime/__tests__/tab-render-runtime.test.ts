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
      llmConfig: { ...state.llmConfig, reasoningPreset: 'deep' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: state.focus.requestRevision + 1 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
      menus: { ...state.menus, entryPrompt: 'generate-assets' },
      diagnostics: [diagnostic],
    }));

    expect(runtimeA.store.getSnapshot().state).toMatchObject({
      inputValue: 'draft-a',
      selectedModel: 'model-a',
      generationParams: { resolution: '4K' },
      llmConfig: { reasoningPreset: 'deep' },
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
      llmConfig: {
        reasoningPreset: 'balanced',
        verbosityPreset: 'standard',
        creativityPreset: 'creative',
      },
      menus: {
        entryPrompt: null,
        composer: {
          slash: { open: false, filter: '', selectedIndex: 0 },
          skill: { open: false, filter: '', selectedIndex: 0 },
          mention: { open: false, filter: '', selectedIndex: 0 },
          controls: {
            openMenu: null,
            agentConfigCategory: 'llm',
            understandingCategory: null,
          },
          queueExpanded: false,
        },
      },
      diagnostics: [],
    });
  });

  it('publishes retention changes only when composition or dirty input protection changes', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const listener = vi.fn();
    runtime.store.subscribeRetention(listener);

    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: false,
      hasDirtyInput: false,
      revision: 0,
    });

    runtime.store.updateState({ selectedModel: 'model-a' });
    runtime.store.updateState({ inputValue: 'draft-a' });
    runtime.store.updateState({ inputValue: 'draft-a-updated' });
    runtime.store.updateState({ composition: { isComposing: true } });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: true,
      hasDirtyInput: true,
      revision: 2,
    });

    runtime.store.updateState({ inputValue: '', composition: { isComposing: false } });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(runtime.store.getRetentionSnapshot()).toEqual({
      isComposing: false,
      hasDirtyInput: false,
      revision: 3,
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

  it('publishes attaching lifecycle protection independently from store changes', () => {
    const runtime = createTabRenderRuntime({ tabId: 'tab-a', conversationId: 'conv-a' });
    const listener = vi.fn();
    runtime.subscribeRetention(listener);

    expect(runtime.getRetentionSnapshot()).toMatchObject({ lifecycle: 'attaching', revision: 0 });
    runtime.markReady();
    runtime.detach();
    runtime.beginAttach();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(runtime.getRetentionSnapshot()).toMatchObject({ lifecycle: 'attaching', revision: 3 });
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

  it('preserves Tab-owned input, attachments, configuration, focus, and scroll during rapid activation churn', () => {
    const registry = createTabRenderRuntimeRegistry();
    const bindings = [
      { tabId: 'tab-a', conversationId: 'conv-a' },
      { tabId: 'tab-b', conversationId: 'conv-b' },
      { tabId: 'tab-c', conversationId: 'conv-c' },
    ] as const;
    registry.reconcile(bindings, 'tab-a');

    const runtimeA = registry.require('tab-a');
    const runtimeB = registry.require('tab-b');
    const runtimeC = registry.require('tab-c');

    runtimeA.store.updateState((state) => ({
      inputValue: 'draft-a',
      attachedFiles: [{ id: 'asset-a', name: 'a.png', type: 'image', data: 'data-a' }],
      selectedModel: 'model-a',
      generationParams: { ...state.generationParams, resolution: '4K' },
      llmConfig: { ...state.llmConfig, reasoningPreset: 'deep' },
      composition: { isComposing: true },
      focus: { target: 'input', requestRevision: 3 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-a', anchorOffset: 12 },
    }));
    runtimeB.store.updateState((state) => ({
      inputValue: 'draft-b',
      attachedFiles: [{ id: 'asset-b', name: 'b.wav', type: 'audio', data: 'data-b' }],
      selectedModel: 'model-b',
      generationParams: { ...state.generationParams, resolution: '1080p' },
      llmConfig: { ...state.llmConfig, verbosityPreset: 'detailed' },
      focus: { target: 'input', requestRevision: 7 },
      viewport: { followMode: 'detached', anchorMessageId: 'message-b', anchorOffset: 24 },
    }));
    runtimeC.store.updateState((state) => ({
      inputValue: 'draft-c',
      selectedModel: 'model-c',
      llmConfig: { ...state.llmConfig, creativityPreset: 'wild' },
      viewport: { followMode: 'follow-tail' },
    }));

    const stateA = runtimeA.store.getSnapshot().state;
    const stateB = runtimeB.store.getSnapshot().state;
    const stateC = runtimeC.store.getSnapshot().state;
    const activationOrder = ['tab-b', 'tab-c', 'tab-a', 'tab-c', 'tab-b', 'tab-a'] as const;

    for (let cycle = 0; cycle < 20; cycle += 1) {
      for (const activeTabId of activationOrder) {
        registry.reconcile(bindings, activeTabId);
      }
    }

    expect(registry.require('tab-a')).toBe(runtimeA);
    expect(registry.require('tab-b')).toBe(runtimeB);
    expect(registry.require('tab-c')).toBe(runtimeC);
    expect(runtimeA.store.getSnapshot().state).toEqual(stateA);
    expect(runtimeB.store.getSnapshot().state).toEqual(stateB);
    expect(runtimeC.store.getSnapshot().state).toEqual(stateC);
    expect(runtimeA.store.getSnapshot().visibility).toBe('visible');
    expect(runtimeB.store.getSnapshot().visibility).toBe('hidden');
    expect(runtimeC.store.getSnapshot().visibility).toBe('hidden');
  });

  it('queries every independent Tab runtime attached to one conversation', () => {
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(
      [
        { tabId: 'tab-a-1', conversationId: 'conv-a' },
        { tabId: 'tab-a-2', conversationId: 'conv-a' },
        { tabId: 'tab-b', conversationId: 'conv-b' },
      ],
      'tab-a-1',
    );

    expect(registry.getByConversation('conv-a').map((runtime) => runtime.tabId)).toEqual([
      'tab-a-1',
      'tab-a-2',
    ]);
    expect(registry.getByConversation('conv-b').map((runtime) => runtime.tabId)).toEqual(['tab-b']);
    expect(registry.getByConversation('conv-missing')).toEqual([]);
    expect(() => registry.getByConversation('')).toThrow(/Conversation ID is required/);
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
