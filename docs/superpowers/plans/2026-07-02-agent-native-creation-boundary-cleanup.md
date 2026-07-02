# Agent Native Creation Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the cleanup so Agent creation is owned by the existing Agent runtime/capability system, while IDC, Skill, and Workflow remain declarative guidance only.

**Architecture:** Do not add a replacement creation runtime. Tighten tests, names, and docs so the only executable owners are the existing Agent session/turn loop, validator feedback, approval gates, artifact services, and capability lifecycle. IDC profiles, Skill prompt-chains, and Workflow wording must remain data/guidance/observation surfaces.

**Tech Stack:** TypeScript, Vitest, pnpm 10, Turborepo, OpenSpec, Neko Agent monorepo packages.

---

## File Structure

The cleanup should touch these focused areas only:

- Modify: `packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts`
  - Responsibility: Path-level guardrails that prevent runtime/workflow/IDC concepts from re-entering production code.
- Modify: `packages/neko-agent/packages/agent/src/skill/conversation-skill-runtime.ts`
  - Responsibility: Skill activation and prompt-chain observation. Rename the misleading creation runtime port to an observation port.
- Modify: `packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts`
  - Responsibility: Prove Skill prompt-chain activation records observation metadata only and never requires a creation runtime.
- Modify: `packages/neko-agent/packages/agent/src/session/creation-execution-metadata.ts`
  - Responsibility: Metadata helpers for explicit plan-mode and slash Skill execution. Keep this as guidance metadata, not execution state.
- Modify: `packages/neko-agent/packages/agent/src/session/__tests__/creation-execution-metadata.test.ts`
  - Responsibility: Prove metadata uses prompt-chain guidance naming and does not expose workflow/idc runtime terms.
- Modify: `packages/neko-agent/packages/agent/src/session/creation-turn-planning.ts`
  - Responsibility: Per-turn guidance classification. Remove legacy `metadata.idc` compatibility reads.
- Modify: `packages/neko-agent/packages/agent/src/session/__tests__/creation-turn-planning.test.ts`
  - Responsibility: Prove `agentCreation` metadata is the only creation guidance metadata accepted.
- Modify: `packages/neko-agent/packages/agent/src/runtime/types.ts`
  - Responsibility: Runtime bootstrap ports. Ensure creation guidance is documented as guidance/trace only.
- Modify: `packages/neko-agent/packages/agent/src/task/creation-projected-task.ts`
  - Responsibility: Task projection payloads for creation checklists. Keep legacy trace explicit and remove `source: 'idc'` compatibility acceptance.
- Modify: `packages/neko-agent/packages/agent/src/task/__tests__/creation-projected-task.test.ts`
  - Responsibility: Prove task payload accepts `source: 'creation'` only and rejects old IDC source payloads.
- Modify: `docs/architecture/adr-agent-native-creation-capability-boundary.md`
  - Responsibility: Accepted architectural boundary. Remove wording that calls for a new broad stage/profile/iteration contract.
- Modify: `docs/architecture/agent.md`
  - Responsibility: Agent architecture overview. Replace `creationRuntime` wording with `creationGuidance` / Agent-native capability wording.
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/proposal.md`
  - Responsibility: Superseded OpenSpec change. Mark as frozen and point to the native boundary cleanup.
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/design.md`
  - Responsibility: Superseded design. Mark as frozen and explicitly reject implementation.
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/specs/agent-creation-iteration-contracts/spec.md`
  - Responsibility: Superseded spec. Mark as frozen so it cannot be treated as active requirements.
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/tasks.md`
  - Responsibility: Superseded task list. Keep frozen marker and remove actionable unchecked implementation steps.

Do not modify shared `TaskType: 'workflow'` in `packages/neko-types/src/types/task.ts` in this cleanup. That enum is a shared task-system value, not by itself an Agent workflow runtime.

---

### Task 1: Strengthen Architecture Guardrails First

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts`

- [ ] **Step 1: Add a failing guard for misleading creation runtime port names**

Add this test near the existing Agent-native creation guard tests in `packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts`:

```ts
  it('keeps prompt-chain observation ports from being named as creation runtimes', () => {
    const sourceFiles = [
      ...listFiles(agentSrc),
      ...listFiles(join(packageRoot, 'agent-types/src')),
    ]
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !isTestFile(file))
      .map((file) => ({
        relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
        source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
      }))
      .filter(({ relativePath }) => !relativePath.endsWith('architecture-boundary-guards.test.ts'));

    const forbiddenPatterns = [
      /\bConversationSkillCreationRuntimePort\b/,
      /\bcreationRuntime\??:/,
      /\b_deps\.creationRuntime\b/,
      /\bcreation runtime is configured\b/i,
    ];
    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      forbiddenPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });
```

- [ ] **Step 2: Add a failing guard against legacy IDC metadata reads**

In the same file, add this test after the IDC run control guard:

```ts
  it('keeps legacy idc metadata out of Agent creation guidance parsing', () => {
    const sourceFiles = [
      join(agentSrc, 'session/creation-turn-planning.ts'),
      join(agentSrc, 'session/creation-execution-metadata.ts'),
    ].map((file) => ({
      relativePath: relative(repoRoot, file).replace(/\\/g, '/'),
      source: stripTypeScriptComments(readFileSync(file, 'utf-8')),
    }));

    const violations = sourceFiles.flatMap(({ relativePath, source }) =>
      [/metadata\[['"]idc['"]\]/, /\bagentCreation\s*\?\?\s*metadata\[['"]idc['"]\]/]
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`),
    );

    expect(violations).toEqual([]);
  });
```

- [ ] **Step 3: Add a failing guard against actionable superseded creation-iteration tasks**

In the same file, add this test near other documentation/OpenSpec guard tests. If there is no OpenSpec section yet, place it before the final production-code guard block:

```ts
  it('keeps the superseded creation-iteration change frozen', () => {
    const changeDir = join(repoRoot, 'openspec/changes/introduce-agent-creation-iteration-contracts');
    const files = [
      'proposal.md',
      'design.md',
      'tasks.md',
      'specs/agent-creation-iteration-contracts/spec.md',
    ];

    for (const file of files) {
      const source = readFileSync(join(changeDir, file), 'utf-8');
      expect(source).toContain('Superseded by `normalize-agent-native-creation-boundary`');
    }

    const tasks = readFileSync(join(changeDir, 'tasks.md'), 'utf-8');
    expect(tasks).not.toMatch(/^- \[ \] \d/m);
  });
```

- [ ] **Step 4: Run the guard tests and verify they fail**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: FAIL. The failure should mention existing `ConversationSkillCreationRuntimePort`, `creationRuntime`, `metadata['idc']`, and/or unchecked superseded tasks.

- [ ] **Step 5: Commit the failing guard tests**

```bash
git add packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts
git commit -m "test(agent): guard native creation boundary cleanup"
```

---

### Task 2: Rename Skill Prompt-Chain Observation Port

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/skill/conversation-skill-runtime.ts`
- Modify: `packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts`

- [ ] **Step 1: Rename the port interface and dependency field**

In `packages/neko-agent/packages/agent/src/skill/conversation-skill-runtime.ts`, replace:

```ts
export interface ConversationSkillCreationRuntimePort {
  recordPromptChainObservation(input: AgentPromptChainObservation): AgentPromptChainObservation;
}
```

with:

```ts
export interface ConversationSkillPromptChainObservationPort {
  recordPromptChainObservation(input: AgentPromptChainObservation): AgentPromptChainObservation;
}
```

Then replace this dependency field:

```ts
  readonly creationRuntime?: ConversationSkillCreationRuntimePort;
```

with:

```ts
  readonly promptChainObservationPort?: ConversationSkillPromptChainObservationPort;
```

- [ ] **Step 2: Update the missing-port diagnostic**

In `_applySkill`, replace:

```ts
    if (creation && !this._deps.creationRuntime) {
      return {
        applied: false,
        error:
          'Agent-native creation metadata was supplied, but no creation runtime is configured.',
      };
    }
```

with:

```ts
    if (creation && !this._deps.promptChainObservationPort) {
      return {
        applied: false,
        error:
          'Agent-native creation metadata was supplied, but no prompt-chain observation port is configured.',
      };
    }
```

- [ ] **Step 3: Update the observation call site**

In `_recordPromptChainObservation`, replace:

```ts
    this._deps.creationRuntime?.recordPromptChainObservation(
```

with:

```ts
    this._deps.promptChainObservationPort?.recordPromptChainObservation(
```

- [ ] **Step 4: Update tests to use the new dependency name**

In `packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts`, replace the first runtime setup:

```ts
    const creationObservationPort = {
      recordPromptChainObservation: vi.fn((observation: AgentPromptChainObservation) => {
        observations.push(observation);
        return observation;
      }),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      creationRuntime: creationObservationPort,
      now: () => 301,
    });
```

with:

```ts
    const promptChainObservationPort = {
      recordPromptChainObservation: vi.fn((observation: AgentPromptChainObservation) => {
        observations.push(observation);
        return observation;
      }),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      promptChainObservationPort,
      now: () => 301,
    });
```

Then replace:

```ts
    expect(creationObservationPort.recordPromptChainObservation).toHaveBeenCalledTimes(1);
```

with:

```ts
    expect(promptChainObservationPort.recordPromptChainObservation).toHaveBeenCalledTimes(1);
```

In the “does not create prompt-chain observation” test, replace:

```ts
    const creationObservationPort = {
      recordPromptChainObservation: vi.fn((observation: AgentPromptChainObservation) => observation),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      creationRuntime: creationObservationPort,
    });
```

with:

```ts
    const promptChainObservationPort = {
      recordPromptChainObservation: vi.fn((observation: AgentPromptChainObservation) => observation),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      promptChainObservationPort,
    });
```

Then replace:

```ts
    expect(creationObservationPort.recordPromptChainObservation).not.toHaveBeenCalled();
```

with:

```ts
    expect(promptChainObservationPort.recordPromptChainObservation).not.toHaveBeenCalled();
```

- [ ] **Step 5: Add a test for the fail-visible missing observation port**

Add this test after the existing prompt-chain observation test in `packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts`:

```ts
  it('fails visibly when prompt-chain metadata is supplied without an observation port', async () => {
    const skill = createSkill('comic-to-storyboard');
    const skillService = createSkillService([skill]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as any,
      now: () => 301,
    });

    const result = await runtime.applySkillInvocation({
      skillName: 'comic-to-storyboard',
      conversationId: 'conv-1',
      reason: 'Generate storyboard table',
      creation: {
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        promptChainId: 'storyboard.creation',
      },
    });

    expect(result).toEqual({
      applied: false,
      error:
        'Agent-native creation metadata was supplied, but no prompt-chain observation port is configured.',
    });
  });
```

- [ ] **Step 6: Run focused Skill runtime tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run architecture guard tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: still FAIL only on remaining legacy IDC metadata or superseded task guards, not on `creationRuntime` naming.

- [ ] **Step 8: Commit the port rename**

```bash
git add packages/neko-agent/packages/agent/src/skill/conversation-skill-runtime.ts packages/neko-agent/packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts
git commit -m "refactor(agent): name skill prompt-chain observation port"
```

---

### Task 3: Remove Legacy `metadata.idc` Compatibility Reads

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/session/creation-turn-planning.ts`
- Modify: `packages/neko-agent/packages/agent/src/session/__tests__/creation-turn-planning.test.ts`

- [ ] **Step 1: Remove the legacy metadata fallback**

In `packages/neko-agent/packages/agent/src/session/creation-turn-planning.ts`, replace:

```ts
  const raw = metadata['agentCreation'] ?? metadata['idc'];
```

with:

```ts
  const raw = metadata['agentCreation'];
```

- [ ] **Step 2: Replace the compatibility test with a rejection test**

In `packages/neko-agent/packages/agent/src/session/__tests__/creation-turn-planning.test.ts`, replace the full test named:

```ts
  it('reads legacy idc metadata only for compatibility', () => {
```

through its closing `});` with:

```ts
  it('ignores legacy idc metadata because Agent creation guidance uses agentCreation only', () => {
    const context = planningContext({
      metadata: {
        idc: {
          entrySignal: 'prompt-chain-skill',
          taskShape: 'multi-step',
          creationKind: 'legacy-creation-kind',
        },
      },
    });

    const taskShape = classifyCreationTaskShape(signals(), context);
    const entrySignal = classifyCreationEntrySignal({ ...signals(), taskShape }, context);

    expect(taskShape).toBe('single-write');
    expect(entrySignal).toBe('vague-creative');
    expect(resolveCreationKind(context)).toBe('agent-turn');
  });
```

- [ ] **Step 3: Run turn planning tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/session/__tests__/creation-turn-planning.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run architecture guard tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: still FAIL only on the superseded OpenSpec task guard if Task 4 has not been done yet.

- [ ] **Step 5: Commit metadata cleanup**

```bash
git add packages/neko-agent/packages/agent/src/session/creation-turn-planning.ts packages/neko-agent/packages/agent/src/session/__tests__/creation-turn-planning.test.ts
git commit -m "refactor(agent): drop legacy idc creation metadata fallback"
```

---

### Task 4: Freeze Superseded Creation-Iteration OpenSpec Change

**Files:**
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/proposal.md`
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/design.md`
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/specs/agent-creation-iteration-contracts/spec.md`
- Modify: `openspec/changes/introduce-agent-creation-iteration-contracts/tasks.md`

- [ ] **Step 1: Replace the proposal body with a frozen notice**

Replace the full contents of `openspec/changes/introduce-agent-creation-iteration-contracts/proposal.md` with:

```md
# Superseded: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> This change is intentionally frozen. Do not resume it directly.

## Why This Is Frozen

This proposal attempted to introduce broad `AgentCreation`, `CreationIteration`, and `CreationEvent` contracts. That direction is now rejected because it risks recreating a parallel Agent creation runtime under new names.

The accepted boundary is:

- Agent existing session/turn/capability runtime owns lifecycle, stage, feedback, validation, approval, state, artifact provenance, and capability invocation.
- IDC is only a creation profile.
- Skill provides prompt-chain guidance, output standards, tool boundaries, and validator hints.
- Workflow only means prompt-chain guidance, not a runtime, DAG, scheduler, node executor, or state machine.

## Replacement

Use `openspec/changes/normalize-agent-native-creation-boundary/` for any further cleanup work.
```

- [ ] **Step 2: Replace the design body with a frozen notice**

Replace the full contents of `openspec/changes/introduce-agent-creation-iteration-contracts/design.md` with:

```md
# Superseded Design: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> This design is intentionally frozen. Do not implement it.

## Rejected Direction

The previous design introduced broad creation/iteration/event DTOs as a new canonical creative process model. That direction is rejected for this prelaunch cleanup because it creates another boundary that can own lifecycle, stage, iteration, validation, approval, and state.

## Accepted Direction

Agent-native creation is not a new class, store, session DTO, scheduler, or package. It means the existing Agent session/turn loop, validator feedback, approval gates, artifact services, and capability lifecycle own creative lifecycle decisions.

Only narrow contracts are acceptable unless a concrete boundary needs more:

- `AgentLegacyCreationTrace` for quarantined legacy ids.
- `AgentPromptChainObservation` for recording Skill guidance adoption, skip, reorder, checkpoint, and completion.
- Typed validator diagnostics returned to the Agent after output is produced.
- Typed capability lifecycle results for side-effecting domain operations.

## Replacement

Use `openspec/changes/normalize-agent-native-creation-boundary/design.md` as the active design source.
```

- [ ] **Step 3: Replace the spec body with a frozen notice**

Replace the full contents of `openspec/changes/introduce-agent-creation-iteration-contracts/specs/agent-creation-iteration-contracts/spec.md` with:

```md
# Superseded Spec: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> This spec is intentionally frozen. Do not implement these requirements.

## Removed Requirements

The broad `AgentCreation`, `CreationIteration`, and `CreationEvent` requirements are withdrawn. They are replaced by the Agent-native creation boundary requirements in:

`openspec/changes/normalize-agent-native-creation-boundary/specs/agent-native-creation-boundary/spec.md`
```

- [ ] **Step 4: Replace the task list with a frozen notice without unchecked tasks**

Replace the full contents of `openspec/changes/introduce-agent-creation-iteration-contracts/tasks.md` with:

```md
# Superseded Tasks: Agent Creation Iteration Contracts

> Superseded by `normalize-agent-native-creation-boundary` (2026-07-02).
> These tasks are intentionally frozen. Do not resume them directly.

No implementation tasks remain in this change. Any future work must be added under `normalize-agent-native-creation-boundary` or a new proposal aligned with the accepted Agent-native boundary.
```

- [ ] **Step 5: Run the architecture guard tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: PASS if Tasks 2 and 3 are complete.

- [ ] **Step 6: Commit the frozen OpenSpec change**

```bash
git add openspec/changes/introduce-agent-creation-iteration-contracts/proposal.md openspec/changes/introduce-agent-creation-iteration-contracts/design.md openspec/changes/introduce-agent-creation-iteration-contracts/specs/agent-creation-iteration-contracts/spec.md openspec/changes/introduce-agent-creation-iteration-contracts/tasks.md
git commit -m "docs(openspec): freeze superseded creation iteration change"
```

---

### Task 5: Tighten Task Projection Legacy Boundaries

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/task/creation-projected-task.ts`
- Modify: `packages/neko-agent/packages/agent/src/task/__tests__/creation-projected-task.test.ts`
- Modify: `packages/neko-agent/packages/agent/src/task/__tests__/creation-task-projection.test.ts`

- [ ] **Step 1: Reject legacy `source: 'idc'` payloads**

In `packages/neko-agent/packages/agent/src/task/creation-projected-task.ts`, replace this condition inside `isCreationProjectedTaskPayload`:

```ts
    (candidate['source'] === 'creation' || candidate['source'] === 'idc') &&
```

with:

```ts
    candidate['source'] === 'creation' &&
```

- [ ] **Step 2: Add an explicit rejection assertion**

In `packages/neko-agent/packages/agent/src/task/__tests__/creation-projected-task.test.ts`, inside the `guards staged-creation projected task payload shape` test, add this assertion after the existing invalid payload assertions:

```ts
    expect(isCreationProjectedTaskPayload({ ...validPayload, source: 'idc' })).toBe(false);
```

- [ ] **Step 3: Rename test descriptions away from staged-creation runtime language**

In `packages/neko-agent/packages/agent/src/task/__tests__/creation-projected-task.test.ts`, replace:

```ts
  it('serializes explicit staged-creation projected task bindings into shared task payloads', () => {
```

with:

```ts
  it('serializes Agent creation projected task bindings into shared task payloads', () => {
```

Replace:

```ts
  it('guards staged-creation projected task payload shape', () => {
```

with:

```ts
  it('guards Agent creation projected task payload shape', () => {
```

Replace:

```ts
  it('extracts run id only from staged-creation projected tasks with the explicit payload contract', () => {
```

with:

```ts
  it('extracts legacy trace run id only from Agent creation projected task payloads', () => {
```

In `packages/neko-agent/packages/agent/src/task/__tests__/creation-task-projection.test.ts`, replace:

```ts
  it('projects staged creation task items into staged-creation projected tasks', async () => {
```

with:

```ts
  it('projects Agent creation task items into creation projected tasks', async () => {
```

Replace:

```ts
  it('clears persisted staged-creation projected tasks by run even without in-memory projection state', async () => {
```

with:

```ts
  it('clears persisted creation projected tasks by legacy trace run even without in-memory projection state', async () => {
```

- [ ] **Step 4: Run task projection tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/task/__tests__/creation-projected-task.test.ts packages/agent/src/task/__tests__/creation-task-projection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run architecture guard tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit task projection cleanup**

```bash
git add packages/neko-agent/packages/agent/src/task/creation-projected-task.ts packages/neko-agent/packages/agent/src/task/__tests__/creation-projected-task.test.ts packages/neko-agent/packages/agent/src/task/__tests__/creation-task-projection.test.ts
git commit -m "refactor(agent): tighten creation task projection payloads"
```

---

### Task 6: Clarify Runtime Bootstrap Naming In Docs And Comments

**Files:**
- Modify: `packages/neko-agent/packages/agent/src/runtime/types.ts`
- Modify: `docs/architecture/adr-agent-native-creation-capability-boundary.md`
- Modify: `docs/architecture/agent.md`

- [ ] **Step 1: Tighten `ICreationGuidanceRuntime` comments**

In `packages/neko-agent/packages/agent/src/runtime/types.ts`, replace the comment above `ICreationGuidanceRuntime`:

```ts
/**
 * Agent creation guidance/bootstrap contract.
 *
 * New Agent creation state is owned by Agent-native creation contracts. This
 * port carries prompt-chain/stage guidance adapters and legacy trace plumbing;
 * it does not execute workflow nodes or own lifecycle state.
 */
```

with:

```ts
/**
 * Agent creation guidance/bootstrap contract.
 *
 * This is not a creation runtime. Existing Agent session/turn/capability
 * machinery owns lifecycle, validation feedback, approval, state, artifact
 * provenance, and side-effect decisions. This port only carries declarative
 * stage/prompt-chain guidance adapters plus quarantined legacy trace plumbing.
 */
```

- [ ] **Step 2: Remove broad new-contract wording from the accepted ADR**

In `docs/architecture/adr-agent-native-creation-capability-boundary.md`, replace this bullet under `代价`:

```md
- 需要补充 Agent native stage/profile/iteration contract，避免在删除 workflow runtime 后状态投影失真。
```

with:

```md
- 需要补充小而具体的投影和 observation contract，避免在删除 workflow runtime 后用新的大 DTO 或状态机替代旧 runtime。
```

Then replace this line under `后续`:

```md
- 引入 Agent native stage/profile/iteration contract。
```

with:

```md
- 仅在具体边界需要时引入小型 Agent-native projection、validator feedback 或 prompt-chain observation contract。
```

- [ ] **Step 3: Rename `creationRuntime` wording in `agent.md` architecture diagram/table**

In `docs/architecture/agent.md`, replace the architecture diagram/table entry text:

```md
      creationRuntime
```

with:

```md
      creationGuidance
```

Replace:

```md
| `creationRuntime`   | Agent-native creation profile、stage、iteration、validation feedback、review projection | 不执行领域副作用，不创建 workflow run/node/transition             |
```

with:

```md
| `creationGuidance`  | Agent-native creation profile guidance、stage projection、validator feedback、review projection | 不拥有 lifecycle/state，不执行领域副作用，不创建 workflow run/node/transition |
```

Replace:

```md
新代码应使用 Agent-native creation/profile/stage/iteration contract，并用 prompt-chain observation 记录 Skill 方法指导的采纳、跳过、重排和完成。
```

with:

```md
新代码应使用 Agent 现有 session/turn/capability 边界承接创作状态，只在具体投影需要时增加小型 contract，并用 prompt-chain observation 记录 Skill 方法指导的采纳、跳过、重排和完成。
```

- [ ] **Step 4: Run documentation scans**

Run:

```bash
rg -n "creationRuntime|补充 Agent native stage/profile/iteration contract|使用 Agent-native creation/profile/stage/iteration contract" docs/architecture packages/neko-agent/packages/agent/src -g '!**/dist/**'
```

Expected: no matches outside old changelog/proposal text. If matches remain in accepted docs or production comments, update them to `creationGuidance`, `promptChainObservationPort`, or “small projection contract” wording.

- [ ] **Step 5: Run architecture guard tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit doc/comment cleanup**

```bash
git add packages/neko-agent/packages/agent/src/runtime/types.ts docs/architecture/adr-agent-native-creation-capability-boundary.md docs/architecture/agent.md
git commit -m "docs(agent): clarify creation guidance boundary"
```

---

### Task 7: Final Verification And Legacy Debt Scan

**Files:**
- No source edits expected unless verification finds a regression.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
pnpm --dir packages/neko-agent exec vitest --run \
  packages/agent/src/__tests__/architecture-boundary-guards.test.ts \
  packages/agent/src/skill/__tests__/conversation-skill-runtime.test.ts \
  packages/agent/src/session/__tests__/creation-execution-metadata.test.ts \
  packages/agent/src/session/__tests__/creation-turn-planning.test.ts \
  packages/agent/src/task/__tests__/creation-projected-task.test.ts \
  packages/agent/src/task/__tests__/creation-task-projection.test.ts
```

Expected: PASS.

- [ ] **Step 2: Compile `neko-agent`**

Run:

```bash
pnpm --dir packages/neko-agent run compile
```

Expected: PASS.

- [ ] **Step 3: Run legacy debt scan for forbidden runtime concepts**

Run:

```bash
rg -n "AgentNativeCreationRuntime|createAgentNativeCreationRuntime|AgentWorkflowRuntime|createAgentWorkflowRuntime|WorkflowRuntime|WorkflowRun|WorkflowNode|WorkflowTransition|IdcRun|idc-runtime|startIdcRun|showIdcWorkflowControls|creationRuntime|metadata\[['\"]idc['\"]" \
  packages/neko-agent docs/architecture openspec/changes \
  -g '!**/dist/**' \
  -g '!**/node_modules/**'
```

Expected: matches are limited to:

- architecture guard tests that forbid these names,
- accepted ADR sections that describe forbidden legacy terms,
- frozen/superseded OpenSpec notices,
- explicit `AgentLegacyCreationTrace` fields or tests,
- historical docs that are clearly marked superseded.

No production code should contain `creationRuntime`, `metadata['idc']`, `AgentWorkflowRuntime`, or IDC run control APIs.

- [ ] **Step 4: Run package quality command if available**

Run:

```bash
pnpm check:legacy-debt
```

Expected: PASS. If the script does not exist in this checkout, record the shell error in the implementation notes and rely on the focused `rg` scan plus architecture guard tests.

- [ ] **Step 5: Commit verification-only adjustments if any**

If Step 1-4 exposed small naming or doc scan misses, fix them and commit:

```bash
git add <changed-files>
git commit -m "chore(agent): finish native creation boundary cleanup"
```

If no files changed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Agent owns lifecycle/stage/iteration/feedback/validation/approval/state/artifact/capability decisions: covered by Tasks 1, 2, 6, 7.
- IDC is a profile only: covered by Tasks 1, 3, 4, 6.
- Skill declares prompt-chain/output/tool/validator guidance only: covered by Task 2 and Task 6.
- Workflow is prompt-chain/guidance chain only, no execution engine/DAG/runtime/node scheduling: covered by Tasks 1, 4, 6, 7.
- Residual legacy cleanup: covered by Tasks 3, 4, 5, 7.

Placeholder scan:

- No `TBD`, `TODO`, “implement later”, or unspecified “write tests” steps remain.
- Every code edit step includes exact replacement content.
- Every verification step includes exact command and expected result.

Type consistency:

- `ConversationSkillPromptChainObservationPort` is consistently used as the replacement for `ConversationSkillCreationRuntimePort`.
- `promptChainObservationPort` is consistently used as the replacement dependency field for `creationRuntime`.
- `agentCreation` remains the metadata key; `idc` is rejected as legacy input.
- `CreationProjectedTaskPayload.source` remains `'creation'`; legacy trace remains under `legacyTrace`.
