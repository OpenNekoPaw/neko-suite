## 1. Collaborator Unit Coverage

- [x] 1.1 Add focused unit tests for `SessionPersistence` restore, debounce persist, flush, dispose, and sink cleanup behavior
- [x] 1.2 Add focused unit tests for `IdcRunLifecycle` start, restore, close, stage transition buffering, and missing-store fallback behavior
- [x] 1.3 Add focused unit tests for `SessionArtifactFacade` restore, write context, observed artifact sync queue, IDC task projection queue, and dispose cleanup behavior
- [x] 1.4 Add focused unit tests for `FeedbackRuntimeBridge` feedback cycle capture/skip, guidance snapshot, control-plane guidance application, and trace debug summaries
- [x] 1.5 Add focused unit tests for `PromptRuntimeFacade` prompt sync, system prompt composition, and executor prompt-cache section updates

## 2. Collaborator Boundary Hardening

- [x] 2.1 Introduce focused port interfaces for `IdcRunLifecycle` dependencies and replace high-coupling callback options while preserving behavior
- [x] 2.2 Introduce focused port interfaces for `SessionArtifactFacade` dependencies and replace high-coupling callback options while preserving behavior
- [x] 2.3 Keep collaborator constructors source-local and avoid exposing a broad `SessionRuntimeContext` or direct `AgentSession` state object
- [x] 2.4 Re-run collaborator unit tests and `AgentSession` boundary characterization tests after port migration

## 3. Phase Trace Immutability

- [x] 3.1 Refactor executor/think/act/observe trace derivation so phase-local trace values are passed explicitly instead of mutating shared `AgentContext.trace`
- [x] 3.2 Add or update trace tests proving turn-level trace remains stable while phase logs keep iteration, phase, LLM request id, and tool request id
- [x] 3.3 Preserve provider payload isolation and tool argument isolation while changing trace propagation internals

## 4. Guard And Documentation

- [x] 4.1 Expand architecture guard to report new `AgentSession` fields by high-risk ownership category: timer, sink, queue, guidance state, transition buffer, and prompt module instance
- [x] 4.2 Document legacy `AgentSession` field debt versus newly forbidden field categories in the architecture review
- [x] 4.3 Ensure guard still allows approved runtime collaborator references and host-agnostic collaborator imports

## 5. Validation

- [x] 5.1 Run focused collaborator tests, trace integration tests, tool registry trace tests, platform service trace tests, and architecture boundary guards
- [x] 5.2 Run `pnpm --dir packages/neko-agent run compile:extension`
- [x] 5.3 Run `pnpm check` and record any repository baseline failures unrelated to this change
