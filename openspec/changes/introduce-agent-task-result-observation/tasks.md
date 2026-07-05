## 1. Contracts and Ownership

- [x] 1.1 Define the host-neutral task result observation, result ref, terminal event, and delivery policy types in the owning Agent/task contract area.
- [x] 1.2 Decide and implement the restart-safe policy storage location: shared task lifecycle metadata or an Agent-owned persisted task binding.
- [x] 1.3 Extend the runner pending-message source contract when follow-up messages need to distinguish `task-result-observation` from composer input.
- [x] 1.4 Add or update boundary documentation/tests if any observation recorder moves from `runtime/` root to `session/`.

## 2. Observation Recording

- [x] 2.1 Implement terminal task normalization for task-manager, media-task, subagent, and tool-background-task sources.
- [x] 2.2 Validate result refs so observations store only stable artifact, asset, content/resource, or trusted URL handles.
- [x] 2.3 Implement a session-owned task result observation recorder that writes existing Agent observation/evidence journal events.
- [x] 2.4 Add idempotence using deterministic ids or a persisted delivery ledger for observation, evidence, and follow-up request records.

## 3. Event Wiring

- [x] 3.1 Wire task-manager terminal progress/completion events into the task result observation coordinator.
- [x] 3.2 Wire `runtime/stream` background task completion into the coordinator without changing active work-item placement.
- [x] 3.3 Wire media/subagent terminal adapters only through narrow ports, keeping VSCode-specific event handling in the Extension package.
- [x] 3.4 Emit visible diagnostics for unknown task ids, missing conversation ownership, malformed terminal payloads, invalid policies, and unsafe refs.

## 4. Follow-Up Scheduling

- [x] 4.1 Implement delivery policy evaluation with default append-observation behavior for owned tasks and no auto-resume without explicit opt-in.
- [x] 4.2 Implement `ask-user-to-continue` through an existing or new narrow continuation command/message.
- [x] 4.3 Implement `auto-resume-agent` by enqueueing through the runner queue when the Agent is running.
- [x] 4.4 Implement idle auto-resume by scheduling a normal Agent turn through the existing turn dispatcher, not by calling executor/session execution recursively.
- [x] 4.5 Add tests proving executor ReAct observe remains scoped to immediate tool results and async terminal results enter later turns only through observations.

## 5. Recovery and Validation

- [x] 5.1 Reconcile terminal owned tasks on startup/conversation restore and record missing observations according to policy.
- [x] 5.2 Prevent duplicate observations and duplicate follow-up turns across duplicate terminal events and restart reconciliation.
- [x] 5.3 Add focused unit tests for normalization, ref validation, journal recording, policy evaluation, follow-up scheduling, idempotence, and recovery.
- [x] 5.4 Add Extension adapter tests for terminal task event wiring and diagnostics.
- [x] 5.5 Add Webview tests only if the implementation introduces a new continuation action/message.
- [x] 5.6 Run `openspec validate introduce-agent-task-result-observation --strict`.
- [x] 5.7 Run focused Agent tests for the touched modules and record any residual full-check blockers separately.
