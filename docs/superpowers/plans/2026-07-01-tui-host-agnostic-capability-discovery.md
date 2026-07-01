# TUI Host-Agnostic Capability Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VSCode-free TUI capability discovery path that loads terminal-safe package capabilities, exposes diagnostics through `/capability`, and feeds prompt fragments, provider cards, tools, and `@` reference contributors into TUI Agent sessions.

**Architecture:** Keep `cli-tui` independent of VSCode by introducing host/runtime requirement contracts in shared types, a TUI capability loader in `cli-tui`, and explicit first-slice registration for `neko-assets` and `neko-story`. Existing VSCode dynamic registration remains an adapter path; TUI consumes only host-agnostic provider factories and runtime ports.

**Tech Stack:** TypeScript, React Ink, Zustand, Vitest, existing `@neko/agent` runtime, `@neko/shared` contracts, `@neko/platform` config/runtime, pnpm workspace.

---

## File Structure

### Shared contracts

- Modify `packages/neko-types/src/types/agent-capability.ts`
  - Add runtime requirement metadata for providers and tools.
  - Add optional reference contributor projection to capability providers.
  - Keep existing `hostRequirements` but document TUI filtering semantics.
- Create `packages/neko-types/src/types/agent-capability-diagnostics.ts`
  - Define provider/tool availability diagnostics.
  - Define loaded/skipped contribution summaries for TUI status.
- Create `packages/neko-types/src/types/reference-contributor.ts`
  - Define terminal-safe reference contributor DTOs.
- Modify `packages/neko-types/src/types/index.ts`
  - Export the new contracts.
- Test `packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts`
  - Type/runtime-shape characterization tests for metadata and diagnostics.

### Agent runtime

- Modify `packages/neko-agent/packages/agent/src/runtime/capability-registry-runtime.ts`
  - Expose provider registration summaries and diagnostics needed by TUI.
  - Keep existing collision behavior.
- Test `packages/neko-agent/packages/agent/src/runtime/__tests__/capability-registry-runtime.test.ts`
  - Assert summaries include tools, prompt fragments, tool groups, provider cards, and diagnostics.

### CLI/TUI capability loader

- Create `packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts`
  - Build a `CapabilityRegistryRuntime` for TUI.
  - Filter providers by host/runtime requirements.
  - Register accepted providers into the TUI tool registry, skill registry, tool group registry, provider card registry, and reference contributor registry.
- Create `packages/neko-agent/packages/cli-tui/src/core/tui-reference-contributors.ts`
  - Own aggregation of terminal-safe `@` reference contributors.
- Modify `packages/neko-agent/packages/cli-tui/src/core/runtime-bootstrap.ts`
  - Accept injected capability runtime bindings and prompt fragments.
- Modify `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`
  - Create and wire the TUI capability loader during session initialization.
  - Pass loaded runtime bindings into `createCliAgentRuntime`.
  - Expose capability ports to command router and reference suggestions.
- Modify `packages/neko-agent/packages/cli-tui/src/core/runner.ts`
  - Wire the same loader into non-Ink interactive CLI session creation where it uses `createCliAgentRuntime`.
- Tests:
  - `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts`
  - `packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts`

### TUI command surface

- Modify `packages/neko-agent/packages/cli-tui/src/core/tui-command-router.ts`
  - Add `/capability list`, `/capability show <provider>`, and `/capability tools [provider]`.
- Modify `packages/neko-agent/packages/cli-tui/src/core/slash-command-catalog.ts`
  - Add `/capability` command metadata and autocomplete description.
- Tests:
  - `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts`
  - `packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts`

### TUI `@` references

- Modify `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.ts`
  - Merge filesystem candidates with registered reference contributors.
- Modify `packages/neko-agent/packages/cli-tui/src/components/App.tsx`
  - Pass contributor-aware reference search state into `InputEditor`.
- Tests:
  - `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts`
  - `packages/neko-agent/packages/cli-tui/src/components/Input/input-suggestions.test.ts`

### First provider slice

- Create `packages/neko-assets/src/agentHeadlessCapabilityProvider.ts`
  - Export a VSCode-free provider factory for list/get asset tools and asset reference search.
- Modify `packages/neko-assets/src/agentCapabilityProvider.ts`
  - Reuse the headless provider factory where possible while keeping import/mutation or VSCode-only behavior separate.
- Test `packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts`
  - Assert no VSCode requirement and terminal-safe references.
- Create `packages/neko-story/src/agentHeadlessCapabilityProvider.ts`
  - Export screenplay index/search and Fountain prompt fragments without importing VSCode.
- Modify `packages/neko-story/packages/extension/src/agentCapabilityProvider.ts`
  - Reuse the headless provider factory for shared tools/fragments.
- Test `packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts`
  - Assert TUI-safe metadata, prompt fragments, and search behavior.

### Architecture guards

- Modify or add `packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx`
  - Assert `cli-tui/src` does not import `vscode`.
  - Assert `cli-tui/src` does not import `packages/*/extension` or `@neko/*/extension` implementation paths.
  - Assert first-slice headless providers do not import `vscode`.

---

### Task 1: Add shared host/runtime requirement and reference contracts

**Files:**
- Modify: `packages/neko-types/src/types/agent-capability.ts`
- Create: `packages/neko-types/src/types/agent-capability-diagnostics.ts`
- Create: `packages/neko-types/src/types/reference-contributor.ts`
- Modify: `packages/neko-types/src/types/index.ts`
- Test: `packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts`

- [ ] **Step 1: Write the failing contract tests**

Add `packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type {
  AgentCapabilityRuntimeRequirements,
  AgentCapabilityAvailabilityDiagnostic,
  AgentReferenceContributor,
  AgentReferenceCandidate,
} from '../index';

describe('agent capability host-agnostic contracts', () => {
  it('models runtime requirements for TUI filtering', () => {
    const requirements: AgentCapabilityRuntimeRequirements = {
      vscode: false,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    };

    expect(requirements).toEqual({
      vscode: false,
      activeEditor: false,
      contentAccess: true,
      writableProject: false,
    });
  });

  it('models fail-visible availability diagnostics', () => {
    const diagnostic: AgentCapabilityAvailabilityDiagnostic = {
      level: 'warn',
      providerId: 'neko-cut',
      contributionKind: 'tool',
      contributionName: 'cut.revealTimeline',
      code: 'capability.unavailable',
      reason: 'requires-vscode',
      message: 'Tool is unavailable in TUI because it requires VSCode.',
      requirement: 'vscode',
      host: 'tui',
    };

    expect(diagnostic.reason).toBe('requires-vscode');
    expect(diagnostic.host).toBe('tui');
  });

  it('models terminal-safe reference contributors', async () => {
    const candidate: AgentReferenceCandidate = {
      id: 'asset:hero',
      label: 'Hero',
      source: 'assets',
      kind: 'asset',
      insertText: '@asset:hero',
      description: 'Main character reference',
      metadata: {
        category: 'character',
      },
    };
    const contributor: AgentReferenceContributor = {
      id: 'neko-assets',
      displayName: 'Assets',
      search: async () => ({ candidates: [candidate], diagnostics: [] }),
    };

    await expect(contributor.search({ query: 'hero', limit: 5 })).resolves.toEqual({
      candidates: [candidate],
      diagnostics: [],
    });
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
pnpm --filter @neko/shared vitest --run packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts
```

Expected: fail because `AgentCapabilityRuntimeRequirements`, `AgentCapabilityAvailabilityDiagnostic`, and reference contributor types are not exported.

- [ ] **Step 3: Add shared contracts**

Append to `packages/neko-types/src/types/agent-capability.ts` near protocol metadata:

```ts
import type { AgentReferenceContributor } from './reference-contributor';

export interface AgentCapabilityRuntimeRequirements {
  readonly vscode?: boolean;
  readonly activeEditor?: boolean;
  readonly mediaService?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}

export interface AgentCapabilityRuntimeRequirementDescriptor {
  readonly requirements?: AgentCapabilityRuntimeRequirements;
}
```

Extend `AgentCapabilityProvider` in the same file:

```ts
  /**
   * Optional terminal-safe reference contributors. TUI consumes these for `@`
   * suggestions; Webview may adapt them into richer chips/previews elsewhere.
   */
  getReferenceContributors?(context: AgentCapabilityContext): readonly AgentReferenceContributor[];
```

Create `packages/neko-types/src/types/agent-capability-diagnostics.ts`:

```ts
import type { AgentCapabilityHost } from './agent-capability';

export type AgentCapabilityAvailabilityDiagnosticLevel = 'info' | 'warn' | 'error';

export type AgentCapabilityContributionKind =
  | 'provider'
  | 'tool'
  | 'skill'
  | 'toolGroup'
  | 'promptFragment'
  | 'providerCard'
  | 'referenceContributor';

export interface AgentCapabilityAvailabilityDiagnostic {
  readonly level: AgentCapabilityAvailabilityDiagnosticLevel;
  readonly providerId: string;
  readonly contributionKind: AgentCapabilityContributionKind;
  readonly contributionName?: string;
  readonly code: string;
  readonly reason: string;
  readonly message: string;
  readonly requirement?: string;
  readonly host?: AgentCapabilityHost;
}

export interface AgentCapabilityContributionSummary {
  readonly kind: AgentCapabilityContributionKind;
  readonly name: string;
}

export interface AgentCapabilityProviderAvailabilitySummary {
  readonly providerId: string;
  readonly version?: string;
  readonly loaded: readonly AgentCapabilityContributionSummary[];
  readonly skipped: readonly AgentCapabilityAvailabilityDiagnostic[];
}
```

Create `packages/neko-types/src/types/reference-contributor.ts`:

```ts
import type { AgentCapabilityAvailabilityDiagnostic } from './agent-capability-diagnostics';

export type AgentReferenceCandidateKind =
  | 'file'
  | 'asset'
  | 'story-scene'
  | 'canvas'
  | 'document'
  | 'media'
  | 'artifact';

export interface AgentReferenceCandidate {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly kind: AgentReferenceCandidateKind;
  readonly insertText: string;
  readonly description?: string;
  readonly path?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentReferenceSearchRequest {
  readonly query: string;
  readonly limit: number;
  readonly workspaceRoot?: string;
}

export interface AgentReferenceSearchResult {
  readonly candidates: readonly AgentReferenceCandidate[];
  readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
}

export interface AgentReferenceContributor {
  readonly id: string;
  readonly displayName: string;
  search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult>;
}
```

Add exports in `packages/neko-types/src/types/index.ts`:

```ts
export * from './agent-capability-diagnostics';
export * from './reference-contributor';
```

- [ ] **Step 4: Run the contract test and verify it passes**

Run:

```bash
pnpm --filter @neko/shared vitest --run packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/neko-types/src/types/agent-capability.ts \
  packages/neko-types/src/types/agent-capability-diagnostics.ts \
  packages/neko-types/src/types/reference-contributor.ts \
  packages/neko-types/src/types/index.ts \
  packages/neko-types/src/types/__tests__/agent-capability-contract.test.ts
git commit -m "feat(agent): add host agnostic capability contracts"
```

---

### Task 2: Add TUI capability loader filtering and diagnostics

**Files:**
- Create: `packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry, SkillRegistry, ToolGroupRegistry, ProviderCardRegistry } from '@neko/agent';
import type { AgentCapabilityProvider, Tool } from '@neko/shared';
import { createTuiCapabilityLoader } from '../tui-capability-loader';

function createTool(name: string, extra: Partial<Tool> = {}): Tool {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(async () => ({ success: true })),
    ...extra,
  };
}

function createProvider(
  overrides: Partial<AgentCapabilityProvider> & Pick<AgentCapabilityProvider, 'id'>,
): AgentCapabilityProvider {
  return {
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    getTools: () => [],
    ...overrides,
  };
}

describe('createTuiCapabilityLoader', () => {
  it('registers providers that explicitly support TUI', () => {
    const toolRegistry = new ToolRegistry();
    const loader = createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry: new SkillRegistry(),
      toolGroupRegistry: new ToolGroupRegistry(),
      providerCardRegistry: new ProviderCardRegistry(),
    });

    const provider = createProvider({
      id: 'neko-assets',
      getTools: () => [createTool('assets.list')],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('assets.list')).toBeDefined();
    expect(result.providers[0]).toMatchObject({
      providerId: 'neko-assets',
      loaded: [{ kind: 'tool', name: 'assets.list' }],
      skipped: [],
    });
  });

  it('skips legacy providers that do not opt into TUI', () => {
    const toolRegistry = new ToolRegistry();
    const loader = createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry: new SkillRegistry(),
      toolGroupRegistry: new ToolGroupRegistry(),
      providerCardRegistry: new ProviderCardRegistry(),
    });

    const provider = createProvider({
      id: 'neko-cut',
      hostRequirements: undefined,
      getTools: () => [createTool('cut.revealTimeline')],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('cut.revealTimeline')).toBeUndefined();
    expect(result.providers[0]?.skipped[0]).toMatchObject({
      providerId: 'neko-cut',
      contributionKind: 'provider',
      reason: 'host-not-supported',
      host: 'tui',
    });
  });

  it('skips tools requiring VSCode while loading safe tools from the same provider', () => {
    const toolRegistry = new ToolRegistry();
    const loader = createTuiCapabilityLoader({
      toolRegistry,
      skillRegistry: new SkillRegistry(),
      toolGroupRegistry: new ToolGroupRegistry(),
      providerCardRegistry: new ProviderCardRegistry(),
    });

    const provider = createProvider({
      id: 'mixed',
      getTools: () => [
        createTool('safe.query', { isReadOnly: true }),
        createTool('editor.reveal', {
          metadata: {
            requirements: { vscode: true },
          } as never,
        }),
      ],
    });

    const result = loader.registerProviders([provider]);

    expect(toolRegistry.get('safe.query')).toBeDefined();
    expect(toolRegistry.get('editor.reveal')).toBeUndefined();
    expect(result.providers[0]?.skipped[0]).toMatchObject({
      contributionName: 'editor.reveal',
      reason: 'requires-vscode',
    });
  });
});
```

- [ ] **Step 2: Run loader tests and verify they fail**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
```

Expected: fail because `tui-capability-loader.ts` does not exist.

- [ ] **Step 3: Implement the minimal TUI capability loader**

Create `packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts`:

```ts
import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProvider,
  AgentCapabilityProviderAvailabilitySummary,
  AgentReferenceContributor,
  IProviderCardRegistry,
  ISkillRegistry,
  IToolRegistry,
  Tool,
  ToolGroup,
} from '@neko/shared';
import { CapabilityRegistryRuntime } from '@neko/agent/runtime';

interface ToolGroupRegistryLike {
  register(group: ToolGroup): void;
  unregister(name: string): void;
  listEnabled?(): ToolGroup[];
}

export interface TuiCapabilityLoaderOptions {
  readonly toolRegistry: IToolRegistry;
  readonly skillRegistry?: ISkillRegistry;
  readonly toolGroupRegistry?: ToolGroupRegistryLike;
  readonly providerCardRegistry?: Pick<IProviderCardRegistry, 'register' | 'unregister'>;
  readonly referenceContributors?: readonly AgentReferenceContributor[];
}

export interface TuiCapabilityLoaderResult {
  readonly providers: readonly AgentCapabilityProviderAvailabilitySummary[];
  readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
  readonly referenceContributors: readonly AgentReferenceContributor[];
  readonly promptFragments: readonly import('@neko/shared').PromptFragment[];
  readonly providerCardRegistry?: IProviderCardRegistry;
}

export interface TuiCapabilityLoader {
  registerProviders(providers: readonly AgentCapabilityProvider[]): TuiCapabilityLoaderResult;
  getDiagnostics(): readonly AgentCapabilityAvailabilityDiagnostic[];
  getProviderSummaries(): readonly AgentCapabilityProviderAvailabilitySummary[];
  getReferenceContributors(): readonly AgentReferenceContributor[];
}

export function createTuiCapabilityLoader(options: TuiCapabilityLoaderOptions): TuiCapabilityLoader {
  return new DefaultTuiCapabilityLoader(options);
}

class DefaultTuiCapabilityLoader implements TuiCapabilityLoader {
  private readonly diagnostics: AgentCapabilityAvailabilityDiagnostic[] = [];
  private readonly providerSummaries: AgentCapabilityProviderAvailabilitySummary[] = [];
  private readonly referenceContributors: AgentReferenceContributor[];
  private readonly promptFragments: import('@neko/shared').PromptFragment[] = [];

  constructor(private readonly options: TuiCapabilityLoaderOptions) {
    this.referenceContributors = [...(options.referenceContributors ?? [])];
  }

  registerProviders(providers: readonly AgentCapabilityProvider[]): TuiCapabilityLoaderResult {
    for (const provider of providers) {
      this.registerProvider(provider);
    }
    return this.snapshot();
  }

  getDiagnostics(): readonly AgentCapabilityAvailabilityDiagnostic[] {
    return this.diagnostics;
  }

  getProviderSummaries(): readonly AgentCapabilityProviderAvailabilitySummary[] {
    return this.providerSummaries;
  }

  getReferenceContributors(): readonly AgentReferenceContributor[] {
    return this.referenceContributors;
  }

  private registerProvider(provider: AgentCapabilityProvider): void {
    const providerSkip = getProviderSkipDiagnostic(provider);
    if (providerSkip) {
      this.diagnostics.push(providerSkip);
      this.providerSummaries.push({
        providerId: provider.id,
        version: provider.version,
        loaded: [],
        skipped: [providerSkip],
      });
      return;
    }

    const originalTools = provider.getTools({ extensionContext: null });
    const safeTools: Tool[] = [];
    const skipped: AgentCapabilityAvailabilityDiagnostic[] = [];
    for (const tool of originalTools) {
      const skip = getToolSkipDiagnostic(provider.id, tool);
      if (skip) {
        skipped.push(skip);
        this.diagnostics.push(skip);
      } else {
        safeTools.push(tool);
      }
    }

    this.promptFragments.push(...(provider.getPromptFragments?.({ extensionContext: null }) ?? []));
    const providerReferenceContributors =
      provider.getReferenceContributors?.({ extensionContext: null }) ?? [];
    this.referenceContributors.push(...providerReferenceContributors);

    const filteredProvider: AgentCapabilityProvider = {
      ...provider,
      getTools: () => safeTools,
    };
    const runtime = new CapabilityRegistryRuntime({
      toolRegistry: this.options.toolRegistry,
      ...(this.options.skillRegistry ? { skillRegistry: this.options.skillRegistry } : {}),
      ...(this.options.toolGroupRegistry ? { toolGroupRegistry: this.options.toolGroupRegistry } : {}),
      ...(this.options.providerCardRegistry
        ? { providerCardRegistry: this.options.providerCardRegistry }
        : {}),
    });

    runtime.registerProvider(filteredProvider, { extensionContext: null });

    this.providerSummaries.push({
      providerId: provider.id,
      version: provider.version,
      loaded: safeTools.map((tool) => ({ kind: 'tool', name: tool.name })),
      skipped,
    });
  }

  private snapshot(): TuiCapabilityLoaderResult {
    return {
      providers: this.providerSummaries,
      diagnostics: this.diagnostics,
      referenceContributors: this.referenceContributors,
      promptFragments: this.promptFragments,
      providerCardRegistry: this.options.providerCardRegistry as IProviderCardRegistry | undefined,
    };
  }
}

function getProviderSkipDiagnostic(
  provider: AgentCapabilityProvider,
): AgentCapabilityAvailabilityDiagnostic | null {
  const supportsTui = provider.hostRequirements?.some(
    (requirement) => requirement.host === 'tui' || requirement.host === 'cli',
  );
  if (supportsTui) return null;
  return {
    level: 'info',
    providerId: provider.id,
    contributionKind: 'provider',
    code: 'capability.provider.host-not-supported',
    reason: 'host-not-supported',
    message: `Provider "${provider.id}" is not declared as TUI-compatible.`,
    host: 'tui',
  };
}

function getToolSkipDiagnostic(
  providerId: string,
  tool: Tool,
): AgentCapabilityAvailabilityDiagnostic | null {
  const requirements = readToolRequirements(tool);
  if (requirements.vscode) {
    return createToolRequirementDiagnostic(providerId, tool.name, 'vscode', 'requires-vscode');
  }
  if (requirements.activeEditor) {
    return createToolRequirementDiagnostic(
      providerId,
      tool.name,
      'activeEditor',
      'requires-active-editor',
    );
  }
  return null;
}

function readToolRequirements(tool: Tool): Record<string, boolean> {
  const maybeMetadata = (tool as { metadata?: { requirements?: Record<string, boolean> } }).metadata;
  return maybeMetadata?.requirements ?? {};
}

function createToolRequirementDiagnostic(
  providerId: string,
  toolName: string,
  requirement: string,
  reason: string,
): AgentCapabilityAvailabilityDiagnostic {
  return {
    level: 'info',
    providerId,
    contributionKind: 'tool',
    contributionName: toolName,
    code: 'capability.tool.unavailable',
    reason,
    message: `Tool "${toolName}" is unavailable in TUI because it requires ${requirement}.`,
    requirement,
    host: 'tui',
  };
}
```

- [ ] **Step 4: Run loader tests and verify they pass**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
git commit -m "feat(agent-tui): add capability loader"
```

---

### Task 3: Wire capability runtime into TUI session bootstrap

**Files:**
- Modify: `packages/neko-agent/packages/cli-tui/src/core/runtime-bootstrap.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/core/runner.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts`

- [ ] **Step 1: Add failing runtime bootstrap test**

Append to `packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts`:

```ts
it('merges injected capability runtime bindings into CLI runtime', async () => {
  const { createCliAgentRuntime } = await import('../runtime-bootstrap');
  const { ToolGroupRegistry, SkillRegistry } = await import('@neko/agent');
  const toolGroupRegistry = new ToolGroupRegistry();
  const skillRegistry = new SkillRegistry();
  const taskManager = createFakeTaskManager();

  const runtime = createCliAgentRuntime({
    workspaceRoot: '/tmp/project',
    taskManager,
    capabilityRuntime: {
      toolGroupRegistry,
      skillRegistry,
      promptFragments: [
        {
          id: 'neko-story:fountain-syntax',
          content: 'Fountain syntax',
        },
      ],
    },
  });

  expect(runtime.capabilityRuntime?.toolGroupRegistry).toBe(toolGroupRegistry);
  expect(runtime.capabilityRuntime?.skillRegistry).toBe(skillRegistry);
  expect(runtime.capabilityRuntime?.promptFragments).toEqual([
    {
      id: 'neko-story:fountain-syntax',
      content: 'Fountain syntax',
    },
  ]);
});
```

If the test file does not already have `createFakeTaskManager`, add this helper at the top of the file:

```ts
function createFakeTaskManager() {
  return {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
    listTasks: vi.fn(() => []),
    cancelTask: vi.fn(),
    onDidChangeTask: vi.fn(() => ({ dispose: vi.fn() })),
  } as never;
}
```

- [ ] **Step 2: Run runtime bootstrap test and verify it fails**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts
```

Expected: fail because `CliAgentRuntimeConfig` does not accept `capabilityRuntime`.

- [ ] **Step 3: Update runtime bootstrap config**

Modify `packages/neko-agent/packages/cli-tui/src/core/runtime-bootstrap.ts`:

```ts
import type { IProjectMemoryManager } from '@neko/shared';
import type { ICapabilityRuntime } from '@neko/agent/runtime';
```

Extend `CliAgentRuntimeConfig`:

```ts
  readonly capabilityRuntime?: ICapabilityRuntime;
```

In `createCliAgentRuntime`, replace the `capabilityRuntime` block with:

```ts
    capabilityRuntime: {
      ...(config.capabilityRuntime ?? {}),
      ...(skillService
        ? {
            skillService,
            skillRegistry: skillService.registry,
          }
        : {}),
      ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
      toolGroupRegistry: config.capabilityRuntime?.toolGroupRegistry ?? toolGroupRegistry,
    },
```

- [ ] **Step 4: Wire loader result into session initialization**

In `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`, import:

```ts
import { createTuiCapabilityLoader } from '../core/tui-capability-loader';
```

After skill service and lifecycle runtime are created, create a loader:

```ts
        const capabilityLoader = createTuiCapabilityLoader({
          toolRegistry,
          skillRegistry: skillService.registry,
          toolGroupRegistry: createCliToolGroupRegistry(),
        });
        const capabilityLoadResult = capabilityLoader.registerProviders([]);
```

Pass `capabilityRuntime` into `createCliAgentRuntime` using the loader result fields:

```ts
            capabilityRuntime: {
              promptFragments: capabilityLoadResult.promptFragments,
              providerCardRegistry: capabilityLoadResult.providerCardRegistry,
            },
```

In `packages/neko-agent/packages/cli-tui/src/core/runner.ts`, create the loader only where a `ToolRegistry` exists. Non-Ink sessions without injected providers should pass an empty `promptFragments: []` capability runtime rather than importing feature packages.

- [ ] **Step 5: Run runtime bootstrap tests**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/core/runtime-bootstrap.ts \
  packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts \
  packages/neko-agent/packages/cli-tui/src/core/runner.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/runtime-bootstrap.test.ts
git commit -m "feat(agent-tui): wire capability runtime"
```

---

### Task 4: Add `/capability` command family

**Files:**
- Modify: `packages/neko-agent/packages/cli-tui/src/core/tui-command-router.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/core/slash-command-catalog.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts`

- [ ] **Step 1: Add failing command router tests**

Append to `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts`:

```ts
it('formats /capability list from capability summaries', async () => {
  const context = createContext({
    capability: {
      providers: [
        {
          providerId: 'neko-assets',
          version: '1.0.0',
          loaded: [{ kind: 'tool', name: 'assets.list' }],
          skipped: [],
        },
      ],
      diagnostics: [],
    },
  });

  const result = await handleTuiControlCommand('/capability list', context);

  expect(result.output).toContain('neko-assets');
  expect(result.output).toContain('1 loaded');
  expect(result.output).toContain('0 skipped');
});

it('formats /capability show provider diagnostics', async () => {
  const context = createContext({
    capability: {
      providers: [
        {
          providerId: 'neko-cut',
          version: '1.0.0',
          loaded: [],
          skipped: [
            {
              level: 'info',
              providerId: 'neko-cut',
              contributionKind: 'provider',
              code: 'capability.provider.host-not-supported',
              reason: 'host-not-supported',
              message: 'Provider "neko-cut" is not declared as TUI-compatible.',
              host: 'tui',
            },
          ],
        },
      ],
      diagnostics: [],
    },
  });

  const result = await handleTuiControlCommand('/capability show neko-cut', context);

  expect(result.output).toContain('neko-cut');
  expect(result.output).toContain('host-not-supported');
});
```

Extend the `createContext` helper override type in the same test file with:

```ts
readonly capability?: import('../tui-command-router').TuiCapabilitySnapshot;
```

Add this port in the returned `ports` object:

```ts
capability: overrides.capability
  ? { list: vi.fn(() => overrides.capability!) }
  : undefined,
```

- [ ] **Step 2: Add failing slash catalog test**

Append to `packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts`:

```ts
it('includes the capability command family', () => {
  const commands = createTuiSlashCommandCatalog();
  expect(commands.some((command) => command.name === '/capability')).toBe(true);
});
```

- [ ] **Step 3: Run command tests and verify they fail**

Run:

```bash
pnpm --filter @neko/cli vitest --run \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts
```

Expected: fail because `/capability` is unknown.

- [ ] **Step 4: Add router port and handlers**

In `packages/neko-agent/packages/cli-tui/src/core/tui-command-router.ts`, add a capability port:

```ts
export interface TuiCapabilitySnapshot {
  readonly providers: readonly import('@neko/shared').AgentCapabilityProviderAvailabilitySummary[];
  readonly diagnostics: readonly import('@neko/shared').AgentCapabilityAvailabilityDiagnostic[];
}
```

Add to the router ports interface:

```ts
readonly capability?: {
  readonly list: () => TuiCapabilitySnapshot;
};
```

Handle command in the existing `switch (commandName)`:

```ts
    case 'capability':
      return handleCapabilityCommand(commandText, context);
```

Add helper:

```ts
function handleCapabilityCommand(
  input: string,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  const args = input.slice('/capability'.length).trim().split(/\s+/).filter(Boolean);
  const snapshot = context.ports.capability?.list();
  if (!snapshot) {
    return handled({ error: 'Capability runtime is not available in this TUI session.' });
  }

  const subcommand = args[0] ?? 'list';
  if (subcommand === 'list') {
    const lines = snapshot.providers.map((provider) => {
      return `${provider.providerId} ${provider.version ?? ''} - ${provider.loaded.length} loaded, ${provider.skipped.length} skipped`;
    });
    return handled({
      output: lines.length > 0 ? lines.join('
') : 'No capability providers loaded.',
    });
  }

  if (subcommand === 'show') {
    const providerId = args[1];
    if (!providerId) {
      return handled({ error: 'Usage: /capability show <provider>' });
    }
    const provider = snapshot.providers.find((candidate) => candidate.providerId === providerId);
    if (!provider) {
      return handled({ error: `Capability provider not found: ${providerId}` });
    }
    const loaded = provider.loaded.map((item) => `loaded ${item.kind}: ${item.name}`);
    const skipped = provider.skipped.map(
      (item) =>
        `skipped ${item.contributionKind}: ${item.contributionName ?? provider.providerId} (${item.reason})`,
    );
    return handled({
      output: [`${provider.providerId} ${provider.version ?? ''}`, ...loaded, ...skipped].join(
        '
',
      ),
    });
  }

  if (subcommand === 'tools') {
    const providerId = args[1];
    const providers = providerId
      ? snapshot.providers.filter((provider) => provider.providerId === providerId)
      : snapshot.providers;
    const tools = providers.flatMap((provider) =>
      provider.loaded
        .filter((item) => item.kind === 'tool')
        .map((item) => `${provider.providerId}: ${item.name}`),
    );
    return handled({
      output: tools.length > 0 ? tools.join('
') : 'No TUI capability tools loaded.',
    });
  }

  return handled({ error: 'Usage: /capability list | show <provider> | tools [provider]' });
}
```

- [ ] **Step 5: Add slash catalog entry**

In `packages/neko-agent/packages/cli-tui/src/core/slash-command-catalog.ts`, add:

```ts
{
  name: '/capability',
  description: 'List TUI capability providers, tools, and unavailable reasons',
  usage: '/capability list | show <provider> | tools [provider]',
}
```

Use the local field names if catalog entries use `label`, `value`, or `detail` instead of `name`, `description`, and `usage`.

- [ ] **Step 6: Run command tests and verify they pass**

Run:

```bash
pnpm --filter @neko/cli vitest --run \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/core/tui-command-router.ts \
  packages/neko-agent/packages/cli-tui/src/core/slash-command-catalog.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-command-router.test.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/slash-command-catalog.test.ts
git commit -m "feat(agent-tui): add capability commands"
```

---

### Task 5: Add terminal-safe reference contributor aggregation

**Files:**
- Create: `packages/neko-agent/packages/cli-tui/src/core/tui-reference-contributors.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts`

- [ ] **Step 1: Add failing reference aggregation tests**

Append to `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts`:

```ts
it('includes candidates from registered reference contributors', async () => {
  const suggestions = await createTuiReferenceSuggestions({
    query: 'hero',
    workspaceRoot: '/workspace',
    contributors: [
      {
        id: 'neko-assets',
        displayName: 'Assets',
        search: async () => ({
          candidates: [
            {
              id: 'asset:hero',
              label: 'Hero',
              source: 'assets',
              kind: 'asset',
              insertText: '@asset:hero',
              description: 'Main character',
            },
          ],
          diagnostics: [],
        }),
      },
    ],
  });

  expect(suggestions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: 'Hero',
        insertText: '@asset:hero',
      }),
    ]),
  );
});
```

Adapt the call shape to the existing `createTuiReferenceSuggestions` signature while preserving `contributors` as an explicit input.

- [ ] **Step 2: Run reference suggestion test and verify it fails**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts
```

Expected: fail because contributors are ignored.

- [ ] **Step 3: Add reference contributor aggregator**

Create `packages/neko-agent/packages/cli-tui/src/core/tui-reference-contributors.ts`:

```ts
import type {
  AgentReferenceCandidate,
  AgentReferenceContributor,
} from '@neko/shared';

export interface TuiReferenceContributorSearchInput {
  readonly query: string;
  readonly limit: number;
  readonly workspaceRoot?: string;
  readonly contributors: readonly AgentReferenceContributor[];
}

export async function searchTuiReferenceContributors(
  input: TuiReferenceContributorSearchInput,
): Promise<readonly AgentReferenceCandidate[]> {
  const candidates: AgentReferenceCandidate[] = [];
  for (const contributor of input.contributors) {
    const result = await contributor.search({
      query: input.query,
      limit: input.limit,
      workspaceRoot: input.workspaceRoot,
    });
    candidates.push(...result.candidates);
  }
  return candidates.slice(0, input.limit);
}
```

- [ ] **Step 4: Wire contributors into reference suggestions**

In `packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.ts`, add `contributors?: readonly AgentReferenceContributor[]` to the options type and merge results:

```ts
const contributorCandidates = options.contributors?.length
  ? await searchTuiReferenceContributors({
      query: options.query,
      limit: options.limit ?? 20,
      workspaceRoot: options.workspaceRoot,
      contributors: options.contributors,
    })
  : [];
```

Map contributor candidates into the local suggestion shape:

```ts
const contributorSuggestions = contributorCandidates.map((candidate) => ({
  id: candidate.id,
  label: candidate.label,
  detail: candidate.description ?? candidate.source,
  insertText: candidate.insertText,
  kind: candidate.kind,
}));
```

Return filesystem suggestions plus contributor suggestions, preserving the existing limit.

- [ ] **Step 5: Run reference suggestion test and verify it passes**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/core/tui-reference-contributors.ts \
  packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.ts \
  packages/neko-agent/packages/cli-tui/src/components/Input/reference-suggestions.test.ts
git commit -m "feat(agent-tui): aggregate reference contributors"
```

---

### Task 6: Extract `neko-assets` headless provider and reference contributor

**Files:**
- Create: `packages/neko-assets/src/agentHeadlessCapabilityProvider.ts`
- Modify: `packages/neko-assets/src/agentCapabilityProvider.ts`
- Test: `packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts`

- [ ] **Step 1: Write failing assets headless provider tests**

Create `packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNekoAssetsHeadlessCapabilityProvider } from '../agentHeadlessCapabilityProvider';

function createApi() {
  return {
    getAllEntities: async () => [
      {
        id: 'asset-hero',
        name: 'Hero',
        category: 'character',
        description: 'Main character',
        tags: ['hero'],
        aliases: [],
        variants: [],
      },
    ],
  };
}

describe('createNekoAssetsHeadlessCapabilityProvider', () => {
  it('declares TUI support and exposes read-only asset tools', () => {
    const provider = createNekoAssetsHeadlessCapabilityProvider(createApi() as never);

    expect(provider.hostRequirements).toEqual([{ host: 'tui' }, { host: 'cli' }]);
    expect(provider.getTools({ extensionContext: null }).map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['assets.list', 'assets.get']),
    );
    expect(provider.getTools({ extensionContext: null }).every((tool) => tool.isReadOnly)).toBe(
      true,
    );
  });

  it('provides terminal-safe asset references', async () => {
    const provider = createNekoAssetsHeadlessCapabilityProvider(createApi() as never);
    const contributor = provider.getReferenceContributors?.({ extensionContext: null })?.[0];

    await expect(contributor?.search({ query: 'hero', limit: 10 })).resolves.toMatchObject({
      candidates: [
        {
          id: 'asset-hero',
          label: 'Hero',
          kind: 'asset',
          insertText: '@asset:asset-hero',
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run assets test and verify it fails**

Run:

```bash
pnpm --filter neko-assets vitest --run packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts
```

Expected: fail because `agentHeadlessCapabilityProvider.ts` does not exist.

- [ ] **Step 3: Implement headless assets provider**

Create `packages/neko-assets/src/agentHeadlessCapabilityProvider.ts` by moving the read-only list/get logic from `agentCapabilityProvider.ts` and exporting:

```ts
import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  AgentReferenceContributor,
  NekoAssetsAPI,
  Tool,
} from '@neko/shared';

export function createNekoAssetsHeadlessCapabilityProvider(
  api: Pick<NekoAssetsAPI, 'getAllEntities'>,
): AgentCapabilityProvider & {
  getReferenceContributors?(context: AgentCapabilityContext): readonly AgentReferenceContributor[];
} {
  return {
    id: 'neko-assets',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }, { host: 'cli' }],
    getTools: () => createReadOnlyAssetTools(api),
    getReferenceContributors: () => [createAssetReferenceContributor(api)],
  };
}

function createReadOnlyAssetTools(api: Pick<NekoAssetsAPI, 'getAllEntities'>): Tool[] {
  return [
    {
      name: 'assets.list',
      description: 'List compact asset library summaries.',
      category: 'file',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer' },
        },
      },
      execute: async (args) => {
        const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
        const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(args.limit, 200)) : 50;
        const entities = await api.getAllEntities();
        const assets = entities
          .filter((entity) => entity.name.toLowerCase().includes(query))
          .slice(0, limit)
          .map((entity) => ({
            id: entity.id,
            name: entity.name,
            category: entity.category,
            description: entity.description,
            tags: entity.tags,
          }));
        return { success: true, data: { assets, total: assets.length } };
      },
    },
    {
      name: 'assets.get',
      description: 'Get one asset entity by stable ID.',
      category: 'file',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
        },
        required: ['assetId'],
      },
      execute: async (args) => {
        const assetId = typeof args.assetId === 'string' ? args.assetId : '';
        const asset = (await api.getAllEntities()).find((entity) => entity.id === assetId);
        if (!asset) return { success: false, error: `Asset not found: ${assetId}` };
        return { success: true, data: { asset } };
      },
    },
  ];
}

function createAssetReferenceContributor(
  api: Pick<NekoAssetsAPI, 'getAllEntities'>,
): AgentReferenceContributor {
  return {
    id: 'neko-assets',
    displayName: 'Assets',
    search: async ({ query, limit }) => {
      const normalized = query.trim().toLowerCase();
      const entities = await api.getAllEntities();
      const candidates = entities
        .filter((entity) => {
          if (!normalized) return true;
          return [
            entity.name,
            entity.description,
            ...(entity.tags ?? []),
            ...(entity.aliases ?? []),
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase()
            .includes(normalized);
        })
        .slice(0, limit)
        .map((entity) => ({
          id: entity.id,
          label: entity.name,
          source: 'assets',
          kind: 'asset' as const,
          insertText: `@asset:${entity.id}`,
          description: entity.description,
          metadata: {
            category: entity.category,
          },
        }));
      return { candidates, diagnostics: [] };
    },
  };
}
```

- [ ] **Step 4: Reuse headless provider in extension provider**

In `packages/neko-assets/src/agentCapabilityProvider.ts`, import `createNekoAssetsHeadlessCapabilityProvider`. Keep the existing import/mutation tool in this file, but reuse read-only tools from the headless provider:

```ts
const headless = createNekoAssetsHeadlessCapabilityProvider(this.api);
const readOnlyTools = headless.getTools(_context);
return [...readOnlyTools, importAssetTool];
```

Do not remove confirmation gating from `IMPORT_ASSET`.

- [ ] **Step 5: Run assets provider tests**

Run:

```bash
pnpm --filter neko-assets vitest --run \
  packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts \
  packages/neko-assets/src/__tests__/agentCapabilityProvider.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/neko-assets/src/agentHeadlessCapabilityProvider.ts \
  packages/neko-assets/src/agentCapabilityProvider.ts \
  packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts
git commit -m "feat(assets): add headless agent provider"
```

---

### Task 7: Extract `neko-story` headless provider

**Files:**
- Create: `packages/neko-story/src/agentHeadlessCapabilityProvider.ts`
- Modify: `packages/neko-story/packages/extension/src/agentCapabilityProvider.ts`
- Test: `packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts`

- [ ] **Step 1: Write failing story headless provider tests**

Create `packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createNekoStoryHeadlessCapabilityProvider } from '../agentHeadlessCapabilityProvider';

function createApi() {
  return {
    getScriptIndex: () => ({
      scenes: [
        {
          id: 'scene-1',
          heading: 'INT. STUDIO - DAY',
          line_start: 0,
          line_end: 4,
        },
      ],
      characters: [],
    }),
  };
}

describe('createNekoStoryHeadlessCapabilityProvider', () => {
  it('declares TUI support and exposes read-only story tools', () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(createApi() as never);

    expect(provider.hostRequirements).toEqual([{ host: 'tui' }, { host: 'cli' }]);
    expect(provider.getTools({ extensionContext: null }).every((tool) => tool.isReadOnly)).toBe(
      true,
    );
  });

  it('contributes Fountain prompt fragments', () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(createApi() as never);
    const fragments = provider.getPromptFragments?.({ extensionContext: null }) ?? [];

    expect(fragments.some((fragment) => fragment.id === 'neko-story:fountain-syntax')).toBe(true);
  });
});
```

- [ ] **Step 2: Run story test and verify it fails**

Run:

```bash
pnpm --filter neko-story exec vitest --run packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts
```

Expected: fail because the provider file does not exist.

- [ ] **Step 3: Implement story headless provider**

Create `packages/neko-story/src/agentHeadlessCapabilityProvider.ts`:

```ts
import type {
  AgentCapabilityProvider,
  AgentCapabilityContext,
  NekoStoryAPI,
  PromptFragment,
  Tool,
} from '@neko/shared';
import { TOOL_NAMES_STORY } from '@neko/shared';

export function createNekoStoryHeadlessCapabilityProvider(
  api: Pick<NekoStoryAPI, 'getScriptIndex'>,
): AgentCapabilityProvider {
  return {
    id: 'neko-story',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }, { host: 'cli' }],
    getTools: () => createStoryReadOnlyTools(api),
    getPromptFragments: () => createStoryPromptFragments(),
  };
}

function createStoryReadOnlyTools(api: Pick<NekoStoryAPI, 'getScriptIndex'>): Tool[] {
  return [
    {
      name: TOOL_NAMES_STORY.GET_SCRIPT_INDEX,
      description: 'Get a structured index of a Fountain screenplay file.',
      category: 'document',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      execute: async (args) => {
        const filePath = typeof args.path === 'string' ? args.path : '';
        const index = api.getScriptIndex(filePath);
        if (!index) return { success: false, error: `Script not indexed: ${filePath}` };
        return { success: true, data: index };
      },
    },
  ];
}

function createStoryPromptFragments(): PromptFragment[] {
  return [
    {
      id: 'neko-story:fountain-syntax',
      content: [
        '## Fountain Syntax Reference (neko-story)',
        'Scene headings use INT./EXT./EST./I/E. LOCATION - TIME.',
        'CJK scene headings may use 内景, 外景, 内外景, and localized time labels.',
        'Character cues may use ALL CAPS, CJK names, or @ forced character syntax.',
      ].join('\n'),
    },
  ];
}
```

- [ ] **Step 4: Reuse headless provider in story extension provider**

In `packages/neko-story/packages/extension/src/agentCapabilityProvider.ts`, import `createNekoStoryHeadlessCapabilityProvider` and reuse its prompt fragments and read-only base tools where matching behavior is identical. Keep semantic search and VSCode-dependent logic in the extension provider until it can be made host-agnostic.

Use this pattern:

```ts
const headless = createNekoStoryHeadlessCapabilityProvider(api);
const baseTools = headless.getTools(context);
const extensionOnlyTools = createExtensionOnlyStoryTools(api, context);
return [...baseTools, ...extensionOnlyTools];
```

If existing code is not factored for `createExtensionOnlyStoryTools`, keep the existing tool array and only delegate `getPromptFragments` in this task:

```ts
getPromptFragments(context: AgentCapabilityContext): PromptFragment[] {
  return createNekoStoryHeadlessCapabilityProvider(this._api).getPromptFragments?.(context) ?? [];
}
```

- [ ] **Step 5: Run story provider tests**

Run:

```bash
pnpm --filter neko-story exec vitest --run \
  packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/neko-story/src/agentHeadlessCapabilityProvider.ts \
  packages/neko-story/packages/extension/src/agentCapabilityProvider.ts \
  packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts
git commit -m "feat(story): add headless agent provider"
```

---

### Task 8: Expose host-agnostic provider injection to TUI sessions

**Files:**
- Modify: `packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`
- Modify: `packages/neko-agent/packages/cli-tui/src/core/runner.ts`
- Test: `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts`

- [ ] **Step 1: Add failing provider injection test**

Append to `packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts`:

```ts
it('registers externally supplied TUI-safe providers without static feature-package imports', () => {
  const toolRegistry = new ToolRegistry();
  const loader = createTuiCapabilityLoader({
    toolRegistry,
    skillRegistry: new SkillRegistry(),
    toolGroupRegistry: new ToolGroupRegistry(),
    providerCardRegistry: new ProviderCardRegistry(),
  });

  const result = loader.registerProviders([
    createProvider({
      id: 'neko-assets',
      getTools: () => [createTool('assets.list', { isReadOnly: true })],
    }),
    createProvider({
      id: 'neko-story',
      getTools: () => [createTool('story.getScriptIndex', { isReadOnly: true })],
    }),
  ]);

  expect(result.providers.map((provider) => provider.providerId)).toEqual([
    'neko-assets',
    'neko-story',
  ]);
  expect(toolRegistry.get('assets.list')).toBeDefined();
  expect(toolRegistry.get('story.getScriptIndex')).toBeDefined();
});
```

- [ ] **Step 2: Run loader tests and verify failure**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
```

Expected: fail until the loader result can be retained and surfaced as a session port.

- [ ] **Step 3: Add provider injection options to the TUI session hook**

In `packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts`, extend `UseAgentSessionOptions`:

```ts
  readonly capabilityProviders?: readonly import('@neko/shared').AgentCapabilityProvider[];
  readonly referenceContributors?: readonly import('@neko/shared').AgentReferenceContributor[];
```

After creating `toolRegistry`, `skillService`, and `skillLifecycleRuntime`, register injected providers:

```ts
        const capabilityLoader = createTuiCapabilityLoader({
          toolRegistry,
          skillRegistry: skillService.registry,
          toolGroupRegistry: createCliToolGroupRegistry(),
          referenceContributors: options.referenceContributors,
        });
        const capabilityLoadResult = capabilityLoader.registerProviders(
          options.capabilityProviders ?? [],
        );
```

Store `capabilityLoadResult` in a `useRef`:

```ts
  const capabilitySnapshotRef = useRef<TuiCapabilityLoaderResult | null>(null);
```

Assign it after registration:

```ts
        capabilitySnapshotRef.current = capabilityLoadResult;
```

Expose it through the session handle:

```ts
  readonly listCapabilities: () => TuiCapabilityLoaderResult | null;
```

and return:

```ts
  const listCapabilities = useCallback(() => capabilitySnapshotRef.current, []);
```

- [ ] **Step 4: Keep non-Ink runner host-agnostic**

In `packages/neko-agent/packages/cli-tui/src/core/runner.ts`, do not import feature packages. If the runner constructs a TUI command context, pass `listCapabilities` only when a `TuiCapabilityLoaderResult` exists. Standalone runner sessions without injected providers should return an empty capability snapshot:

```ts
const emptyCapabilitySnapshot = {
  providers: [],
  diagnostics: [],
  referenceContributors: [],
};
```

- [ ] **Step 5: Run loader tests**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/core/tui-capability-loader.ts \
  packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts \
  packages/neko-agent/packages/cli-tui/src/core/runner.ts \
  packages/neko-agent/packages/cli-tui/src/core/__tests__/tui-capability-loader.test.ts
git commit -m "feat(agent-tui): expose capability provider injection"
```

---

### Task 9: Add architecture boundary guards

**Files:**
- Modify: `packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx`

- [ ] **Step 1: Add failing architecture guard tests**

Append to `packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TUI capability architecture boundaries', () => {
  it('does not import vscode or feature extension implementations from cli-tui source', () => {
    const root = join(process.cwd(), 'packages/neko-agent/packages/cli-tui/src');
    const files = listSourceFiles(root);
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        /from ['"]vscode['"]/.test(source) ||
        /packages\/[^'"]+\/extension/.test(source) ||
        /@neko\/[^'"]+\/extension/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });

  it('keeps first-slice headless providers free of vscode imports', () => {
    const files = [
      join(process.cwd(), 'packages/neko-assets/src/agentHeadlessCapabilityProvider.ts'),
      join(process.cwd(), 'packages/neko-story/src/agentHeadlessCapabilityProvider.ts'),
    ];
    const offenders = files.filter((file) => /from ['"]vscode['"]/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });
});

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(absolute));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(absolute);
    }
  }
  return files;
}
```

- [ ] **Step 2: Run audit test and verify it passes or exposes real offenders**

Run:

```bash
pnpm --filter @neko/cli vitest --run packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx
```

Expected: pass. If it fails, remove the offending TUI import by replacing it with a shared contract or local adapter.

- [ ] **Step 3: Commit**

```bash
git add packages/neko-agent/packages/cli-tui/src/__tests__/tui-feature-audit.test.tsx
git commit -m "test(agent-tui): guard capability boundaries"
```

---

### Task 10: Final focused validation

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused TUI tests**

Run:

```bash
pnpm --filter @neko/cli vitest --run
```

Expected: pass. Record failing test names and error summaries if failures are unrelated existing issues.

- [ ] **Step 2: Run focused Agent runtime tests**

Run:

```bash
pnpm --filter @neko/agent vitest --run packages/neko-agent/packages/agent/src/runtime/__tests__/capability-registry-runtime.test.ts
```

Expected: pass.

- [ ] **Step 3: Run provider tests**

Run:

```bash
pnpm --filter neko-assets vitest --run packages/neko-assets/src/__tests__/agentHeadlessCapabilityProvider.test.ts
pnpm --filter neko-story exec vitest --run packages/neko-story/src/__tests__/agentHeadlessCapabilityProvider.test.ts
```

Expected: pass.

- [ ] **Step 4: Run type/check gate**

Run:

```bash
pnpm check
```

Expected: pass. If blocked by `ERR_PNPM_IGNORED_BUILDS`, record the exact blocker and run:

```bash
pnpm --filter @neko/cli exec tsc --noEmit
pnpm --filter @neko/shared exec tsc --noEmit
```

- [ ] **Step 5: Final commit if validation docs changed**

If validation notes were added to a change/task document, commit them:

```bash
git add docs/superpowers/plans/2026-07-01-tui-host-agnostic-capability-discovery.md
git commit -m "docs(agent-tui): record capability validation"
```

---

## Plan Self-Review

- Spec coverage: The plan covers shared metadata, TUI loader, runtime wiring, `/capability`, `@` contributors, assets/story proving slice, architecture guards, and validation.
- Scope: The plan intentionally defers Canvas/Audio provider migration and hostless engine bridge until the first two provider slices prove the contract.
- Placeholder scan: No TBD/TODO placeholders are used as requirements. Deferred work has explicit scope decisions and is not required for acceptance.
- Type consistency: Shared type names are introduced in Task 1 and reused consistently by loader, command router, and reference aggregation tasks.
