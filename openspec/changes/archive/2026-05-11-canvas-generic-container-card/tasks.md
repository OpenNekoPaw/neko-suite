## 1. Card Policy Contracts

- [x] 1.1 Add webview-local node-card type contracts for `NodeCardPolicy`, `CardPreviewSource`, `CardBadge`, `CardActionDescriptor`, `NodeCardActionId`, and registry lookup
- [x] 1.2 Add `ActionCondition`, `ActionConditionContext`, and evaluator tests for card and container scopes
- [x] 1.3 Implement fallback, media, shot, text, annotation, and container-friendly node card policies with pure view model outputs
- [x] 1.4 Add policy unit tests for title/subtitle/badge output, preview source construction, fallback behavior, and no runtime side effects

## 2. Generic Node Card Rendering

- [x] 2.1 Implement `NodeCard`, `CardPreviewSlot`, `CardMetadataSlot`, and `CardActionSlot` using existing canvas webview styling conventions
- [x] 2.2 Implement preview resolution fast path for role-matched safe variants before resolver fallback
- [x] 2.3 Route child-node slot rendering through `NodeCard` while preserving current compact child card visual behavior
- [x] 2.4 Remove or narrow old `ChildNodeCard` helper responsibilities after rendering parity is covered

## 3. Card Action Dispatch

- [x] 3.1 Add typed node-card action dispatcher for remove, generate, open-media-preview, open-content-overlay, edit, duplicate, and open-in-editor
- [x] 3.2 Wire dispatcher context to existing canvas, history, clipboard stores and existing postMessage protocols
- [x] 3.3 Preserve duplicate behavior by reusing clipboard duplicate, history checkpoint, canvas data write, and select nodes flow
- [x] 3.4 Add dispatcher tests for each action, including missing asset/path no-op behavior and parent-scoped remove

## 4. Container Action Descriptors

- [x] 4.1 Add `ContainerActionDescriptor`, `ContainerActionId`, `ContainerActionContext`, and typed dispatcher registry
- [x] 4.2 Move Scene, Gallery, and Table container action declarations into preset or webview-local registry descriptors
- [x] 4.3 Replace hardcoded container action button branches with a generic action bar that evaluates visibility and enum conditions
- [x] 4.4 Add tests for assign-selected-children, auto-layout, batch-generate, row/column actions, and existing agent payload compatibility

## 5. Validation

- [x] 5.1 Add rendering tests for heterogeneous Scene child summaries and unknown node fallback cards
- [x] 5.2 Add preview tests for media asset descriptors, shot inline variants, unsafe URL fallback, waveform/text/icon render forms, and non-persistence of runtime URLs
- [x] 5.3 Run the focused neko-canvas webview test/check commands available in the repo and record any unrelated baseline failures
