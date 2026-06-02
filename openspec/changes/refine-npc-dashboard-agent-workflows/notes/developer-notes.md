## Dashboard-First NPC Workflow Notes

Date: 2026-06-02

### Product Entry

- Dashboard character detail is the primary visible entry for NPC operations.
- `test-npc` starts an isolated `npc-test` conversation through `neko.agent.testNpc`.
- `character-perspective`, `validate-character`, and `improve-character` run as ordinary Agent workflows and do not open roleplay sessions.
- Dashboard Webview only emits `DashboardCreativeEntityActionRequest` DTOs. It must not import Agent internals, assemble NPC prompts, read project files, or mutate entity facts.

### Slash Command Posture

- `/as` is removed from the visible Agent Webview slash catalog, autocomplete, and help surfaces.
- Typed `/as @character` may remain as hidden compatibility/debug routing during migration.
- Hidden `/as` compatibility must delegate to `NpcTestBenchController` / `neko.agent.testNpc`; it must not become an ordinary Agent turn or role prompt overlay.
- Once Dashboard action smoke coverage is stable across extension integration, `/as` parser compatibility can be removed or gated behind an explicit developer flag.

### Runtime Separation

- Roleplay testing remains `ConversationKind: 'npc-test'` with `toolPolicy: { kind: 'none' }`.
- NPC analysis workflows may use ordinary project-read Agent tools under normal Agent policy.
- Analysis outputs are reports or pending suggestions only. Applying profile, relationship, speech-pattern, motivation, or knowledge-boundary changes must go through explicit entity-source apply actions.

### OpenSpec Apply / Archive Ordering

- `implement-npc-character-test-bench` established the base `npc-character-test-bench` capability: shared NPC contracts, no-tool runtime policy, `NpcTestBenchController`, `/as`, `/exit-role`, `neko.agent.testNpc`, NPC UI, transcript/evaluation persistence, and initial Dashboard `test-npc`.
- `refine-npc-dashboard-agent-workflows` depends on that base behavior and narrows the UX: Dashboard becomes the visible product entry, `/as` becomes hidden compatibility, and three Agent workflow actions are added.
- Archive `implement-npc-character-test-bench` first if both changes are still active. Then archive `refine-npc-dashboard-agent-workflows` so its spec deltas become modifications on top of the implemented NPC test bench baseline.
- If `refine-npc-dashboard-agent-workflows` is archived first for process reasons, reconcile its `npc-character-test-bench` deltas with the still-active base change before archiving the base change to avoid reintroducing visible `/as` as the primary entry.
