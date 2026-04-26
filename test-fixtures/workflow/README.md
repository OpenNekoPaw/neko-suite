# Workflow Orchestration — Test Fixtures

Sample inputs that exercise the five canonical E2E scenarios from the current
agent workflow architecture.

| Fixture | Scenario | Expected Route |
|---------|----------|----------------|
| (inline) short prompt | E2E-1 prompt → L0 | L0 / flowB, confidence > 0.9 |
| `sample.fountain` | E2E-2 fountain → L2 | L2 / flowE, skipStages=[readDocument] |
| `novel.txt` (3200+ chars) | E2E-3 novel → L3 | L3 / flowA (full pipeline) |
| (harness-seeded bindings) | E2E-4 continuity | L5 reuse of alice_casual in scene_A |
| (inline) `forceLevel` | E2E-5 user-override | any → user-forced level |

The actual assertions live in
[`packages/neko-agent/packages/extension/src/workflow/__tests__/orchestrator-integration.test.ts`](../../packages/neko-agent/packages/extension/src/workflow/__tests__/orchestrator-integration.test.ts).
Tests inline the text inputs so they are self-contained; the fixture files in
this directory mirror what a real user drag-and-drop would produce, and are
available for manual smoke testing or for future extension-level E2E tests.
