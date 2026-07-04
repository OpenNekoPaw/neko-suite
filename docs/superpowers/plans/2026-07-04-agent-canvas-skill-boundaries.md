# Agent Canvas Skill Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Canvas Markdown ingest, CreativeTable validation, storyboard profile actions, resource binding, and Send to Canvas lifecycle execution to their owning layers while keeping Agent as the generic capability lifecycle/router.

**Architecture:** `@neko/shared` keeps only cross-package capability DTOs. `neko-canvas` owns Markdown ingest, CreativeTable profiles, deterministic validation, resource binding, and Canvas action descriptors. `neko-agent` owns intent routing, lifecycle approval, provider discovery, and Webview handoff presentation, without hardcoded storyboard field protocols.

**Tech Stack:** TypeScript, Vitest, VSCode Extension API, React Webview presenter tests, existing `AgentCapabilityProvider` and Canvas Markdown capability contracts.

---

## Scope

This plan implements the boundary cleanup for Canvas/Agent/CreativeTable behavior. A full migration of all built-in skill content into a new package is isolated in Task 6 because it is mechanically larger and should not block the runtime boundary fix.

## Architecture Checks

1. 是否符合现有架构：Yes. It uses existing `AgentCapabilityProvider.getArtifactFacets().lifecycleCapabilities`, `CanvasMarkdownCapabilityInput/Result`, and Canvas-owned `markdown.invoke`.
2. 如何进一步降低耦合：Remove Agent-owned Canvas lifecycle descriptors, Webview storyboard header gating, and Agent storyboard deterministic validator.
3. 是否易于扩展与测试：Yes. New profiles/actions are added by Canvas provider metadata and Canvas profile registry; Agent tests assert provider-discovered descriptors and old-path absence.

## Five-Layer Analysis

| Layer            | Decision                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibilities | Canvas owns Canvas semantics; Agent owns generic lifecycle; Webview owns projection only; Skills own prompt guidance only.                                         |
| Dependencies     | Agent may depend on `@neko/shared` DTOs and provider metadata, not Canvas internals. Canvas depends on shared DTOs, not Agent Webview or Agent validators.         |
| Interfaces       | Cross-package interface remains `CanvasMarkdownCapabilityInput`, `CanvasMarkdownCapabilityResult`, `AgentCapabilityLifecycleDescriptor`, and stable resource refs. |
| Extension        | Dynamic table/profile expansion happens through Canvas profile descriptors and provider lifecycle descriptors, not Agent fixed field arrays.                       |
| Tests            | Path-level tests prove provider-discovered lifecycle, dynamic Webview handoff, Canvas-owned validation, and removal of Agent storyboard fixed validator.           |

## File Structure

- Modify `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts`
  - Export or localize one Canvas-owned builder for Markdown lifecycle descriptors.
  - Keep action capability mapping in Canvas provider metadata.
- Modify `packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts`
  - Assert Canvas provider advertises Markdown lifecycle capabilities through `getArtifactFacets`.
- Modify `packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts`
  - Add a thin lifecycle descriptor lookup over registered providers.
- Modify `packages/neko-agent/packages/extension/src/services/__tests__/capabilityDiscoveryService.test.ts`
  - Assert descriptor lookup returns provider-owned descriptors and updates after unregister.
- Modify `packages/neko-agent/packages/extension/src/chat/router/types.ts`
  - Add `resolveLifecycleCapabilityDescriptor` dependency.
- Modify `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`
  - Inject descriptor lookup from `getCapabilityDiscoveryService()`.
- Modify `packages/neko-agent/packages/extension/src/chat/router/fileAndPluginRoutes.ts`
  - Remove hardcoded `CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS`.
  - Route Canvas Markdown lifecycle using injected provider descriptor.
- Modify `packages/neko-agent/packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts`
  - Assert lifecycle fails visibly when provider descriptor is absent.
  - Assert approved apply succeeds through injected descriptor.
- Modify `packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts`
  - Remove import of storyboard fixed headers.
  - Detect table handoff generically and preserve caller-declared hints.
- Modify `packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts`
  - Update tests so weak/dynamic/localized tables can be handed to Agent.
- Modify `packages/neko-agent/packages/agent/src/validation/output-validator.ts`
  - Remove storyboard CreativeTable artifact validator registry from Agent output validation.
- Delete `packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts`
- Delete `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`
- Modify `packages/neko-agent/packages/agent-types/src/creative-table-contract.ts`
  - Delete the file if no imports remain after Webview and validator cleanup.
- Modify `packages/neko-agent/packages/agent-types/src/index.ts`
  - Remove exports from `creative-table-contract.ts`.
- Modify built-in skill metadata under `packages/neko-agent/packages/agent/src/skill/builtins/`
  - Replace `creative-table.storyboard` validation requirements with Canvas lifecycle validation guidance.
- Optional create `packages/neko-skills/`
  - Move cross-domain extension skills out of `@neko/agent`; host layers inject them into the agent skill runtime.
  - Domain packages such as `neko-canvas` should expose domain-owned skills/capabilities from their own package boundaries.

---

### Task 1: Make Canvas Provider The Lifecycle Descriptor Source

**Files:**

- Modify: `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts`
- Test: `packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts`

- [ ] **Step 1: Write the failing Canvas provider test**

Add this test near the existing Canvas Markdown capability tests:

```ts
it('advertises Canvas Markdown lifecycle descriptors from the Canvas provider', () => {
  const provider = createNekoCanvasCapabilityProvider(createApi());
  const facets = provider.getArtifactFacets({
    extensionContext: {},
    mediaService: undefined,
    configManager: undefined,
    embedFn: undefined,
  });

  expect(facets.lifecycleCapabilities?.map((descriptor) => descriptor.capabilityId)).toEqual([
    'canvas.ingestMarkdown',
    'canvas.createMarkdownNote',
    'canvas.createTableFromMarkdown',
    'canvas.createStoryboardDraftFromMarkdown',
    'canvas.createStoryboardFromMarkdown',
    'canvas.attachResource',
    'canvas.validateMarkdownStoryboard',
  ]);
  expect(
    facets.lifecycleCapabilities?.find(
      (descriptor) => descriptor.capabilityId === 'canvas.createStoryboardFromMarkdown',
    ),
  ).toEqual(
    expect.objectContaining({
      providerId: 'neko-canvas',
      phases: ['validate', 'review', 'apply'],
      requiresApproval: true,
      safetyKind: 'confirmation-gated',
    }),
  );
  expect(
    facets.lifecycleCapabilities?.find(
      (descriptor) => descriptor.capabilityId === 'canvas.validateMarkdownStoryboard',
    ),
  ).toEqual(
    expect.objectContaining({
      providerId: 'neko-canvas',
      phases: ['validate'],
      requiresApproval: false,
      safetyKind: 'read-only-query',
    }),
  );
});
```

- [ ] **Step 2: Run the focused test and confirm it fails if metadata is missing**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts
```

Expected before implementation: failure if Canvas provider lifecycle metadata does not contain every Markdown capability descriptor.

- [ ] **Step 3: Extract Canvas Markdown lifecycle descriptor construction**

In `packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts`, add this helper below `CANVAS_MARKDOWN_TOOL_DEFINITIONS`:

```ts
function createCanvasMarkdownLifecycleDescriptor(
  definition: CanvasMarkdownToolDefinition,
): AgentCapabilityLifecycleDescriptor {
  return {
    capabilityId: definition.capabilityId,
    providerId: 'neko-canvas',
    displayName: definition.displayName,
    description: definition.description,
    phases:
      definition.capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? ['validate', 'review', 'apply']
        : definition.capabilityId === 'canvas.validateMarkdownStoryboard'
          ? ['validate']
          : [definition.phase],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts:
      definition.capabilityId === 'canvas.attachResource'
        ? ['ResourceRef', 'DocumentArchiveResourceRef']
        : ['Markdown', 'GfmTable'],
    produces:
      definition.capabilityId === 'canvas.validateMarkdownStoryboard'
        ? ['CanvasMarkdownCapabilityDiagnostics']
        : ['canvas-node-ref'],
    risk: definition.isReadOnly ? 'low' : 'medium',
    requiresApproval: definition.requiresConfirmation,
    safetyKind: definition.requiresConfirmation ? 'confirmation-gated' : 'read-only-query',
    targetRequirements: definition.requiresConfirmation
      ? { allowedFallbacks: ['viewport-insertion', 'explicit-user-input'] }
      : undefined,
  };
}

const CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS: readonly AgentCapabilityLifecycleDescriptor[] =
  CANVAS_MARKDOWN_TOOL_DEFINITIONS.map(createCanvasMarkdownLifecycleDescriptor);
```

Then replace the inline `lifecycleCapabilities: CANVAS_MARKDOWN_TOOL_DEFINITIONS.map(...)` in `getArtifactFacets` with:

```ts
lifecycleCapabilities: CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS,
```

- [ ] **Step 4: Re-run the Canvas provider test**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/neko-canvas/packages/extension/src/agentCapabilityProvider.ts packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts
git commit -m "refactor(canvas): advertise markdown lifecycle descriptors"
```

---

### Task 2: Add Provider-Discovered Lifecycle Lookup To Agent Extension

**Files:**

- Modify: `packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts`
- Test: `packages/neko-agent/packages/extension/src/services/__tests__/capabilityDiscoveryService.test.ts`

- [ ] **Step 1: Write the failing discovery service test**

Add this test inside `describe('CapabilityDiscoveryService', () => { ... })`:

```ts
it('resolves lifecycle descriptors from registered provider artifact facets', () => {
  const provider = createProvider({
    id: 'neko-canvas',
    tools: [createTool({ name: 'CanvasIngestMarkdown', category: 'canvas' })],
    providerCards: [],
  });
  provider.getArtifactFacets = () => ({
    lifecycleCapabilities: [
      {
        capabilityId: 'canvas.ingestMarkdown',
        providerId: 'neko-canvas',
        displayName: 'Ingest Markdown to Canvas',
        description: 'Ingest reviewed Markdown into Canvas.',
        phases: ['review'],
        inputSchema: { id: 'canvas.markdown.input', version: 1 },
        resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
        accepts: ['Markdown', 'GfmTable'],
        produces: ['canvas-node-ref'],
        risk: 'medium',
        requiresApproval: true,
        safetyKind: 'confirmation-gated',
      },
    ],
  });

  service.registerProvider(provider, { extensionContext: {} });

  expect(service.getLifecycleCapabilityDescriptor('canvas.ingestMarkdown')).toEqual(
    expect.objectContaining({
      capabilityId: 'canvas.ingestMarkdown',
      providerId: 'neko-canvas',
      phases: ['review'],
    }),
  );

  service.unregisterProvider('neko-canvas');

  expect(service.getLifecycleCapabilityDescriptor('canvas.ingestMarkdown')).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm the method is missing**

Run:

```bash
pnpm --filter @neko-agent/extension test:run -- src/services/__tests__/capabilityDiscoveryService.test.ts
```

Expected before implementation: TypeScript or test failure because `getLifecycleCapabilityDescriptor` is not defined.

- [ ] **Step 3: Implement lifecycle descriptor lookup**

Update imports in `capabilityDiscoveryService.ts`:

```ts
import type {
  AgentCapabilityContext,
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityManifest,
  AgentCapabilityProvider,
  PromptFragment,
} from '@neko/shared';
```

Add this method to `CapabilityDiscoveryService` after `getAllPromptFragments()`:

```ts
getLifecycleCapabilityDescriptor(
  capabilityId: string,
): AgentCapabilityLifecycleDescriptor | undefined {
  if (!this._capabilityContext) return undefined;

  for (const provider of this._runtime.getAllProviders()) {
    const facets = provider.getArtifactFacets?.(this._capabilityContext);
    const descriptor = facets?.lifecycleCapabilities?.find(
      (candidate) => candidate.capabilityId === capabilityId,
    );
    if (descriptor) return descriptor;
  }

  return undefined;
}
```

- [ ] **Step 4: Re-run the discovery service test**

Run:

```bash
pnpm --filter @neko-agent/extension test:run -- src/services/__tests__/capabilityDiscoveryService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/neko-agent/packages/extension/src/services/capabilityDiscoveryService.ts packages/neko-agent/packages/extension/src/services/__tests__/capabilityDiscoveryService.test.ts
git commit -m "feat(agent): discover lifecycle descriptors from providers"
```

---

### Task 3: Remove Agent Hardcoded Canvas Lifecycle Descriptors

**Files:**

- Modify: `packages/neko-agent/packages/extension/src/chat/router/types.ts`
- Modify: `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`
- Modify: `packages/neko-agent/packages/extension/src/chat/router/fileAndPluginRoutes.ts`
- Test: `packages/neko-agent/packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts`

- [ ] **Step 1: Write the failing router tests**

Add a descriptor helper near test helpers in `chatWebviewMessageRouter.test.ts`:

```ts
function createCanvasLifecycleDescriptor(capabilityId: string) {
  return {
    capabilityId,
    providerId: 'neko-canvas',
    displayName: capabilityId,
    description: `${capabilityId} descriptor`,
    phases:
      capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? (['validate', 'review', 'apply'] as const)
        : (['review'] as const),
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts: ['Markdown', 'GfmTable'],
    produces: ['canvas-node-ref'],
    risk: 'medium' as const,
    requiresApproval: capabilityId === 'canvas.createStoryboardFromMarkdown',
    safetyKind:
      capabilityId === 'canvas.createStoryboardFromMarkdown'
        ? ('confirmation-gated' as const)
        : ('read-only-query' as const),
  };
}
```

Update `createDeps()` to include:

```ts
resolveLifecycleCapabilityDescriptor: vi.fn((capabilityId: string) =>
  capabilityId.startsWith('canvas.')
    ? createCanvasLifecycleDescriptor(capabilityId)
    : undefined,
),
```

Add this test near the Canvas lifecycle tests:

```ts
it('fails visibly when no provider lifecycle descriptor is registered', async () => {
  const deps = createDeps();
  deps.resolveLifecycleCapabilityDescriptor = vi.fn(() => undefined);
  const invoke = vi.fn();
  vi.mocked(vscode.extensions.getExtension).mockReturnValue({
    id: 'neko.neko-canvas',
    isActive: true,
    exports: { markdown: { invoke } },
    activate: vi.fn(),
  } as any);

  handleChatWebviewMessage(
    {
      type: 'invokeAgentCapabilityLifecycle',
      requestId: 'req-no-descriptor',
      conversationId: 'conv-1',
      invocation: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        payload: {
          capabilityId: 'canvas.ingestMarkdown',
          markdown: '| visual |\n| --- |\n| open |',
          sourceFormat: 'gfm-table',
        },
      },
    },
    deps,
  );

  await flushAsyncWork();

  expect(invoke).not.toHaveBeenCalled();
  expect(deps.webview.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'agentCapabilityLifecycleResult',
      requestId: 'req-no-descriptor',
      success: false,
      lifecycleResult: expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            code: 'agent-capability-lifecycle-unknown-capability',
            fieldKey: 'capabilityId',
          }),
        ],
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the router test and confirm current hardcoded descriptors make it fail**

Run:

```bash
pnpm --filter @neko-agent/extension test:run -- src/chat/__tests__/chatWebviewMessageRouter.test.ts
```

Expected before implementation: the new missing-descriptor test fails because the hardcoded descriptor still allows routing.

- [ ] **Step 3: Add descriptor resolver to router deps**

In `router/types.ts`, import the descriptor type and add the dependency:

```ts
import type { AgentCapabilityLifecycleDescriptor } from '@neko/shared';
```

```ts
readonly resolveLifecycleCapabilityDescriptor?: (
  capabilityId: string,
) => AgentCapabilityLifecycleDescriptor | undefined;
```

- [ ] **Step 4: Inject discovery lookup from ChatProvider**

In `chatProvider.ts`, add this property to the `handleChatWebviewMessage` deps object:

```ts
resolveLifecycleCapabilityDescriptor: (capabilityId) =>
  getCapabilityDiscoveryService().getLifecycleCapabilityDescriptor(capabilityId),
```

- [ ] **Step 5: Remove hardcoded Canvas descriptors from fileAndPluginRoutes**

Delete the `CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS` constant from `fileAndPluginRoutes.ts`.

Change lifecycle invocation signatures:

```ts
async function invokeAgentCapabilityLifecycle(
  message: Extract<WebviewToExtensionMessage, { type: 'invokeAgentCapabilityLifecycle' }>,
  deps: ChatWebviewMessageRouterDeps,
): Promise<void> {
  try {
    const lifecycleResult = await invokeAgentCapabilityLifecycleBackend(message.invocation, deps);
```

```ts
async function invokeAgentCapabilityLifecycleBackend(
  invocation: AgentCapabilityInvocationInput,
  deps: ChatWebviewMessageRouterDeps,
): Promise<AgentCapabilityInvocationResult> {
```

```ts
return invokeCanvasMarkdownLifecycleCapability(canvasApi, payload, deps);
```

```ts
async function invokeCanvasMarkdownLifecycleCapability(
  canvasApi: NekoCanvasAPI,
  input: CanvasMarkdownCapabilityInput,
  deps: ChatWebviewMessageRouterDeps,
): Promise<AgentCapabilityInvocationResult> {
  const descriptor = deps.resolveLifecycleCapabilityDescriptor?.(input.capabilityId);
```

Replace `getCanvasMarkdownLifecycleDescriptor` with a fail-visible helper:

```ts
function requireCanvasMarkdownLifecycleDescriptor(
  deps: ChatWebviewMessageRouterDeps,
  capabilityId: CanvasMarkdownCapabilityInput['capabilityId'],
): AgentCapabilityLifecycleDescriptor | undefined {
  return deps.resolveLifecycleCapabilityDescriptor?.(capabilityId);
}
```

Use the helper from `invokeCanvasMarkdownLifecycleCapability` or remove it if the direct resolver call is clearer. Do not keep any local array of Canvas descriptors in Agent.

- [ ] **Step 6: Re-run the router test**

Run:

```bash
pnpm --filter @neko-agent/extension test:run -- src/chat/__tests__/chatWebviewMessageRouter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/neko-agent/packages/extension/src/chat/router/types.ts packages/neko-agent/packages/extension/src/chat/chatProvider.ts packages/neko-agent/packages/extension/src/chat/router/fileAndPluginRoutes.ts packages/neko-agent/packages/extension/src/chat/__tests__/chatWebviewMessageRouter.test.ts
git commit -m "refactor(agent): route canvas lifecycle from provider descriptors"
```

---

### Task 4: Make Webview Send To Canvas Field-Agnostic

**Files:**

- Modify: `packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts`
- Test: `packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts`

- [ ] **Step 1: Update Webview presenter tests for dynamic fields**

Replace the test named `does not expose Canvas handoff for weak or display-only storyboard tables` with:

```ts
it('hands any GFM table to Agent without requiring storyboard canonical headers', () => {
  const projection = projectCanvasMarkdownHandoffRequest({
    markdown: ['| 镜头 | 画面 |', '| --- | --- |', '| 1 | 角色进入森林 |'].join('\n'),
    declaredIntentHint: 'creative-table',
    declaredProfileHint: 'storyboard',
  });

  expect(projection).toEqual(
    expect.objectContaining({
      sourceFormat: 'gfm-table',
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    }),
  );
  expect(JSON.stringify(projection)).not.toContain('capabilityId');
});
```

Add this test:

```ts
it('preserves skill-added columns without importing storyboard field contracts', () => {
  const projection = projectCanvasMarkdownHandoffRequest({
    markdown: [
      '| scene | shot | imagePrompt.generate | imagePrompt.edit | videoPrompt.generate | model |',
      '| --- | --- | --- | --- | --- | --- |',
      '| S1 | 1 | neon door | extend shadows | slow push in | seedance-2-5 |',
    ].join('\n'),
    declaredIntentHint: 'creative-table',
    declaredProfileHint: 'storyboard',
  });

  expect(projection).toEqual(
    expect.objectContaining({
      sourceFormat: 'gfm-table',
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    }),
  );
});
```

- [ ] **Step 2: Run the Webview presenter test and confirm fixed header gating fails**

Run:

```bash
pnpm --filter @neko-agent/webview test -- src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
```

Expected before implementation: the updated weak-table test fails because `isCanonicalStoryboardCreativeTable` still rejects the table.

- [ ] **Step 3: Remove storyboard fixed-field imports and genericize table detection**

In `canvas-markdown-handoff-presenter.ts`, replace the top imports with:

```ts
import type { CanvasMarkdownCapabilityTarget, CanvasMarkdownResourceRef } from '@neko/shared';
import type { PluginTransferProvenance, PluginTransferTargetRef } from '@neko-agent/types';
import type { MarkdownResourceRenderingProjection } from './markdown-resource-rendering-presenter';
```

Replace `CanvasMarkdownHandoffKind` and `inferCanvasMarkdownHandoffKind` with:

```ts
interface CanvasMarkdownHandoffKind {
  readonly declaredIntentHint?: CanvasMarkdownHandoffRequest['declaredIntentHint'];
  readonly declaredProfileHint?: string;
}

function inferCanvasMarkdownHandoffKind(markdown: string): CanvasMarkdownHandoffKind | null {
  const tables = extractGfmTables(markdown);
  if (tables.length === 0) return null;
  return {};
}
```

In the returned object, prefer caller-declared hints:

```ts
...(options.declaredIntentHint ?? handoffKind.declaredIntentHint
  ? { declaredIntentHint: options.declaredIntentHint ?? handoffKind.declaredIntentHint }
  : {}),
...(options.declaredProfileHint ?? handoffKind.declaredProfileHint
  ? { declaredProfileHint: options.declaredProfileHint ?? handoffKind.declaredProfileHint }
  : {}),
```

Delete `isCanonicalStoryboardCreativeTable` and all references to `STORYBOARD_CREATIVE_TABLE_HEADERS`.

- [ ] **Step 4: Re-run the Webview presenter test**

Run:

```bash
pnpm --filter @neko-agent/webview test -- src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add packages/neko-agent/packages/webview/src/presenters/canvas-markdown-handoff-presenter.ts packages/neko-agent/packages/webview/src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
git commit -m "refactor(agent-webview): make canvas markdown handoff field agnostic"
```

---

### Task 5: Remove Agent-Owned Storyboard CreativeTable Validator

**Files:**

- Modify: `packages/neko-agent/packages/agent/src/validation/output-validator.ts`
- Modify: `packages/neko-agent/packages/agent/src/validation/index.ts`
- Modify: `packages/neko-agent/packages/agent/src/index.ts`
- Delete: `packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts`
- Delete: `packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts`
- Modify: `packages/neko-agent/packages/agent-types/src/index.ts`
- Delete: `packages/neko-agent/packages/agent-types/src/creative-table-contract.ts`
- Modify tests that mention `creative-table.storyboard` under `packages/neko-agent/packages/agent/src/validation/__tests__/`, `packages/neko-agent/packages/agent/src/executor/__tests__/`, `packages/neko-agent/packages/extension/src/chat/handlers/__tests__/`, and `packages/neko-agent/packages/agent/src/skill/builtins/`.

- [ ] **Step 1: Write the output validator behavior test**

In `packages/neko-agent/packages/agent/src/validation/__tests__/validation-hooks.test.ts`, add:

```ts
it('does not run Canvas CreativeTable validators inside Agent output validation', async () => {
  const validator = new OutputValidator();
  const result = await validator.validate(
    ['| 镜头 | 画面 |', '| --- | --- |', '| 1 | 角色进入森林 |'].join('\n'),
    ['creative-table.storyboard'],
  );

  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});
```

If `OutputValidator` is not imported in that file, add:

```ts
import { OutputValidator } from '../output-validator';
```

- [ ] **Step 2: Run Agent validation tests and confirm the old validator still fires**

Run:

```bash
pnpm --filter @neko/agent test:run -- src/validation/__tests__/validation-hooks.test.ts src/validation/__tests__/creative-table-validator.test.ts
```

Expected before implementation: the new test fails or old CreativeTable validator tests still assert Agent-owned fixed fields.

- [ ] **Step 3: Remove storyboard validator registration from OutputValidator**

In `output-validator.ts`, remove this import:

```ts
import {
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  hasStoryboardCreativeTableArtifactShape,
  validateStoryboardCreativeTableOutput,
} from './creative-table-validator';
```

Replace the artifact validator registry with an empty registry:

```ts
const ARTIFACT_VALIDATOR_DEFINITIONS: readonly ArtifactValidatorDefinition[] = [] as const;
```

Keep `validateArtifactValidators` intact so future non-Canvas artifact validators can still be registered intentionally.

- [ ] **Step 4: Remove exports and deleted files**

Delete:

```bash
rm packages/neko-agent/packages/agent/src/validation/creative-table-validator.ts
rm packages/neko-agent/packages/agent/src/validation/__tests__/creative-table-validator.test.ts
rm packages/neko-agent/packages/agent-types/src/creative-table-contract.ts
```

Remove `creative-table-contract` exports from:

```ts
packages / neko - agent / packages / agent - types / src / index.ts;
packages / neko - agent / packages / agent / src / validation / index.ts;
packages / neko - agent / packages / agent / src / index.ts;
```

- [ ] **Step 5: Update skill metadata from validator ids to Canvas lifecycle guidance**

In `packages/neko-agent/packages/agent/src/skill/builtins/comic-to-storyboard.ts`, replace:

```ts
validationRequirements: ['creative-table.storyboard', 'CanvasMarkdownCapabilityInput'],
```

with:

```ts
validationRequirements: ['CanvasMarkdownCapabilityInput'],
```

In `packages/neko-agent/packages/agent/src/skill/builtins/media-to-video.ts`, remove `creative-table.storyboard` from `artifactProfiles` and `validationRequirements` arrays while keeping `storyboard`, `comic-shot-asset-prep`, and `CanvasMarkdownCapabilityInput`.

Update tests that expect `creative-table.storyboard` so they expect Canvas Markdown validation requirements only:

```ts
expect(skill.validationRequirements).toContain('CanvasMarkdownCapabilityInput');
expect(skill.validationRequirements).not.toContain('creative-table.storyboard');
```

- [ ] **Step 6: Run all affected Agent tests**

Run:

```bash
pnpm --filter @neko/agent test:run -- src/validation/__tests__/validation-hooks.test.ts src/executor/__tests__/agent-executor.test.ts src/skill/builtins/builtin-skills.test.ts src/skill/__tests__/conversation-skill-runtime.test.ts
pnpm --filter @neko-agent/extension test:run -- src/chat/handlers/__tests__/skillHandler.test.ts
pnpm --filter @neko-agent/webview test -- src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Confirm no Agent fixed storyboard contract imports remain**

Run:

```bash
rg -n "STORYBOARD_CREATIVE_TABLE|creative-table.storyboard|validateStoryboardCreativeTableOutput|resolveStoryboardCreativeTableHeader" packages/neko-agent packages/neko-canvas packages/neko-types
```

Expected output may include Canvas profile tests or OpenSpec documents, but must not include Agent production code importing fixed storyboard table headers or Agent output validator registration.

- [ ] **Step 8: Commit Task 5**

```bash
git add packages/neko-agent/packages/agent packages/neko-agent/packages/agent-types packages/neko-agent/packages/extension packages/neko-agent/packages/webview
git commit -m "refactor(agent): remove storyboard creative table validator ownership"
```

---

### Task 6: Extract Built-In Skill Content Into Top-Level `neko-skills`

**Decision:** `@neko/agent` must not depend on concrete skills. Agent owns the skill runtime, prompt composition, loader/registry/lifecycle ports, and host-neutral registries. `@neko/skills` owns cross-domain extension skill definitions and creative helper runtimes until those helpers move to their owning domain packages. VSCode Extension and CLI are the composition roots that inject `@neko/skills` into agent runtime.

**Files:**

- Create/move: `packages/neko-skills/package.json`
- Create/move: `packages/neko-skills/src/index.ts`
- Create/move: `packages/neko-skills/src/builtins/**`
- Create/move: `packages/neko-skills/src/creative/**`
- Modify: `packages/neko-agent/packages/agent/package.json`
- Modify: `packages/neko-agent/packages/agent/tsconfig.json`
- Modify: `packages/neko-agent/packages/agent/src/skill/index.ts`
- Modify: `packages/neko-agent/packages/agent/src/runtime/index.ts`
- Modify: `packages/neko-agent/packages/agent/src/runtime/capability-runtime-registries.ts`
- Modify: `packages/neko-agent/packages/agent/src/session/agent-session-initializer.ts`
- Modify: `packages/neko-agent/packages/extension/src/index.ts`
- Modify: `packages/neko-agent/packages/extension/src/chat/chatProvider.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/**`

- [x] **Step 1: Add a failing architecture guard**

Add an agent architecture test proving `packages/neko-agent/packages/agent` does not import or declare dependencies on `@neko-agent/skills` or `@neko/skills`.

Verification before implementation:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
```

Expected before implementation: FAIL on agent package config, runtime re-export, and `skill/builtins` shim.

- [x] **Step 2: Move the skills package to top-level `packages/neko-skills`**

Move existing cross-domain skill definitions and creative helper runtimes from:

```text
packages/neko-agent/packages/skills
```

to:

```text
packages/neko-skills
```

Set package name:

```json
"name": "@neko/skills"
```

- [x] **Step 3: Remove Agent package dependency on concrete skills**

Remove `@neko-agent/skills` / `@neko/skills` from:

```text
packages/neko-agent/packages/agent/package.json
packages/neko-agent/packages/agent/tsconfig.json
packages/neko-agent/packages/agent/src/runtime/index.ts
packages/neko-agent/packages/agent/src/skill/index.ts
packages/neko-agent/packages/agent/src/skill/builtins/index.ts
```

Delete the agent-side builtin shim instead of replacing it with a new re-export.

- [x] **Step 4: Make builtins explicit host injection**

Change agent runtime defaults so empty registries are created by default:

```text
packages/neko-agent/packages/agent/src/runtime/capability-runtime-registries.ts
packages/neko-agent/packages/agent/src/session/agent-session-initializer.ts
packages/neko-agent/packages/agent/src/skill/skill-registry-populator.ts
packages/neko-agent/packages/agent/src/skill/skill-file-projector.ts
```

Then inject builtins from host/composition layers:

```text
packages/neko-agent/packages/extension/src/index.ts
packages/neko-agent/packages/extension/src/chat/chatProvider.ts
packages/neko-agent/packages/cli-tui/src/core/runtime-bootstrap.ts
packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts
```

- [x] **Step 5: Update workspace aliases and lockfile**

Update:

```text
packages/neko-agent/package.json
packages/neko-agent/vitest.config.ts
packages/neko-agent/vitest.real-api.config.ts
packages/neko-agent/packages/extension/package.json
packages/neko-agent/packages/cli-tui/package.json
packages/neko-agent/packages/cli-tui/build-neko.ts
packages/neko-agent/packages/cli-tui/tsup.config.ts
pnpm-lock.yaml
```

- [x] **Step 6: Run focused verification**

Run:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts
./node_modules/.bin/vitest run packages/agent/src/runtime/__tests__/capability-runtime-registries.test.ts packages/agent/src/skill/__tests__/skill-registry-populator.test.ts packages/agent/src/skill/__tests__/skill-file-projector.test.ts packages/agent/src/skill/__tests__/tool-group-registry-tier.test.ts packages/agent/src/__tests__/standalone.test.ts
./node_modules/.bin/vitest run packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts packages/cli-tui/src/__tests__/experiment.test.ts
./node_modules/.bin/vitest run ../neko-skills/src/builtins/builtin-skills.test.ts ../neko-skills/src/builtins/persona-skills.test.ts ../neko-skills/src/creative/__tests__/storyboard-image-runtime.test.ts ../neko-skills/src/creative/__tests__/shot-image-prep-runtime.test.ts ../neko-skills/src/creative/__tests__/comic-animation-indexing-runtime.test.ts
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
./node_modules/.bin/esbuild ./packages/extension/src/index.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --loader:.md=text --alias:@neko/skills=../neko-skills/src/index.ts
```

Expected: PASS. Full agent `tsc --noEmit -p packages/agent/tsconfig.json` still has pre-existing test fixture type debt and is not the acceptance gate for this task.

- [x] **Step 7: Remove concrete media workflow strategy from Agent matcher**

Agent `KeywordSkillMatcher` now treats natural-language discovery as generic candidate discovery only:

- It no longer hardcodes concrete creative media skill names such as comic/storyboard/video package builtins.
- It ranks explicit production requests from `Skill.mediaWorkflow` metadata (`acceptedModalities`, `producedArtifacts`, `artifactProfiles`, `tags`, and `operations`).
- It still filters content-only document/comic analysis away from creative production skills and does not activate skills; activation remains explicit user invocation or Agent-led `ActivateSkill`.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts packages/agent/src/skill/__tests__/skill-service.test.ts
```

Expected: PASS, including the guard that scans Agent core for concrete media workflow skill names.

- [x] **Step 8: Move concrete creative artifact samples out of Agent tests**

Moved the `comic-to-animation` composite artifact sample and its profile/projector tests to:

```text
packages/neko-skills/src/creative/__fixtures__/comic-to-animation-composite-artifact.json
packages/neko-skills/src/creative/__tests__/comic-to-animation-artifact.test.ts
```

The migrated tests depend only on `@neko/shared` and the local `@neko/skills` fixture. Agent runtime/provider registration behavior remains covered by generic Agent capability runtime tests, without concrete creative skill fixtures.

Verification:

```bash
./node_modules/.bin/vitest run ../neko-skills/src/creative/__tests__/comic-to-animation-artifact.test.ts ../neko-skills/src/creative/__tests__/shot-image-prep-artifact.test.ts
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
```

Expected: PASS.

- [x] **Step 9: Move domain SubAgent presets out of Agent core**

Moved creative-domain SubAgent presets from Agent core into `@neko/skills`:

```text
packages/neko-skills/src/subagent/creative-presets.ts
packages/neko-skills/src/subagent/__tests__/creative-presets.test.ts
```

Agent core now owns only built-in host-neutral SubAgent presets and accepts host-contributed presets through runtime bindings:

```text
packages/neko-agent/packages/agent/src/runtime/runtime-host-bindings.ts
packages/neko-agent/packages/agent/src/runtime/agent-session-factory.ts
packages/neko-agent/packages/agent/src/runtime/subagent-runtime.ts
packages/neko-agent/packages/agent/src/subagent/types.ts
packages/neko-agent/packages/agent/src/subagent/subagent-manager.ts
```

The VSCode Extension composition root injects `@neko/skills` creative presets without making `@neko/agent` depend on the concrete skills package.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/subagent/__tests__/subagent-manager.test.ts packages/agent/src/subagent/__tests__/task-tool.test.ts packages/agent/src/__tests__/architecture-boundary-guards.test.ts --reporter=verbose
./node_modules/.bin/vitest run ../neko-skills/src/subagent/__tests__/creative-presets.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
pnpm run compile:extension
```

Expected: PASS.

- [x] **Step 10: Move Canvas generation helper runtime out of Agent core**

Moved Canvas image-generation prompt/request assembly from Agent runtime into `@neko/skills`:

```text
packages/neko-skills/src/canvas/canvas-generation-runtime.ts
packages/neko-skills/src/canvas/__tests__/canvas-generation-runtime.test.ts
```

Agent core no longer exports or owns `runtime/canvas-generation-runtime.ts`. The VSCode Extension command bridge still owns the current compatibility command names (`neko.agent.buildPrompt`, `neko.agent.generateForNode`) but imports the implementation from `@neko/skills`. A later Canvas capability migration should move command/capability ownership to the Canvas provider.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts --reporter=verbose
./node_modules/.bin/vitest run ../neko-skills/src/canvas/__tests__/canvas-generation-runtime.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
pnpm run compile:extension
```

Expected: PASS.

- [x] **Step 11: Move Puppet face domain tools out of Agent core**

Moved Puppet face parameter runtime and tool factory from Agent core into `@neko/skills`:

```text
packages/neko-skills/src/puppet/puppet-face-runtime.ts
packages/neko-skills/src/puppet/puppet-face-tools.ts
packages/neko-skills/src/puppet/__tests__/puppet-face-runtime.test.ts
packages/neko-skills/src/puppet/__tests__/puppet-face-tools.test.ts
```

Agent core no longer exports Puppet face domain APIs from `@neko/agent` or `@neko/agent/tools`. The VSCode Extension bridge still wires VSCode command invocation, image file access, and `NekoPuppetAPI`, but imports the domain tool factory from `@neko/skills`.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts --reporter=verbose
./node_modules/.bin/vitest run ../neko-skills/src/puppet/__tests__/puppet-face-runtime.test.ts ../neko-skills/src/puppet/__tests__/puppet-face-tools.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
pnpm run compile:extension
```

Expected: PASS.

- [x] **Step 12: Move Story scene search runtime out of Agent core**

Moved screenplay/scene search indexing from Agent tools into `@neko/skills`:

```text
packages/neko-skills/src/story/script-scene-search-runtime.ts
packages/neko-skills/src/story/__tests__/script-scene-search-runtime.test.ts
```

Agent core no longer exports Story scene search runtime APIs from `@neko/agent` or `@neko/agent/tools`.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts --reporter=verbose
./node_modules/.bin/vitest run ../neko-skills/src/story/__tests__/script-scene-search-runtime.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
pnpm run compile:extension
```

Expected: PASS.

- [x] **Step 13: Move media quality validation tools out of Agent core**

Moved media quality and consistency tool implementations from Agent validation into `@neko/skills`, while promoting shared QA evidence contracts into `@neko/shared`:

```text
packages/neko-skills/src/quality/remediation-planner.ts
packages/neko-skills/src/quality/consistency-evaluator.ts
packages/neko-skills/src/quality/media-quality-runtime.ts
packages/neko-skills/src/quality/quality-check-tools.ts
packages/neko-types/src/types/quality/qa-types.ts
packages/neko-types/src/types/quality/quality-evidence-normalizer.ts
packages/neko-types/src/types/quality/video-content-index.ts
```

Agent core no longer exports or owns `QualityCheck`, `QualityRepairCheck`, `QualityCheckConsistency`, deterministic remediation planning, consistency evaluation, media quality runtime, or video content index construction. Agent feedback/session code imports shared QA evidence contracts from `@neko/shared` only so it can record tool results as generic feedback evidence. The VSCode Extension bridge still supplies VSCode file access, logger adapters, media generator, and analyzer dependencies, but imports the quality tool factories from `@neko/skills`.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts packages/extension/src/tools/__tests__/qualityCheckTools.test.ts packages/extension/src/tools/__tests__/consistencyCheckTools.test.ts ../neko-skills/src/quality/__tests__/quality-check-tools.test.ts ../neko-skills/src/quality/__tests__/consistency-evaluator.test.ts ../neko-skills/src/quality/__tests__/remediation-planner.test.ts --reporter=verbose
../../node_modules/.bin/vitest run src/types/quality/__tests__/quality-evidence-normalizer.test.ts src/types/quality/__tests__/video-content-index.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
pnpm run compile:extension
node scripts/check-neko-agent-boundaries.mjs
```

Expected: PASS.

- [x] **Step 14: Move media quality feedback adapters out of Agent core**

Moved `QualityCheck` / `QualityRepairCheck` / `QualityCheckConsistency` feedback parsing and evidence construction from Agent feedback/session code into `@neko/skills`:

```text
packages/neko-skills/src/quality/quality-review-feedback.ts
packages/neko-skills/src/quality/__tests__/quality-review-feedback.test.ts
packages/neko-types/src/types/agent-feedback.ts
```

Agent core now owns only the generic feedback loop contract:

- `AgentToolResultFeedbackAdapter`
- `AgentToolReviewFeedbackSignal`
- runtime/session projection of `toolResultFeedbackAdapters`
- generic `tool-review` evaluation and arbitration

The VSCode Extension and CLI composition roots inject `createQualityReviewFeedbackAdapter()` from `@neko/skills`; Agent no longer exports `createQualityReviewEvidence` or contains quality-specific feedback parsing. The architecture guard now fails if Agent production code reintroduces `QualityCheck`, `QualityRepairCheck`, `QualityCheckConsistency`, `quality-review`, or `quality-check` feedback ownership.

Verification:

```bash
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts packages/agent/src/feedback/__tests__/feedback-coordinator.test.ts packages/agent/src/session/__tests__/agent-session.test.ts ../neko-skills/src/quality/__tests__/quality-review-feedback.test.ts -t "agent architecture boundary guards|FeedbackCoordinator|feedback observation|createQualityReview" --reporter=verbose
./node_modules/.bin/vitest run packages/agent/src/runtime/__tests__/session-config-projection.test.ts packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts packages/cli-tui/src/__tests__/experiment.test.ts --reporter=verbose
./node_modules/.bin/tsc --noEmit -p ../neko-skills/tsconfig.json
./node_modules/.bin/esbuild ./packages/extension/src/index.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --loader:.md=text --alias:@neko/skills=../neko-skills/src/index.ts
node scripts/check-neko-agent-boundaries.mjs
```

Expected: PASS. `pnpm run compile:extension` remains blocked locally by pnpm ignored-builds approval, so the direct esbuild command is the executable extension bundle verification for this step.

- [x] **Step 15: Move remaining domain strategy packs out of Agent core and harden validation**

Moved optional Autoheal strategy packs and character/entity memory artifact helpers from Agent runtime ownership into `@neko/skills`:

```text
packages/neko-skills/src/autoheal/example-handlers.ts
packages/neko-skills/src/character/character-memory-artifact.ts
packages/neko-skills/src/character/entity-memory-contribution-inference.ts
```

Agent core now keeps only:

- generic `autoheal-chain` / `autoheal-types`
- generic artifact watcher / artifact validator
- generic stream projection with an injected `projectCompositeBlock` extension point
- generic validation hooks, with image URL MIME inference now fail-visible for malformed URLs and unknown extensions

The VSCode Extension composition root injects `maybeAttachInferredEntityMemoryContribution()` from `@neko/skills`; Agent no longer owns the character/entity memory inference implementation. Architecture guards now fail if Agent core reintroduces optional Autoheal strategy factories or character/entity memory artifact projection.

Validation:

```bash
./node_modules/.bin/vitest run packages/agent/src/runtime/__tests__/agent-stream-state.test.ts packages/agent/src/validation/__tests__/validation-hooks.test.ts packages/agent/src/__tests__/architecture-boundary-guards.test.ts
./node_modules/.bin/vitest run packages/agent/src/runtime/__tests__/agent-event-stream-runtime.test.ts packages/agent/src/autoheal/__tests__/autoheal-chain.test.ts
./node_modules/.bin/vitest run src/autoheal/__tests__/example-handlers.test.ts src/character/__tests__/character-memory-artifact.test.ts src/character/__tests__/entity-memory-contribution-inference.test.ts
./node_modules/.bin/tsc --noEmit -p packages/neko-skills/tsconfig.json
./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json
./node_modules/.bin/esbuild ./packages/extension/src/index.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --loader:.md=text --alias:@neko/skills=../neko-skills/src/index.ts
node scripts/check-neko-agent-boundaries.mjs
```

Expected: PASS. `pnpm --filter` / `pnpm exec` remain blocked locally by pnpm ignored-builds approval in this workspace, so direct package-local binaries are the executable validation path for this step.

- [x] **Step 16: Move feedback, control-plane, and feedback-memory policies out of Agent core**

Moved concrete feedback/control-plane policy implementations from Agent core into `@neko/skills`:

```text
packages/neko-skills/src/feedback/feedback-coordinator.ts
packages/neko-skills/src/feedback/artifact-observation-hooks.ts
packages/neko-skills/src/feedback/self-evaluation-hooks.ts
packages/neko-skills/src/control-plane/control-plane.ts
packages/neko-skills/src/control-plane/stage-registry.ts
packages/neko-skills/src/control-plane/artifact-registry.ts
packages/neko-skills/src/memory/keyfact-extractor.ts
packages/neko-skills/src/memory/project-memory-router.ts
packages/neko-skills/src/memory/provider-card-project-router.ts
```

Agent core now keeps only:

- shared feedback/control-plane contracts in `@neko/shared`
- generic `FeedbackRuntimeBridge`
- generic `FeedbackGuidanceModule`
- session/runtime config projection for injected `feedbackCoordinator`, `feedbackCoordinatorFactory`, and `controlPlane`
- a narrow `AgentEventSubscriptionPort` adapter for `execution.artifact.invalid`

The CLI and VSCode Extension composition roots now inject `createFeedbackCoordinatorFactory()` and `createDefaultControlPlane()` from `@neko/skills`. Agent no longer creates default feedback/control-plane implementations internally and no longer exports `feedback`, `control-plane`, `evaluation`, or feedback-memory policy modules. Architecture guards now fail if Agent core reintroduces concrete feedback coordinator, default control-plane, self-evaluation hooks, artifact observation hooks, key-fact extraction, project-memory routing, or provider-card project routing.

Validation:

```bash
./node_modules/.bin/tsc --noEmit -p packages/neko-skills/tsconfig.json
./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json
./node_modules/.bin/vitest run src/feedback/*.test.ts src/control-plane/control-plane.test.ts src/memory/__tests__/*.test.ts --reporter=verbose
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts packages/agent/src/runtime/__tests__/session-config-projection.test.ts packages/agent/src/session/__tests__/session-collaborators.test.ts --reporter=verbose
./node_modules/.bin/vitest run packages/agent/src/session/__tests__/agent-session-boundary-characterization.test.ts --reporter=verbose
./node_modules/.bin/vitest run packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts --reporter=verbose
node scripts/check-neko-agent-boundaries.mjs
./node_modules/.bin/esbuild ./packages/extension/src/index.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --loader:.md=text --alias:@neko/skills=../neko-skills/src/index.ts
```

Expected: PASS. `pnpm --filter` / `pnpm exec` remain blocked locally by pnpm ignored-builds approval in this workspace, so direct package-local binaries are the executable validation path for this step.

- [x] **Step 17: Move Autoheal chain implementation out of Agent core**

Moved the concrete 5-level autoheal chain out of Agent core and into `@neko/skills`:

```text
packages/neko-skills/src/autoheal/autoheal-chain.ts
packages/neko-skills/src/autoheal/__tests__/autoheal-chain.test.ts
```

Agent core now keeps only:

- shared autoheal contracts in `@neko/shared` (`agent-autoheal.ts`)
- the ReAct runner hook point that accepts an optional `IAutohealChain`
- session/runtime config projection for an injected `autohealChainFactory`
- a narrow EventBus adapter from shared autoheal runtime events to execution channels

The CLI and VSCode Extension composition roots now inject `createAutohealChain` from `@neko/skills`. Agent no longer creates a default autoheal chain internally and no longer owns `autoheal-chain.ts` or `autoheal-types.ts`. Architecture guards now fail if Agent core reintroduces `createAutohealChain`, `DEFAULT_AUTOHEAL_POLICY`, `AutohealChain`, or optional autoheal strategy packs.

Validation:

```bash
./node_modules/.bin/tsc --noEmit -p packages/neko-skills/tsconfig.json
./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json
./node_modules/.bin/vitest run src/autoheal/__tests__/autoheal-chain.test.ts src/autoheal/__tests__/example-handlers.test.ts src/feedback/*.test.ts src/control-plane/control-plane.test.ts src/memory/__tests__/*.test.ts --reporter=verbose
./node_modules/.bin/vitest run packages/agent/src/__tests__/architecture-boundary-guards.test.ts packages/agent/src/runtime/__tests__/session-config-projection.test.ts packages/agent/src/executor/__tests__/react-loop-runner.test.ts packages/agent/src/session/__tests__/session-collaborators.test.ts packages/agent/src/session/__tests__/agent-session-boundary-characterization.test.ts --reporter=verbose
./node_modules/.bin/vitest run packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts packages/cli-tui/src/__tests__/experiment.test.ts --reporter=verbose
node scripts/check-neko-agent-boundaries.mjs
./node_modules/.bin/esbuild ./packages/extension/src/index.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --loader:.md=text --alias:@neko/skills=../neko-skills/src/index.ts
```

Expected: PASS. `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/agent/tsconfig.json` still reports unrelated pre-existing test fixture type errors in broader agent tests; the current autoheal change is covered by the focused extension compile, package-local skills compile, focused runtime tests, boundary script, and extension bundle.

### Task 7: Final Boundary Verification

**Files:**

- No planned production edits.
- Test command output is the deliverable.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec vitest run packages/neko-canvas/packages/extension/src/__tests__/agentCapabilityProvider.test.ts packages/neko-canvas/packages/extension/src/__tests__/markdownCapabilities.test.ts
pnpm --filter @neko-agent/extension test:run -- src/services/__tests__/capabilityDiscoveryService.test.ts src/chat/__tests__/chatWebviewMessageRouter.test.ts
pnpm --filter @neko-agent/webview test -- src/presenters/__tests__/canvas-markdown-handoff-presenter.test.ts
pnpm --filter @neko/agent test:run -- src/validation/__tests__/validation-hooks.test.ts src/skill/builtins/builtin-skills.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run boundary checks**

Run:

```bash
pnpm check:agent-boundaries
pnpm check:webview-boundaries
pnpm check:legacy-debt
```

Expected: all checks PASS.

- [ ] **Step 3: Run TypeScript compile for affected packages**

Run:

```bash
pnpm exec tsc --noEmit -p packages/neko-agent/packages/extension/tsconfig.json
pnpm exec tsc --noEmit -p packages/neko-agent/packages/agent/tsconfig.json
pnpm exec tsc --noEmit -p packages/neko-agent/packages/webview/tsconfig.json
```

Expected: all compile commands PASS.

- [ ] **Step 4: Run residual search**

Run:

```bash
rg -n "CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS|STORYBOARD_CREATIVE_TABLE|creative-table.storyboard|resolveStoryboardCreativeTableHeader|validateStoryboardCreativeTableOutput" packages/neko-agent packages/neko-canvas packages/neko-types
```

Expected:

- No `CANVAS_MARKDOWN_LIFECYCLE_DESCRIPTORS` in `packages/neko-agent`.
- No `STORYBOARD_CREATIVE_TABLE` imports in Agent Webview or Agent validator code.
- No `creative-table.storyboard` in runtime validation requirements.
- Canvas profile code may still contain storyboard field aliases because Canvas owns that profile.

- [ ] **Step 5: Run full quality gate if focused checks are green**

Run:

```bash
pnpm check:quality
```

Expected: PASS.

---

## Self-Review

**Spec coverage:** The plan covers Canvas ingest protocol ownership, CreativeTable deterministic validator ownership, storyboard profile execution actions, resource binding, Send to Canvas lifecycle/capability execution, Webview field-agnostic handoff, and optional skills package extraction.

**Placeholder scan:** The plan contains concrete paths, test snippets, commands, and expected outcomes. It does not rely on unspecified implementation steps.

**Type consistency:** The plan uses existing `AgentCapabilityLifecycleDescriptor`, `CanvasMarkdownCapabilityInput`, `CanvasMarkdownCapabilityResult`, `AgentCapabilityProvider`, and `ChatWebviewMessageRouterDeps` types. New dependency names are consistent across router deps, tests, and ChatProvider injection.
