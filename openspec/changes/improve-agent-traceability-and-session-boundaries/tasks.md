## 1. Trace Contract And Test Harness

- [x] 1.1 Add `AgentTraceContext` and trace helper functions for deriving turn/iteration/phase/request traces without modifying `LogEntry`
- [x] 1.2 Add a captured log transport or mock logger test utility for asserting structured debug payloads
- [x] 1.3 Add baseline tests that reconstruct one agent turn from session, executor, LLM, and tool log entries
- [x] 1.4 Add provider payload isolation tests proving trace-only fields do not reach provider options, projected messages, or model-authored tool arguments

## 2. Execution Trace Propagation

- [x] 2.1 Create the initial trace in `AgentSession.execute()` using `conversationId`, active `runId`, execution mode, and a stable turn identity
- [x] 2.2 Thread trace through `AgentExecutor`, `AgentContext`, think/act deps, hook execution, and iteration state
- [x] 2.3 Add debug logs for session start/end/error, ReAct iteration start/end, think start/end, act start/end, and observe summaries
- [x] 2.4 Add hook entry/exit logging for memory, validation, permission, retry, and custom hooks, including duration and context mutation summaries
- [x] 2.5 Add trace-aware LLM service logging through an explicit service call context rather than `ServiceOptions`
- [x] 2.6 Add trace-aware tool registry logging while keeping tool arguments unchanged and trace scoped to runtime metadata/log payloads
- [x] 2.7 Add trace-aware debug summaries for context compaction, IDC stage activation, approval decisions, feedback cycle capture, and subagent lifecycle

## 3. AgentSession Boundary Extraction

- [x] 3.1 Add characterization tests for `AgentSession.execute()`, journal writes, history projection, tool confirmation, context compression, IDC run close, artifact write/restore, feedback guidance, and dispose behavior
- [x] 3.2 Extract runtime state restore/persist/flush/dispose logic into a `SessionPersistence` collaborator
- [x] 3.3 Extract IDC run start/close/restore and stage transition ownership into an `IdcRunLifecycle` collaborator
- [x] 3.4 Extract artifact write context, restore, sync queue, and task projection bridge into a `SessionArtifactFacade` collaborator
- [x] 3.5 Extract feedback cycle capture, guidance state, and control-plane action application into a `FeedbackRuntimeBridge` collaborator
- [x] 3.6 Extract prompt module sync, system prompt refresh, and prompt cache option updates into a `PromptRuntimeFacade` collaborator
- [x] 3.7 Keep `IAgentSession` source-compatible and convert public session methods to thin delegation where their domain has a collaborator

## 4. Guards, Documentation, And Validation

- [x] 4.1 Add or update architecture guards for Webview/runtime/Extension forbidden imports and new runtime collaborator boundaries
- [x] 4.2 Add a targeted guard or test that reports new `AgentSession` fields owning persistence sinks, timers, feedback state, artifact sync queues, or stage transition buffers directly
- [x] 4.3 Update architecture documentation to describe Agent execution traceability, Logger/EventBus separation, and `AgentSession` facade responsibilities
- [x] 4.4 Run focused Vitest suites for agent executor, hooks, platform service, tool registry, and session collaborators
- [x] 4.5 Run repository quality gates appropriate to the touched scope, including `pnpm check` and package-level tests
