## 1. Shared Contract Foundation

- [x] 1.1 Add `packages/neko-types/src/types/dashboard-task.ts` with `DashboardTask`, `DashboardTaskRef`, `DashboardTaskOutputRef`, `DashboardTaskEvent`, `DashboardTaskSource`, capabilities, actions, status, and `DashboardDisposableLike`.
- [x] 1.2 Export dashboard task contracts from `packages/neko-types/src/types/index.ts` and the main `@neko/shared` entrypoint.
- [x] 1.3 Implement shared validation helpers for task sources, task DTOs, progress range, disposable shape, and non-absolute local output refs.
- [x] 1.4 Add unit tests for valid and invalid dashboard task contracts, including missing `contractVersion`, invalid `source`, invalid progress, absolute local refs, and invalid listener disposables.

## 2. Dashboard Package Scaffold

- [x] 2.1 Create `packages/neko-dashboard` package structure with extension and webview subpackages following existing monorepo package conventions.
- [x] 2.2 Add VSCode extension manifest contributions for `neko.dashboard.show` and `neko.dashboard.showOnStartup` with startup default `false`.
- [x] 2.3 Implement `DashboardProvider` as a WebviewPanel owner with CSP-safe asset loading through `webview.asWebviewUri()`.
- [x] 2.4 Add a typed Webview messaging wrapper for `ready`, `refresh`, `openProject`, `createProject`, `revealInExplorer`, `cancelTask`, `retryTask`, and `revealTaskOutput`.

## 3. Project Overview P0

- [x] 3.1 Implement `ProjectScanner` to discover supported `.nkv`, `.nkc`, `.nks`, `.nka`, `.nkm`, and `.nkp` files across workspace folders.
- [x] 3.2 Exclude `node_modules`, `.git`, and `.neko/.cache` from project scanning and return workspace-relative paths only.
- [x] 3.3 Implement `NavigationDispatcher` to validate webview paths and open or reveal workspace files through VSCode APIs.
- [x] 3.4 Implement P0 RecentActivity by selecting the five most-recently-modified supported project files and tolerating missing/deleted files.
- [x] 3.5 Implement Dashboard Webview root state with Work Mode and Welcome Mode using `useReducer` or local state, without Zustand.
- [x] 3.6 Implement `ProjectTable` sorting by name/type/mtime/size plus text search and type filtering.
- [x] 3.7 Implement sparse P0 Welcome Mode with Quick Start actions and Provider Status only.
- [x] 3.8 Add tests for scanner exclusions, multi-root relative paths, table sorting/filtering/search, recent activity selection, startup mode selection, and unsafe navigation rejection.

## 4. Task Monitoring P1

- [x] 4.1 Implement `TaskAggregator` with pull-first discovery for `neko.cut.getDashboardTaskSource`, `neko.canvas.getDashboardTaskSource`, `neko.agent.getDashboardTaskSource`, and `neko.engine.getDashboardTaskSource`.
- [x] 4.2 Treat command return values as `unknown`, validate them with shared helpers, and ignore/log missing, throwing, or invalid sources.
- [x] 4.3 Add duplicate source handling that disposes the previous subscription before replacing it with a new valid source.
- [x] 4.4 Implement task event merge state keyed by `${source}:${sourceTaskId}` for `added`, `updated`, and `removed` events.
- [x] 4.5 Implement `TaskTable` with source, kind, status, progress, started time, and available actions.
- [x] 4.6 Resolve webview `taskId` values back to `DashboardTaskRef` before delegating cancel or retry to the owning source.
- [x] 4.7 Implement output reveal through Extension Host path resolution and reject unresolved or unsafe local refs.
- [x] 4.8 Add `.neko/dashboard-activity.json` persistence for terminal tasks with FIFO cap of 50 and corrupt/missing file recovery.
- [x] 4.9 Add the first source-owned adapter for `neko-cut` export progress using the shared contract and programmatic command.
- [x] 4.10 Add source-owned adapter coverage for `neko-agent` `AgentWorkItem` mapping and validate the contract against agent media, tool-background, and subagent work items.
- [x] 4.11 Add tests for missing commands, throwing commands, invalid sources, duplicate sources, task event idempotency, action delegation failures, output ref validation, and activity persistence.

## 5. Runtime Context and Quick Actions

- [x] 5.1 Implement `StatusReader` for silent programmatic status commands such as `neko.engine.getStatus`, `neko.agent.getSessionCount`, and `neko.assets.getSummary`.
- [x] 5.2 Ensure status reads are one-shot on Dashboard open and manual refresh, with no continuous polling for stable environment state.
- [x] 5.3 Implement `ContextStrip` for engine, agent/provider, skills, and asset summary values while tolerating missing commands.
- [x] 5.4 Implement QuickActions that delegate project creation and panel navigation to owning extension or shared commands.
- [x] 5.5 Reserve hidden account/cloud slots for future `neko.auth.getStatus`, sync, and quota integrations without managing auth or sync flows in Dashboard.
- [x] 5.6 Add tests for silent command usage, missing runtime sources, manual refresh behavior, no-polling behavior, and QuickAction delegation.

## 6. Integration and Quality Gates

- [x] 6.1 Add package scripts and workspace wiring so Dashboard builds and checks with the monorepo toolchain.
- [x] 6.2 Run focused TypeScript tests for `@neko/shared` dashboard contracts and `neko-dashboard` extension/webview logic.
- [x] 6.3 Run `pnpm check` or the smallest available equivalent for affected TypeScript packages.
- [ ] 6.4 Manually verify a workspace with no `.nk*` files stays in Welcome Mode and does not auto-open unless configured.
- [ ] 6.5 Manually verify a workspace with mixed `.nk*` files shows relative project paths, sortable metadata, and safe navigation.
- [ ] 6.6 Manually verify a fake or real task source pushes progress without polling and cancel delegates to the source extension.
- [ ] 6.7 Manually verify completed task activity persists across VSCode restart and reveal resolves through the path system.
