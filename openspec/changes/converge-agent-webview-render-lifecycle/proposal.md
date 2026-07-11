## Why

Neko Agent Webview currently represents one conversation across visible React state, mutable refs, per-conversation caches, Timeline scheduling, normalized Markdown sessions, and Extension-owned Tab snapshots. These layers can advance or be disposed independently, so Tab switching, background streaming, Webview remount, and foreground restoration can expose a Timeline whose renderer-owned resources are missing or stale, producing visible errors, frozen status, incorrect auto-scroll, or cross-conversation coupling symptoms.

The immediate Markdown session defect has been repaired, but the lifecycle contract remains distributed across multiple handlers. This change makes conversation rendering ownership explicit so future streaming, queue, status, and renderer changes cannot reintroduce non-atomic foreground activation.

## What Changes

- Introduce one Webview-local conversation render lifecycle contract that owns projection, foreground activation, background mutation, renderer-resource reconciliation, and conversation cleanup.
- Define a canonical per-conversation render snapshot containing messages, streaming metadata, active Timeline ownership, queue state, and monotonically increasing render revision.
- Route normal UI Tabs, character-role Tabs, Extension `tabState`, and Extension `activeConversation` through the same foreground activation transaction.
- Separate background ingestion from foreground publication: hidden conversations update their owning snapshot without replacing visible React state or forcing bottom-scroll behavior.
- Make renderer resources, initially normalized Markdown sessions, derived/reconcilable resources of the canonical Timeline snapshot rather than independent display authority.
- Define explicit visibility states and transitions for foreground, background, suspended, unavailable, completed, disposed, and restored conversations.
- Centralize cleanup so closing a Tab, unmounting a Webview, replacing an active turn, and disposing a conversation release only resources owned by the intended lifecycle scope.
- Add path-level diagnostics and tests proving that no activation entry point bypasses the coordinator and that renderer fallback cannot mask missing ownership.
- Preserve current visual components, Timeline DTOs, Extension/Webview message contracts, completed-history rendering, and message queue semantics.

## Capabilities

### New Capabilities

- `agent-webview-render-lifecycle`: Defines canonical per-conversation render ownership, background ingestion, atomic foreground activation, renderer-resource reconciliation, scrolling/focus isolation, and scoped cleanup behavior.

### Modified Capabilities

None. The change consolidates implementation ownership around existing Agent Timeline and Webview behavior without changing public project formats or Engine contracts.

## Impact

- Primary code: `packages/neko-agent/packages/webview/src/components/ConversationController.tsx`, conversation/tab handlers, Timeline scheduling/presentation, normalized Markdown registry, ChatView scrolling/status projection, and associated tests.
- Extension impact: existing `tabState`, `activeConversation`, and Timeline messages remain unchanged; tests may add stricter ordering and snapshot expectations.
- Shared packages: no new cross-package state framework or `@neko/ui` primitive is required. Webview-local lifecycle types remain in the owning package unless a second Webview demonstrates the same contract.
- Compatibility: no durable user data, project file, Proto, provider, or Engine migration. Internal Webview activation helpers may be removed or made private as a prelaunch cleanup.
- Rollback: the coordinator can be reverted as one Webview-local change while retaining the already-canonical Timeline DTO and existing completed-history source.
- Non-goals: no global Zustand rewrite, no generic cross-extension render framework, no hidden-Webview background DOM rendering, no persistence of incomplete active turns across VS Code restart, and no renderer fallback for missing canonical ownership.
