import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import type {
  CreativeEntityRef,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySource,
  NpcEvaluationReport,
  NpcEvaluationSuggestion,
  NpcProfileSource,
} from '@neko/shared';
import type { OpenTab } from '@neko-agent/types';
import {
  createDefaultNpcProfileAssembler,
  createPlatformNpcResponder,
  defaultEnrichNpcProfile,
  NpcTestBenchController,
  parseNpcSlashArgs,
} from '../npcTestBenchController';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

beforeEach(() => {
  vi.mocked(vscode.workspace.fs.createDirectory).mockClear();
  vi.mocked(vscode.workspace.fs.writeFile).mockClear();
  vi.mocked(vscode.workspace.fs.readFile).mockReset();
  vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('not found'));
  vi.mocked(vscode.commands.executeCommand).mockReset();
  vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  vi.mocked(vscode.window.showInformationMessage).mockReset();
  vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
  vi.mocked(vscode.window.showQuickPick).mockReset();
  vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
});

const entityRef: CreativeEntityRef = {
  entityId: 'char-xiaoju',
  entityKind: 'character',
  projectRoot: '/workspace/project-a',
  source: 'neko-entity',
};

const profile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: ['Xiaoju'],
  facts: [
    {
      key: 'identity.name',
      value: '小橘',
      source: 'registry',
      authority: 'confirmed',
    },
    {
      key: 'metadata.role',
      value: 'protagonist',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'partial',
};

const thinProfile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: [],
  facts: [
    {
      key: 'identity.name',
      value: '小橘',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'thin',
};

const thinProfileWithEvidence: NpcProfileSource = {
  ...thinProfile,
  dialogueSamples: ['小橘：我先看看。'],
  sceneAppearances: ['cases/test.fountain:8'],
  relationships: [
    {
      key: 'relationship.char-ahui.friend',
      value: {
        name: 'char-ahui',
        relation: 'friend',
        entityRef: {
          entityId: 'char-ahui',
          entityKind: 'character',
          projectRoot: '/workspace/project-a',
          source: 'neko-story',
        },
      },
      source: 'relationship-graph',
      authority: 'confirmed',
      sourceRef: 'story://cases/test.fountain:8',
    },
  ],
};

const evaluation: NpcEvaluationReport = {
  version: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  entityRef,
  summary: 'consistent',
  scores: [{ dimension: 'persona-consistency', score: 1 }],
  findings: [],
  suggestions: [],
};

function createHarness(
  overrides: Partial<ConstructorParameters<typeof NpcTestBenchController>[0]> = {},
) {
  let tabState: { openTabs: readonly OpenTab[]; activeTabId: string | null } = {
    openTabs: [],
    activeTabId: null,
  };
  const webview = vscode.createMockWebview();
  const responder = vi.fn(async ({ userMessage }) => ({
    content: `NPC:${userMessage.content}`,
    metadata: { runtime: 'test' },
  }));
  const assembler = {
    assembleProfile: vi.fn(async () => ({ status: 'assembled' as const, profile })),
  };
  const updateTabState = vi.fn((openTabs: OpenTab[], activeTabId: string | null) => {
    tabState = { openTabs, activeTabId };
  });
  const controller = new NpcTestBenchController({
    getWebview: () => webview as never,
    getProjectRoot: () => '/workspace/project-a',
    createAssembler: vi.fn(() => assembler),
    createResponder: vi.fn(() => responder),
    getTabState: () => tabState,
    updateTabState,
    sendTabState: vi.fn(),
    now: () => '2026-06-01T00:00:00.000Z',
    createSessionId: () => 'npc-session-1',
    createMessageId: (role, turnIndex) => `msg-${turnIndex}-${role}`,
    logger: { warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  });

  return { assembler, controller, responder, tabState: () => tabState, updateTabState, webview };
}

function createDashboardSource(
  source: string,
  detail: DashboardCreativeEntityDetail,
  rows: readonly DashboardCreativeEntityRow[] = [],
): DashboardCreativeEntitySource {
  return {
    contractVersion: 1,
    source,
    sourceDisplayName: source,
    capabilities: { detail: true, actions: [], syncSuggestions: true },
    getSnapshot: vi.fn(async () => ({
      source,
      sourceDisplayName: source,
      status: {
        source,
        sourceDisplayName: source,
        available: true,
        freshness: 'fresh',
        entityCount: 1,
      },
      rows,
      freshness: 'fresh',
      updatedAt: '2026-06-01T00:00:00.000Z',
    })),
    getDetail: vi.fn(async () => detail),
    executeAction: vi.fn(async (request) => ({
      ok: true,
      refresh: false,
      ref: request.ref,
    })),
    onDidChangeEntity: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

describe('NpcTestBenchController', () => {
  it('launches a project-scoped NPC session with a deterministic profile projection', async () => {
    const harness = createHarness();

    const result = await harness.controller.launch({ entityRef, source: 'dashboard' });

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: 'npc-session-1',
        session: expect.objectContaining({
          displayName: '小橘',
          projectRoot: '/workspace/project-a',
          startedAt: '2026-06-01T00:00:00.000Z',
          status: 'active',
        }),
      }),
    );
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
    expect(harness.tabState().openTabs).toEqual([
      expect.objectContaining({
        conversationId: 'npc-session-1',
        kind: 'npc-test',
        npcSession: expect.objectContaining({ profile }),
      }),
    ]);
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'npcSessionStarted',
        session: expect.objectContaining({ sessionId: 'npc-session-1' }),
      }),
    );
  });

  it('reports unresolved entities without creating a session', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'missing-entity' as const,
          entityRef,
          reason: 'Creative entity not found: char-xiaoju',
        })),
      }),
    });

    await expect(harness.controller.launch({ entityRef })).resolves.toBeNull();

    expect(harness.controller.hasSession('npc-session-1')).toBe(false);
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Creative entity not found: char-xiaoju',
    });
  });

  it('routes NPC turns through session memory and webview streaming messages', async () => {
    const harness = createHarness();
    await harness.controller.launch({ entityRef });

    await expect(harness.controller.routeUserMessage('npc-session-1', 'hello')).resolves.toBe(true);

    expect(harness.responder).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'npc-session-1',
        config: expect.objectContaining({ toolPolicy: { kind: 'none' } }),
        userMessage: expect.objectContaining({ content: 'hello' }),
      }),
    );
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'thinking',
      conversationId: 'npc-session-1',
    });
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'streamText',
      conversationId: 'npc-session-1',
      messageId: 'msg-1-npc',
      content: 'NPC:hello',
    });
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'streamComplete',
      conversationId: 'npc-session-1',
      messageId: 'msg-1-npc',
    });
  });

  it('extracts transcript on exit and marks the NPC tab as exited', async () => {
    const harness = createHarness();
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(result?.artifact).toEqual(
      expect.objectContaining({
        version: 1,
        entityRef,
        profileSnapshot: profile,
        transcript: [
          expect.objectContaining({ role: 'user', content: 'hello' }),
          expect.objectContaining({ role: 'npc', content: 'NPC:hello' }),
        ],
      }),
    );
    expect(harness.controller.hasSession('npc-session-1')).toBe(false);
    expect(harness.tabState().openTabs[0]?.npcSession?.status).toBe('exited');
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'npcSessionExited',
        sessionId: 'npc-session-1',
        artifact: expect.objectContaining({ sessionId: 'npc-session-1' }),
      }),
    );
  });

  it('evaluates and saves NPC artifacts under the project-local npc-tests folder', async () => {
    const evaluateTranscript = vi.fn(async () => evaluation);
    const saveTranscriptArtifact = vi.fn(async ({ artifact }) => ({
      path: `.neko/npc-tests/${artifact.entityRef.entityId}-2026-06-01T00-00-00-000Z.json`,
    }));
    const harness = createHarness({
      evaluateTranscript,
      chooseSavePolicy: vi.fn(async () => 'always'),
      saveTranscriptArtifact,
    });
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(evaluateTranscript).toHaveBeenCalledWith({
      artifact: expect.objectContaining({
        entityRef,
        profileSnapshot: profile,
        transcript: expect.arrayContaining([expect.objectContaining({ content: 'hello' })]),
      }),
      projectRoot: '/workspace/project-a',
    });
    expect(saveTranscriptArtifact).toHaveBeenCalledWith({
      artifact: expect.objectContaining({ evaluation }),
      projectRoot: '/workspace/project-a',
    });
    expect(result?.artifact.evaluation).toEqual(evaluation);
    expect(result?.savedPath).toBe('.neko/npc-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json');
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'npcSessionExited',
        savedPath: '.neko/npc-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
      }),
    );
  });

  it('uses the default project-local save path when the user keeps validation evidence', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Save' as never);
    const harness = createHarness({ evaluateTranscript: vi.fn(async () => evaluation) });
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: '/workspace/project-a/.neko/npc-tests',
      }),
    );
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: '/workspace/project-a/.neko/npc-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
      }),
      expect.any(Buffer),
    );
    expect(result?.savedPath).toBe('.neko/npc-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json');
  });

  it('handles thin profiles with project enrichment and manual supplement before launch', async () => {
    const enrichedProfile: NpcProfileSource = {
      ...thinProfile,
      facts: [
        ...thinProfile.facts,
        {
          key: 'speech.sample',
          value: '我先看看',
          source: 'script-extraction',
          authority: 'suggested',
        },
      ],
      dialogueSamples: ['小橘：我先看看。'],
      sparsity: 'partial',
    };
    const enrichProfile = vi.fn(async () => ({ profile: enrichedProfile }));
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      enrichProfile,
    });

    const result = await harness.controller.launch({
      entityRef,
      enrichment: 'auto',
      source: 'dashboard',
    });

    expect(enrichProfile).toHaveBeenCalledWith({
      projectRoot: '/workspace/project-a',
      profile: thinProfile,
      request: expect.objectContaining({ enrichment: 'auto' }),
    });
    expect(result?.session.profile).toEqual(enrichedProfile);

    const manualHarness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      promptUserSupplement: vi.fn(async () => 'speaks softly'),
    });
    const manualResult = await manualHarness.controller.launch({
      entityRef,
      enrichment: 'manual',
    });

    expect(manualResult?.session.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'userSupplement.notes',
          value: 'speaks softly',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('skips thin profile prompts for Dashboard NPC tests by default', async () => {
    const chooseThinProfileAction = vi.fn(async () => 'manual-supplement' as const);
    const promptUserSupplement = vi.fn(async () => 'should not be used');
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      chooseThinProfileAction,
      promptUserSupplement,
    });

    const result = await harness.controller.launch({
      entityRef,
      source: 'dashboard',
    });

    expect(result?.session.profile).toEqual(thinProfile);
    expect(chooseThinProfileAction).not.toHaveBeenCalled();
    expect(promptUserSupplement).not.toHaveBeenCalled();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it('shows localized thin profile choices for explicit ask launches', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
    });

    await harness.controller.launch({
      entityRef,
      enrichment: 'ask',
      source: 'slash-command',
    });

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: '直接开始' }),
        expect.objectContaining({ label: '提取项目证据' }),
        expect.objectContaining({ label: '手动补充' }),
      ]),
      expect.objectContaining({
        placeHolder: '小橘 的 NPC 资料较少。',
      }),
    );
  });

  it('uses default project evidence enrichment when no enrichment dependency is injected', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfileWithEvidence,
        })),
      }),
    });

    const result = await harness.controller.launch({
      entityRef,
      enrichment: 'auto',
      source: 'dashboard',
    });

    expect(result?.session.profile.sparsity).toBe('partial');
    expect(result?.session.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'dialogue.sample',
          value: '小橘：我先看看。',
          source: 'script-extraction',
          authority: 'suggested',
        }),
        expect.objectContaining({
          key: 'occurrence.sceneAppearance',
          value: 'cases/test.fountain:8',
          source: 'script-extraction',
          authority: 'suggested',
        }),
        expect.objectContaining({
          key: 'relationship.suggested.char-ahui.friend',
          value: {
            name: 'char-ahui',
            relation: 'friend',
            entityRef: {
              entityId: 'char-ahui',
              entityKind: 'character',
              projectRoot: '/workspace/project-a',
              source: 'neko-story',
            },
          },
          source: 'relationship-graph',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('keeps AI-enriched profile facts suggested and tool-free', async () => {
    const chat = vi.fn(async () => ({
      model: 'model-a',
      message: {
        role: 'assistant' as const,
        content: JSON.stringify([
          {
            key: 'speechPattern',
            value: 'short cautious replies',
            confidence: 0.78,
            label: 'Speech pattern',
          },
        ]),
      },
    }));

    const result = await defaultEnrichNpcProfile({
      projectRoot: '/workspace/project-a',
      profile: thinProfileWithEvidence,
      request: { entityRef, enrichment: 'auto' },
      platform: { createService: () => ({ chat }) } as never,
      chatModel: { providerId: 'provider-a', modelId: 'model-a', category: 'llm' },
      now: () => '2026-06-01T00:00:00.000Z',
      logger: { warn: vi.fn(), debug: vi.fn() },
    });

    expect(chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        modelId: 'model-a',
        tools: [],
        toolChoice: 'none',
      }),
    );
    expect(result.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'agent.speechPattern',
          value: 'short cautious replies',
          source: 'agent-inferred',
          authority: 'suggested',
          confidence: 0.78,
        }),
      ]),
    );
  });

  it('requires explicit confirmation before applying NPC evaluation suggestions', async () => {
    const suggestion: NpcEvaluationSuggestion = {
      id: 'suggestion-1',
      kind: 'entity-metadata',
      status: 'suggested',
      title: 'Add speech pattern',
      rationale: 'Transcript shows a repeated phrase.',
      proposedValue: 'careful and brief',
      applyTarget: {
        kind: 'entity-metadata',
        entityRef,
        metadataKey: 'speechPattern',
      },
      authority: 'suggested',
      requiresUserConfirmation: true,
    };
    const applySuggestion = vi.fn(async () => ({ applied: true }));
    const harness = createHarness({
      confirmSuggestionApply: vi.fn(async () => false),
      applySuggestion,
    });

    await expect(harness.controller.applyEvaluationSuggestion({ suggestion })).resolves.toEqual({
      applied: false,
      message: 'NPC suggestion was not confirmed.',
    });
    expect(applySuggestion).not.toHaveBeenCalled();

    const confirmedHarness = createHarness({
      confirmSuggestionApply: vi.fn(async () => true),
      applySuggestion,
    });
    await expect(
      confirmedHarness.controller.applyEvaluationSuggestion({ suggestion }),
    ).resolves.toEqual({ applied: true });
    expect(applySuggestion).toHaveBeenCalledWith({
      suggestion,
      projectRoot: '/workspace/project-a',
    });
  });

  it('cancels active NPC sessions without touching ordinary conversations', async () => {
    const harness = createHarness({
      createResponder:
        () =>
        async ({ signal }) =>
          await new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
    });
    await harness.controller.launch({ entityRef });

    const pending = harness.controller.routeUserMessage('npc-session-1', 'wait');
    expect(harness.controller.cancel('npc-session-1')).toBe(true);
    await pending;

    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'npc-session-1',
      message: 'aborted',
    });
  });

  it('launches from /as args with mention resolution, consult mode, enrichment, and initial message', async () => {
    const resolvedRef: CreativeEntityRef = {
      entityId: 'char-resolved',
      entityKind: 'character',
      projectRoot: '/workspace/project-a',
    };
    const harness = createHarness({
      resolveEntityRef: vi.fn(async () => resolvedRef),
    });

    await harness.controller.launchFromSlash({
      args: '@小橘 --consult --enrichment auto 你好',
      conversationId: 'conv-1',
    });

    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({
      entityRef: { ...resolvedRef, source: 'neko-entity' },
    });
    expect(harness.responder).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'consult',
        userMessage: expect.objectContaining({ content: '你好' }),
      }),
    );
  });

  it('uses the project-scoped picker fallback when /as has no entity token', async () => {
    const pickEntityRef = vi.fn(async () => entityRef);
    const harness = createHarness({ pickEntityRef });

    await harness.controller.launchFromSlash({ args: '--skip-enrich' });

    expect(pickEntityRef).toHaveBeenCalledWith({ projectRoot: '/workspace/project-a' });
    expect(harness.controller.hasSession('npc-session-1')).toBe(true);
  });

  it('resolves /as mentions from Dashboard creative entity sources', async () => {
    const storyDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-story',
        sourceEntityId: 'candidate:character:小橘',
        entityId: '小橘',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: ['Xiaoju'],
      relationships: [],
      occurrences: [],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
    };
    const storyRow: DashboardCreativeEntityRow = {
      ref: storyDetail.ref,
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: ['Xiaoju'],
      summary: 'Script character candidate',
      occurrenceCount: 1,
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
      searchText: '小橘 Xiaoju character candidate',
    };
    const storySource = createDashboardSource('neko-story', storyDetail, [storyRow]);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command) =>
      command === 'neko.story.getDashboardCreativeEntitySource' ? storySource : undefined,
    );
    const harness = createHarness();

    await harness.controller.launchFromSlash({ args: '@小橘 --skip-enrich' });

    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({
      entityRef: {
        entityId: '小橘',
        entityKind: 'character',
        projectRoot: '/workspace/project-a',
        source: 'neko-story',
      },
    });
    expect(harness.controller.hasSession('npc-session-1')).toBe(true);
  });

  it('offers Dashboard creative entity rows in the default /as picker', async () => {
    const storyDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-story',
        sourceEntityId: 'candidate:character:小橘',
        entityId: '小橘',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: [],
      relationships: [],
      occurrences: [],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
    };
    const storyRow: DashboardCreativeEntityRow = {
      ref: storyDetail.ref,
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      summary: 'Script character candidate',
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
      searchText: '小橘 character candidate',
    };
    const storySource = createDashboardSource('neko-story', storyDetail, [storyRow]);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command) =>
      command === 'neko.story.getDashboardCreativeEntitySource' ? storySource : undefined,
    );
    vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => {
      const options = Array.isArray(items) ? items : [];
      return options.find((item) => item.label === '小橘');
    });
    const harness = createHarness();

    await harness.controller.launchFromSlash({ args: '--skip-enrich' });

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: '小橘',
          ref: expect.objectContaining({ source: 'neko-story' }),
        }),
      ]),
      expect.objectContaining({
        placeHolder: '选择要测试的项目角色',
      }),
    );
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({
      entityRef: {
        entityId: '小橘',
        entityKind: 'character',
        projectRoot: '/workspace/project-a',
        source: 'neko-story',
      },
    });
  });

  it('feeds project evidence from Dashboard sources into the default NPC profile assembler', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-npc-profile-'));
    const storyDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-story',
        sourceEntityId: 'entity:char-xiaoju',
        entityId: 'char-xiaoju',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'confirmed',
      sourceKind: 'registry',
      aliases: ['Xiaoju'],
      relationships: [
        {
          from: 'char-xiaoju',
          to: 'char-ahui',
          type: 'friend',
          strength: 'confirmed',
          provenance: 'story://cases/test.fountain:8',
          confidence: 0.9,
        },
      ],
      occurrences: [
        {
          source: 'script',
          role: 'reference',
          label: '小橘',
          location: 'cases/test.fountain:8',
          detail: '小橘：我先看看。',
        },
      ],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [],
    };
    const entityDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-entity',
        sourceEntityId: 'entity:char-xiaoju',
        entityId: 'char-xiaoju',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'confirmed',
      sourceKind: 'registry',
      aliases: ['Xiaoju'],
      relationships: [],
      occurrences: [],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [],
    };
    const entitySource = createDashboardSource('neko-entity', entityDetail);
    const storySource = createDashboardSource('neko-story', storyDetail);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command) =>
      command === 'neko.entity.getDashboardCreativeEntitySource'
        ? entitySource
        : command === 'neko.story.getDashboardCreativeEntitySource'
          ? storySource
          : undefined,
    );
    await writeFile(
      path.join(projectRoot, 'characters.json'),
      `${JSON.stringify(
        {
          version: 1,
          characters: [
            {
              id: 'char-xiaoju',
              canonicalName: '小橘',
              aliases: ['Xiaoju'],
              status: 'confirmed',
              metadata: { role: 'detective' },
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    try {
      const assembler = createDefaultNpcProfileAssembler(projectRoot);
      const result = await assembler.assembleProfile({
        entityRef: { ...entityRef, projectRoot },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: 'assembled',
          profile: expect.objectContaining({
            relationships: [
              expect.objectContaining({
                key: 'relationship.char-ahui.friend',
                value: expect.objectContaining({
                  entityRef: expect.objectContaining({ entityId: 'char-ahui' }),
                  relation: 'friend',
                }),
                sourceRef: 'story://cases/test.fountain:8',
              }),
            ],
            dialogueSamples: ['小橘：我先看看。'],
            sceneAppearances: ['cases/test.fountain:8'],
          }),
        }),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('assembles a default NPC profile from Dashboard detail when registry is missing', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-npc-dashboard-profile-'));
    const storyDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-story',
        sourceEntityId: 'candidate:character:小橘',
        entityId: '小橘',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: ['Xiaoju'],
      description: 'Script-derived character candidate without confirmed registry identity.',
      relationships: [],
      occurrences: [
        {
          source: 'script',
          role: 'reference',
          label: '小橘',
          location: 'cases/test.fountain:8',
          detail: '小橘：我先看看。',
        },
      ],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
    };
    const storySource = createDashboardSource('neko-story', storyDetail);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command) =>
      command === 'neko.story.getDashboardCreativeEntitySource' ? storySource : undefined,
    );

    try {
      const assembler = createDefaultNpcProfileAssembler(projectRoot);
      const result = await assembler.assembleProfile({
        entityRef: {
          entityId: '小橘',
          entityKind: 'character',
          projectRoot,
          source: 'neko-story',
        },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: 'assembled',
          profile: expect.objectContaining({
            displayName: '小橘',
            aliases: ['Xiaoju'],
            dialogueSamples: ['小橘：我先看看。'],
            sceneAppearances: ['cases/test.fountain:8'],
          }),
        }),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('adds script context snippets to the default NPC profile before conversation starts', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-npc-script-context-'));
    const storyDetail: DashboardCreativeEntityDetail = {
      ref: {
        source: 'neko-story',
        sourceEntityId: 'candidate:character:小橘',
        entityId: '小橘',
        entityKind: 'character',
        workspaceFolder: 'project-a',
      },
      label: '小橘',
      kind: 'character',
      status: 'candidate',
      sourceKind: 'script',
      aliases: [],
      relationships: [],
      occurrences: [
        {
          source: 'script',
          role: 'reference',
          label: '小橘',
          location: 'cases/test.fountain:8',
          detail: '小橘：我今天去上学了。',
        },
      ],
      bindings: [],
      defaults: [],
      requirements: [],
      visualDrafts: [],
      syncSuggestions: [],
      freshness: 'fresh',
      actions: [{ id: 'test-npc', label: 'Test NPC' }],
    };
    const storySource = createDashboardSource('neko-story', storyDetail);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command) =>
      command === 'neko.story.getDashboardCreativeEntitySource' ? storySource : undefined,
    );
    vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async () =>
      Buffer.from(
        [
          'INT. 教室 - DAY',
          '老师正在点名。',
          '阿灰看向窗外。',
          '小橘坐在第二排。',
          '她把书包放好。',
          '老师',
          '今天谁迟到了？',
          '小橘',
          '我今天去上学了，还交了作业。',
          '同学们笑了起来。',
        ].join('\n'),
        'utf8',
      ),
    );

    try {
      const assembler = createDefaultNpcProfileAssembler(projectRoot);
      const result = await assembler.assembleProfile({
        entityRef: {
          entityId: '小橘',
          entityKind: 'character',
          projectRoot,
          source: 'neko-story',
        },
      });

      expect(result).toEqual(expect.objectContaining({ status: 'assembled' }));
      if (result.status !== 'assembled') return;
      expect(result.profile.facts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'script.context.1',
            value: expect.stringContaining('我今天去上学了'),
            source: 'script-extraction',
            authority: 'confirmed',
            sourceRef: 'cases/test.fountain:8',
          }),
        ]),
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('parses slash args without treating allowed tools as an NPC capability', () => {
    expect(parseNpcSlashArgs('@小橘 --consult --manual hi there')).toEqual({
      entityToken: '@小橘',
      mode: 'consult',
      enrichment: 'manual',
      initialUserMessage: 'hi there',
    });
  });

  it('creates platform responder requests with an explicit no-tool runtime policy', async () => {
    const chat = vi.fn(async () => ({
      model: 'model-a',
      message: { role: 'assistant' as const, content: 'hello' },
    }));
    const responder = createPlatformNpcResponder({
      platform: {
        createService: () => ({ chat }),
      } as never,
      chatModel: { providerId: 'provider-a', modelId: 'model-a', category: 'llm' },
    });

    await expect(
      responder({
        sessionId: 'npc-session-1',
        entityRef,
        profileSnapshot: profile,
        mode: 'roleplay',
        systemPrompt: 'system',
        transcript: [],
        userMessage: {
          id: 'msg-user',
          role: 'user',
          content: 'hello',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
        config: { toolPolicy: { kind: 'none' }, modelTier: 'balanced', maxIterations: 12 },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      content: 'hello',
      metadata: { model: 'model-a', toolPolicy: 'none' },
    });
    expect(chat).toHaveBeenCalledWith(
      [{ role: 'system', content: 'system' }],
      expect.objectContaining({
        modelId: 'model-a',
        tools: [],
        toolChoice: 'none',
      }),
    );
  });
});
