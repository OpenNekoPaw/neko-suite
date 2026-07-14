# History Conversation Activation Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a reopened history conversation tab receives its persisted transcript immediately when tab state synchronization activates that conversation.

**Architecture:** Keep the fix in the VSCode Extension Host orchestration layer. `updateTabStateRuntime` already owns the contract for projecting Webview tab state and syncing the host active conversation; `ChatViewProvider` must consume its `sync` result and publish the active conversation when that sync switches to an ordinary chat conversation. Webview remains a message consumer and does not gain duplicate persistence or retry logic.

**Tech Stack:** TypeScript, VSCode Extension API, React Webview message protocol, Vitest, pnpm 10.

---

## Root Cause Summary

The user-visible symptom is: after opening a history conversation, the tab appears but the transcript may be empty for a while and later recover.

The previous frontend fix prevents the wrong old transcript from being shown by clearing the visible messages before a history conversation activation. That is correct, but it exposed a second race:

- `packages/neko-agent/packages/webview/src/hooks/useTabManager.ts:63-88` opens the history tab, calls `switchConversation(conversationId)`, and the `useEffect` at `:52-61` also sends `updateTabState(openTabs, activeTabId)`.
- `packages/neko-agent/packages/extension/src/chat/router/conversationRoutes.ts:42-45` starts `handleSwitchConversation(...)` without awaiting it. The runtime eventually calls `refreshActiveConversation`.
- `packages/neko-agent/packages/extension/src/chat/chatProvider.ts:795-810` runs `updateTabStateRuntime(...)`. That runtime can switch the host active conversation, but `_updateTabState` only saves `_tabState`; it does not send the new active conversation back to the Webview.
- Result: if `updateTabState` wins the race, the host active conversation becomes the history conversation while Webview has only a blank pre-activation cache. The transcript appears only after another path later sends `activeConversation`.

The minimal fix is not to rewrite router async semantics. The missing host-side effect is: when tab state sync switches an ordinary chat conversation, immediately send `activeConversation`.

## File Structure

- Modify: `packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts`
  - Adds a regression test at the provider boundary. This is the smallest test that proves a Webview `updateTabState` message can restore a history transcript without relying on the separate `switchConversation` route.
- Modify: `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`
  - Consumes `updateTabStateRuntime(...).sync`.
  - Sends `activeConversation` when `sync.kind === 'switched'`.
  - Does not send ordinary conversation content for Character Dialogue or Embody Character tabs.

Do not edit unrelated dirty files in this workspace.

## Task 1: Provider Regression Test

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts`

- [ ] **Step 1: Insert the failing test after the existing `keeps same-session empty tab state after all tabs are closed` test**

Add this test before `it('configures chat roots for extension assets, workspace, workspace cache, and media libraries', ...)`:

```ts
  it('sends the active conversation when tab state synchronization switches to a history conversation', async () => {
    const historicalConversation = {
      id: 'conv-history',
      title: 'History',
      messages: [{ id: 'msg-1', role: 'user', content: 'persisted transcript', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
      resumable: false,
      tokenCount: 1,
    };
    const context = createMockContext({
      conversations: {
        conversations: [['conv-history', historicalConversation]],
        activeId: null,
      },
      'neko.tabState': {
        openTabs: [],
        activeTabId: null,
      },
    });
    const webview = vscode.createMockWebview();
    const provider = new ChatViewProvider(vscode.Uri.file('/ext/neko-agent'), context, {
      localResourceAccess: createImmediateLocalResourceAccess(),
    });

    provider.resolveWebviewView(
      {
        webview,
        visible: true,
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
      } as never,
      {} as never,
      {} as never,
    );
    await Promise.resolve();

    const receiveMessage = vi.mocked(webview.onDidReceiveMessage).mock.calls[0]?.[0] as
      | ((message: unknown) => void | Promise<void>)
      | undefined;
    expect(receiveMessage).toBeDefined();
    vi.mocked(webview.postMessage).mockClear();

    await receiveMessage?.({
      type: 'updateTabState',
      openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
      activeTabId: 'tab-history',
    });

    expect(context.workspaceState.update).toHaveBeenCalledWith('neko.tabState', {
      openTabs: [{ id: 'tab-history', title: 'History', conversationId: 'conv-history' }],
      activeTabId: 'tab-history',
    });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'activeConversation',
      conversation: expect.objectContaining({
        id: 'conv-history',
        title: 'History',
        messages: [
          expect.objectContaining({
            id: 'msg-1',
            content: 'persisted transcript',
          }),
        ],
      }),
    });

    provider.dispose();
  });
```

- [ ] **Step 2: Run the focused provider test and verify it fails**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/extension exec vitest run src/chat/__tests__/chatProvider.test.ts -t "sends the active conversation when tab state synchronization switches to a history conversation"
```

Expected: FAIL because `webview.postMessage` does not receive an `activeConversation` message after `updateTabState`.

- [ ] **Step 3: Commit the failing test only**

```bash
git add packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts
git commit -m "test(agent): cover history tab activation from tab state"
```

If this repository policy in the current session does not allow commits, skip the commit and keep this file staged or unstaged according to the user's preference. Do not stage unrelated dirty files.

## Task 2: Send Active Conversation After Tab-State Switch

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`

- [ ] **Step 1: Update `_updateTabState` to publish the switched conversation**

Change `packages/neko-agent/packages/extension/src/chat/chatProvider.ts:795-810` from:

```ts
  private _updateTabState(openTabs: OpenTab[], activeTabId: string | null): void {
    const result = updateTabStateRuntime(
      { openTabs, activeTabId },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
        onConversationSwitched: () => this._syncCanvasAmbientScopeFromActiveConversation(),
      },
    );
    this._tabState = result.tabState;
    this._saveTabState();
  }
```

to:

```ts
  private _updateTabState(openTabs: OpenTab[], activeTabId: string | null): void {
    const result = updateTabStateRuntime(
      { openTabs, activeTabId },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
        onConversationSwitched: () => this._syncCanvasAmbientScopeFromActiveConversation(),
      },
    );
    this._tabState = result.tabState;
    this._saveTabState();

    if (result.sync.kind === 'switched') {
      this._conversationMessageHandler.sendActiveConversation();
    }
  }
```

This intentionally sends only for `switched`, not for:

- `character-dialogue-active`
- `embody-character-active`
- `active-conversation-cleared`
- `skipped`

Those cases either have their own tab/session controller or do not represent a new ordinary chat conversation needing transcript hydration.

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/extension exec vitest run src/chat/__tests__/chatProvider.test.ts -t "sends the active conversation when tab state synchronization switches to a history conversation"
```

Expected: PASS.

- [ ] **Step 3: Run the full provider test file**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/extension exec vitest run src/chat/__tests__/chatProvider.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the implementation**

```bash
git add packages/neko-agent/packages/extension/src/chat/chatProvider.ts packages/neko-agent/packages/extension/src/chat/__tests__/chatProvider.test.ts
git commit -m "fix(agent): hydrate history tab after tab state switch"
```

If commits were skipped in Task 1 because of session policy, make a single commit here with both test and implementation. Do not stage unrelated dirty files.

## Task 3: Regression and Runtime Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run the tab runtime unit tests**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/agent exec vitest run src/runtime/__tests__/conversation-tab-runtime.test.ts
```

Expected: PASS. This proves `updateTabStateRuntime` still returns the existing `sync` variants and the provider change did not require runtime contract churn.

- [ ] **Step 2: Run the conversation switch runtime tests**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/agent exec vitest run src/session/__tests__/conversation-control-runtime.test.ts
```

Expected: PASS. This confirms the normal `switchConversation` route still refreshes active conversation through its existing runtime path.

- [ ] **Step 3: Re-run the Webview regression tests from the prior fix**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/webview exec vitest run src/components/ConversationController.test.tsx src/hooks/__tests__/useTabManager.test.ts
```

Expected: PASS. This guards the previous frontend behavior: history activation must not show the previous transcript while waiting for the host.

- [ ] **Step 4: Run the extension package build**

Run:

```bash
/opt/homebrew/bin/pnpm --dir packages/neko-agent/packages/extension run build
```

Expected: PASS. Build warnings are acceptable only if they already exist and are unrelated to `chatProvider.ts`.

- [ ] **Step 5: Run a real VS Code Webview functional scenario**

Run:

```bash
/opt/homebrew/bin/pnpm smoke:webview:targets
```

Expected: PASS. This is required because the bug crosses Extension Host and VSCode Webview messaging; ordinary browser/Vite verification is not sufficient for this project.

## Task 4: Manual Acceptance Checklist

**Files:**
- No source edits expected.

- [ ] **Step 1: Verify closing and reopening a tab does not restore stale startup tabs**

Manual path:

```text
1. Open the Neko Agent assistant view.
2. Open one history conversation.
3. Close the conversation tab.
4. Restart/reload the extension host or close/reopen the assistant view.
5. Confirm no old tab is automatically restored.
6. Confirm the history menu still lists the previous conversation.
```

Expected: startup tab state remains empty, but history remains available.

- [ ] **Step 2: Verify opening two different history conversations never shows the previous transcript**

Manual path:

```text
1. Open history conversation A.
2. Confirm transcript A appears.
3. Open history conversation B.
4. During the switch, confirm transcript A is not visible in tab B.
5. Confirm transcript B appears without needing another click or waiting for an unrelated refresh.
```

Expected: no stale transcript; no indefinite blank transcript.

- [ ] **Step 3: Verify Character Dialogue and Embody Character tabs still activate through their own controllers**

Manual path:

```text
1. Start a Character Dialogue tab.
2. Switch away and back.
3. Start or open an Embody Character tab.
4. Switch away and back.
```

Expected: those tabs do not receive ordinary `activeConversation` chat transcript hydration from `_updateTabState`; their existing controller state remains authoritative.

## Self-Review Notes

- Spec coverage: the plan covers the reported conflict among history persistence, restart empty-tab behavior, and history content display. It preserves empty startup tabs and fixes the missing content push when user-driven history opening triggers tab-state sync.
- Placeholder scan: no task uses TBD/TODO placeholders. Each code edit and verification command is explicit.
- Type consistency: `result.sync.kind === 'switched'` matches `ConversationTabSyncResult` in `packages/neko-agent/packages/agent/src/runtime/conversation-tab-runtime.ts`. `sendActiveConversation()` exists on `ConversationMessageHandler` and already posts the active `ConversationBridge` projection.
