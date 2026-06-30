import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CanvasPlaybackPlan, CutCanvasDraftImportResult, NekoCanvasAPI } from '@neko/shared';
import { TOOL_NAMES_CANVAS } from '@neko/shared';
import { createNekoCanvasCapabilityProvider } from '../agentCapabilityProvider';

const vscodeCommandState = vi.hoisted(() => ({
  executeCommand: vi.fn(
    async (_command: string, ..._args: readonly unknown[]): Promise<unknown> => undefined,
  ),
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Workspace: 2 },
  commands: {
    executeCommand: vscodeCommandState.executeCommand,
  },
  extensions: {
    getExtension: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => ''),
      update: vi.fn(async () => undefined),
    })),
  },
}));

const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const toolNamesSource = readFileSync(
  join(__dirname, '../../../../../neko-types/src/types/tool-names.ts'),
  'utf-8',
);

function createPlaybackPlan(): CanvasPlaybackPlan {
  return {
    adapterId: 'storyboard',
    requestedAdapterId: 'storyboard',
    behaviorMode: 'linear',
    advancePolicy: 'timer',
    entryUnitIds: ['unit-shot-1'],
    units: [
      {
        id: 'unit-shot-1',
        sourceNodeId: 'shot-1',
        kind: 'shot',
        renderMode: 'media-playback',
        label: 'Shot 1',
        durationMs: 3000,
      },
    ],
    transitions: [],
    routeCandidates: [
      {
        id: 'route-main',
        title: 'Main route',
        entryUnitId: 'unit-shot-1',
        unitIds: ['unit-shot-1'],
        sourceKind: 'entry',
        totalDurationMs: 3000,
      },
    ],
    diagnostics: [],
    metadata: { sourceCanvasUri: 'file:///story.nkc', sourceRevision: 3 },
  };
}

function createApi(): NekoCanvasAPI {
  const plan = createPlaybackPlan();
  return {
    asset: {
      import: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    },
    importAsset: vi.fn(),
    canvas: {
      create: vi.fn(),
      addShape: vi.fn(),
    },
    storyboard: {
      import: vi.fn(),
      getExecutionSummary: vi.fn(),
    },
    markdown: {
      invoke: vi.fn(async (input) => ({
        capabilityId: input.capabilityId,
        status:
          input.capabilityId === 'canvas.validateMarkdownStoryboard' ? 'validated' : 'blocked',
        diagnostics:
          input.capabilityId === 'canvas.validateMarkdownStoryboard'
            ? []
            : [
                {
                  severity: 'warning',
                  code: 'canvas-markdown-capability-not-implemented',
                  message: 'Not implemented in test mock.',
                },
              ],
      })),
    },
    playback: {
      getPlan: vi.fn(async () => plan),
      getRoutes: vi.fn(async () => plan.routeCandidates),
      revealWorkspace: vi.fn(async () => true),
      createCutDraftFromRoute: vi.fn(async () => ({
        kind: 'canvas-cut-draft',
        schemaVersion: 1,
        sourceCanvasUri: 'file:///story.nkc',
        sourceRevision: '3',
        routeId: 'route-main',
        createdAt: '2026-06-24T00:00:00.000Z',
        projectName: 'Story',
        units: [],
        diagnostics: [],
        extensions: { 'neko.canvas': { source: 'test' } },
      })),
      reorderUnits: vi.fn(async (request) => ({
        changed: true,
        routeId: request.routeId,
        sourceCanvasUri: request.sourceCanvasUri,
        orderedUnitIds: request.orderedUnitIds,
        plan,
      })),
    },
    nodes: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      derive: vi.fn(),
      createConnection: vi.fn(),
      createComposite: vi.fn(),
      updateBlock: vi.fn(),
      extractStructuredContent: vi.fn(),
      getActiveContext: vi.fn(),
      applyAgentContent: vi.fn(),
      generateImage: vi.fn(),
      generateBatch: vi.fn(),
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
    events: {
      onDidChangeAssets: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeCanvas: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as NekoCanvasAPI;
}

describe('agentCapabilityProvider storyboard export contracts', () => {
  it('keeps target-aware Agent content behind Canvas APIs instead of legacy commands', () => {
    const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
    const editorProviderSource = readFileSync(
      join(__dirname, '../editor/canvasEditorProvider.ts'),
      'utf-8',
    );

    expect(extensionSource).not.toContain("'neko.canvas.importAgentContent'");
    expect(editorProviderSource).toContain("'nodes.getActiveContext'");
    expect(editorProviderSource).toContain("'nodes.applyAgentContent'");
    expect(editorProviderSource).toContain("operationType: 'nodes.applyAgentContent'");
  });

  it('syncs shot timeline import metadata after neko-cut import', () => {
    expect(providerSource).toContain('applyCanvasTimelineSyncToCanvas');
    expect(providerSource).toContain(
      "await vscode.commands.executeCommand('neko.cut.importStoryboard'",
    );
    expect(providerSource).toContain('buildStoryboardImportTimelineSyncPayload(');
  });

  it('hands off prepared keyframe references to neko-cut without reparsing source media', () => {
    expect(providerSource).toContain('collectShotKeyframeReferenceDescriptors');
    expect(providerSource).toContain('readShotPreparedKeyframeRef');
    expect(providerSource).toContain('preparedKeyframeRef: readShotPreparedKeyframeRef(data)');
    expect(providerSource).toContain('referenceDescriptors');
    expect(providerSource).toContain('readShotGeneratedImageFallback(data)');
    expect(providerSource).not.toContain("['generatedImage'] as string | undefined");
  });

  it('carries stable keyframe descriptors through video keyframe generation metadata', () => {
    expect(providerSource).toContain('firstFrameRefs = collectShotKeyframeReferenceDescriptors');
    expect(providerSource).toContain('lastFrameRefs = collectShotKeyframeReferenceDescriptors');
    expect(providerSource).toContain("metadata['referenceDescriptors'] = referenceDescriptors");
    expect(providerSource).toContain('referenceImageUrl: firstFrameData');
    expect(providerSource).not.toContain("['generatedImage'] as\n          | string");
  });

  it('registers additive composable Canvas Agent tools', () => {
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_DERIVE_NODE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_COMPOSITE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_UPDATE_BLOCK');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_EXTRACT_STRUCTURED_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_ACTIVE_CONTEXT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_APPLY_AGENT_CONTENT');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
  });

  it('marks Canvas query and mutation tools with target-aware safety metadata', () => {
    expect(providerSource).toContain("safetyKind: 'read-only-query'");
    expect(providerSource).toContain("safetyKind: 'confirmation-gated'");
    expect(providerSource).toContain('targetRequirements');
    expect(providerSource).toContain('queryBeforeMutate');
    expect(providerSource).toContain('allowedFallbacks');
    expect(providerSource).toContain('preferredQueryTools');
  });

  it('drives preset schemas from shared registry constants', () => {
    expect(providerSource).toContain('CANVAS_AGENT_NODE_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_DERIVE_TARGET_PRESETS');
    expect(providerSource).toContain('CANVAS_AGENT_CONTAINER_PRESETS');
    expect(providerSource).not.toContain("'shot',\n                'scene'");
  });

  it('validates Canvas Agent node type inputs at the provider boundary', () => {
    expect(providerSource).toContain('isCanvasNodeType');
    expect(providerSource).toContain('readOptionalCanvasNodeType(args.type)');
    expect(providerSource).toContain("readOptionalCanvasNodeType(value.type, 'child node type')");
    expect(providerSource).toContain(
      "readOptionalCanvasNodeType(args.targetType, 'derive target type')",
    );
  });

  it('requests additive subsystem metadata only when callers opt in', () => {
    expect(providerSource).toContain('includeSubsystemMetadata');
    expect(providerSource).toContain(
      'includeSubsystemMetadata: args.includeSubsystemMetadata as boolean | undefined',
    );
  });

  it('contributes prompt fragments for mixed-purpose Canvas subsystem context', () => {
    expect(providerSource).toContain('getPromptFragments(');
    expect(providerSource).toContain('neko-canvas:multi-purpose-canvas-subsystems');
    expect(providerSource).toContain('activeSubsystems');
    expect(providerSource).toContain('includeSubsystemMetadata: true');
    expect(providerSource).toContain('projection adapters');
  });

  it('registers review-only artifact rendering and lifecycle Canvas Markdown facets', () => {
    expect(providerSource).toContain('getArtifactFacets(');
    expect(providerSource).toContain('renderer:neko-canvas:generic-artifact-preview');
    expect(providerSource).toContain("'CompositeArtifact', 'GenericTable', 'StoryboardTable'");
    expect(providerSource).not.toContain('projector:storyboard-to-canvas');
    expect(providerSource).not.toContain("capabilityId: 'canvas.importStoryboard'");
    expect(providerSource).toContain("capabilityId: 'canvas.ingestMarkdown'");
    expect(providerSource).toContain('requiresApproval: true');
  });

  it('registers narrative traversal as a read-only mixed Canvas tool', () => {
    expect(providerSource).toContain('traverseNarrativeFlow');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_NARRATIVE_TRAVERSE');
    expect(toolNamesSource).toContain("CANVAS_NARRATIVE_TRAVERSE: 'canvas_narrative_traverse'");
    expect(providerSource).toContain('Ignores storyboard, behavior, entity, and memory nodes');
  });

  it('registers Agent-readable Canvas playback route capabilities', () => {
    expect(toolNamesSource).toContain("CANVAS_GET_PLAYBACK_PLAN: 'canvas.getPlaybackPlan'");
    expect(toolNamesSource).toContain("CANVAS_GET_PLAYBACK_ROUTES: 'canvas.getPlaybackRoutes'");
    expect(toolNamesSource).toContain(
      "CANVAS_REVEAL_PLAYBACK_WORKSPACE: 'canvas.revealPlaybackWorkspace'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE: 'canvas.createCutDraftFromRoute'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_REORDER_PLAYBACK_UNITS: 'canvas.reorderPlaybackUnits'",
    );
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_ROUTES');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE');
    expect(providerSource).toContain('TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS');
  });

  it('registers Canvas Markdown capability tool names and artifact facets', () => {
    expect(toolNamesSource).toContain("CANVAS_INGEST_MARKDOWN: 'canvas.ingestMarkdown'");
    expect(toolNamesSource).toContain("CANVAS_CREATE_MARKDOWN_NOTE: 'canvas.createMarkdownNote'");
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_TABLE_FROM_MARKDOWN: 'canvas.createTableFromMarkdown'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_STORYBOARD_DRAFT_FROM_MARKDOWN: 'canvas.createStoryboardDraftFromMarkdown'",
    );
    expect(toolNamesSource).toContain(
      "CANVAS_CREATE_STORYBOARD_FROM_MARKDOWN: 'canvas.createStoryboardFromMarkdown'",
    );
    expect(toolNamesSource).toContain("CANVAS_ATTACH_RESOURCE: 'canvas.attachResource'");
    expect(toolNamesSource).toContain(
      "CANVAS_VALIDATE_MARKDOWN_STORYBOARD: 'canvas.validateMarkdownStoryboard'",
    );
    expect(providerSource).toContain('CANVAS_MARKDOWN_TOOL_DEFINITIONS');
    expect(providerSource).toContain("capabilityId: 'canvas.ingestMarkdown'");
    expect(providerSource).toContain("capabilityId: 'canvas.validateMarkdownStoryboard'");
    expect(providerSource).toContain("accepts: ['Markdown', 'GfmTable']");

    const provider = createNekoCanvasCapabilityProvider(createApi());
    const facets = provider.getArtifactFacets({ extensionContext: {} });
    expect(facets.lifecycleCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'canvas.ingestMarkdown',
          providerId: 'neko-canvas',
          displayName: 'Ingest Markdown to Canvas',
          phases: ['review'],
          inputSchema: { id: 'canvas.markdown.input', version: 1 },
          resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
          requiresApproval: true,
          safetyKind: 'confirmation-gated',
        }),
        expect.objectContaining({
          capabilityId: 'canvas.validateMarkdownStoryboard',
          displayName: 'Validate Markdown Storyboard',
          phases: ['validate'],
          requiresApproval: false,
          safetyKind: 'read-only-query',
        }),
      ]),
    );
  });

  it('executes Markdown capability tools through the Canvas Markdown API', async () => {
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });

    const validateTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_VALIDATE_MARKDOWN_STORYBOARD,
    );
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    expect(validateTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(ingestTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });

    await expect(
      validateTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        sourceFormat: 'gfm-table',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        phase: 'validate',
        status: 'validated',
        data: {
          capabilityId: 'canvas.validateMarkdownStoryboard',
          status: 'validated',
        },
      },
    });
    expect(api.markdown.invoke).toHaveBeenCalledWith({
      capabilityId: 'canvas.validateMarkdownStoryboard',
      markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
      sourceFormat: 'gfm-table',
    });

    await expect(
      ingestTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        resources: [{ token: 'P1', sourcePath: 'assets/page-1.png' }],
      }),
    ).resolves.toMatchObject({
      success: false,
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'blocked',
        data: {
          capabilityId: 'canvas.ingestMarkdown',
          status: 'blocked',
        },
      },
    });
  });

  it('projects Canvas Markdown lifecycle actions through capability definitions', async () => {
    const api = createApi();
    api.markdown.invoke = vi.fn(async (input) => ({
      capabilityId: input.capabilityId,
      status: 'needs-review',
      draftNodeId: 'draft-node-1',
      diagnostics: [],
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
    }));
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });
    const ingestTool = tools.find((tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_INGEST_MARKDOWN);

    await expect(
      ingestTool!.execute({
        markdown: '| image | visual |\n| --- | --- |\n| P1 | shot |',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        capabilityId: 'canvas.ingestMarkdown',
        phase: 'review',
        status: 'needs-review',
        actions: [
          {
            actionId: 'create-storyboard-nodes',
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            phase: 'apply',
            requiresApproval: true,
            sourceRef: {
              kind: 'node',
              id: 'draft-node-1',
              packageId: 'neko-canvas',
            },
          },
        ],
      },
    });
  });

  it('keeps playback display and reveal read-only while import/reorder are confirmation-gated', () => {
    expect(providerSource).toContain('api.playback.getPlan');
    expect(providerSource).toContain('api.playback.getRoutes');
    expect(providerSource).toContain('api.playback.revealWorkspace');
    expect(providerSource).toContain('api.playback.createCutDraftFromRoute');
    expect(providerSource).toContain('api.playback.reorderUnits');
    expect(providerSource).toContain('await vscode.commands.executeCommand');
    expect(providerSource).toContain("'neko.cut.importCanvasDraft'");
    expect(providerSource).toContain("approvalContext === 'agent-inferred'");
    expect(providerSource).toContain(
      'Agent-inferred Canvas playback reorder requires confirmation',
    );
    expect(providerSource).toContain('readPlaybackReorderApprovalContext(args.approvalContext)');
  });

  it('executes playback tools through Canvas/Cut owning APIs with approval policy', async () => {
    vscodeCommandState.executeCommand.mockImplementation(async (command: string) =>
      command === 'neko.cut.importCanvasDraft'
        ? ({
            accepted: true,
            status: 'imported',
            projectUri: 'file:///cut.nkv',
          } satisfies CutCanvasDraftImportResult)
        : undefined,
    );
    const api = createApi();
    const provider = createNekoCanvasCapabilityProvider(api);
    const tools = provider.getTools({
      extensionContext: {},
      mediaService: undefined,
      configManager: undefined,
      embedFn: undefined,
    });

    const getPlanTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_GET_PLAYBACK_PLAN,
    );
    const revealTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_REVEAL_PLAYBACK_WORKSPACE,
    );
    const createDraftTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_CREATE_CUT_DRAFT_FROM_ROUTE,
    );
    const reorderTool = tools.find(
      (tool) => tool.name === TOOL_NAMES_CANVAS.CANVAS_REORDER_PLAYBACK_UNITS,
    );

    expect(getPlanTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(revealTool).toMatchObject({
      isReadOnly: true,
      safetyKind: 'read-only-query',
    });
    expect(createDraftTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });
    expect(reorderTool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
    });

    await expect(getPlanTool!.execute({ sourceCanvasUri: 'file:///story.nkc' })).resolves.toEqual({
      success: true,
      data: createPlaybackPlan(),
    });
    expect(api.playback.getPlan).toHaveBeenCalledWith('file:///story.nkc');

    await expect(
      revealTool!.execute({
        sourceCanvasUri: 'file:///story.nkc',
        routeId: 'route-main',
        unitId: 'unit-shot-1',
      }),
    ).resolves.toEqual({ success: true, data: { revealed: true } });
    expect(api.playback.revealWorkspace).toHaveBeenCalledWith({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      unitId: 'unit-shot-1',
    });

    const agentInferredResult = await reorderTool!.execute({
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'agent-inferred',
    });
    expect(agentInferredResult).toMatchObject({
      success: false,
      error: 'Agent-inferred Canvas playback reorder requires confirmation.',
    });
    expect(api.playback.reorderUnits).not.toHaveBeenCalled();

    const explicitResult = await reorderTool!.execute({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'explicit-user-instruction',
      instructionText: 'Move shot 1 first.',
    });
    expect(explicitResult.success).toBe(true);
    expect(api.playback.reorderUnits).toHaveBeenCalledWith({
      sourceCanvasUri: 'file:///story.nkc',
      routeId: 'route-main',
      orderedUnitIds: ['unit-shot-1'],
      approvalContext: 'explicit-user-instruction',
      instructionText: 'Move shot 1 first.',
    });

    await expect(
      createDraftTool!.execute({ routeId: 'route-main', sendToCut: true }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        sentToCut: true,
        cutImportResult: {
          accepted: true,
          status: 'imported',
          projectUri: 'file:///cut.nkv',
        },
      },
    });
    expect(api.playback.createCutDraftFromRoute).toHaveBeenCalledWith({
      sourceCanvasUri: undefined,
      routeId: 'route-main',
      projectName: undefined,
    });
    expect(vscodeCommandState.executeCommand).toHaveBeenCalledWith(
      'neko.cut.importCanvasDraft',
      expect.objectContaining({ kind: 'canvas-cut-draft', routeId: 'route-main' }),
    );
  });

  it('does not give Agent a playback runtime or private route order', () => {
    expect(providerSource).toContain('Agent must not persist route order');
    expect(providerSource).toContain('Canvas owns playback UI and playhead');
    expect(providerSource).not.toContain('agentOrder');
    expect(providerSource).not.toContain('AgentPlaybackSession');
    expect(providerSource).not.toContain('createVideoPlayer');
  });
});
