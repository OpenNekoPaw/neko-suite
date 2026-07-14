import * as vscode from 'vscode';
import {
  getCanvasCreativeAiActionModality,
  isCanvasCreativeAiActionId,
  isCanvasCreativeAiActionRequest,
  isNpcAgentWorkflowRequest,
  isNpcTestBenchLaunchRequest,
  NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
  NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
  type CanvasCreativeAiActionId,
  type CanvasCreativeAiActionRequest,
  type ModelType,
  type NpcAgentWorkflowRequest,
  type StoryboardMediaRef,
} from '@neko/shared';
import type { AgentContextPayload } from '@neko/shared';
import type { ChatMessage, Platform, ServiceOptions } from '@neko/platform';
import { refreshOllamaModels, runInternalChatRuntime } from '@neko/platform';
import type { AgentModelPurpose } from '@neko/platform/config/model-purpose-registry';
import { modelSupportsPurpose } from '@neko/platform/config/model-purpose-registry';
import type {
  ImageGenerationRequest,
  MediaTask,
  VideoGenerationRequest,
} from '@neko/platform/media';
import {
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
} from '@neko-agent/types';
import {
  buildCanvasStoryboardActionIntentContextPayload,
  buildAgentPromptCommandMessage,
  buildAgentScriptCommandMessage,
  createCreativeAiRunRuntime,
  type CreativeAiRunRuntime,
} from '@neko/agent/runtime';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  createCreativeAiDiagnostic,
  type CreativeAiDiagnostic,
  type CreativeAiApplyRequest,
  type CreativeAiLaneKind,
  type CreativeAiModelSnapshotRef,
  type CreativeAiOutputRef,
  type CreativeAiRoutingDecision,
  type CreativeAiRunSnapshot,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';
import type { CanvasGenerationInput, CanvasShotPromptData } from '@neko/skills';
import { getRootLogger, handleError, ServiceCollection } from '../base';
import { IPlatform } from '../bootstrap';
import type { ChatViewProvider } from '../chat';
import { getSkillFileService } from '../services/SkillFileService';
import {
  getSlashCommandRegistry,
  type PluginSlashCommandDef,
} from '../services/slashCommandRegistry';
import {
  CreativeAiConversationRoutingService,
  type CreativeAiConversationAssociationStorage,
} from '../services/creativeAiConversationRoutingService';
import { createCanvasGenerationRuntime } from './canvasGenerationHost';

const NEKO_AGENT_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND = 'neko.agent.creativeAi.invokeExternal';

type CreativeAiExternalInvocationCommandResult =
  | {
      readonly ok: true;
      readonly decision: CreativeAiRoutingDecision;
      readonly snapshot: CreativeAiRunSnapshot;
      readonly status: 'created' | 'existing';
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

/**
 * Register core extension commands.
 *
 * This module is intentionally a host bridge: it owns VSCode command APIs,
 * editor/input collection and webview forwarding. Agent/platform packages own
 * prompt construction, media generation and model refresh policy.
 */
export function registerAgentCoreCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  services: ServiceCollection,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chat', () => {
      vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.sendMessage', async (message: string) => {
      await chatViewProvider.sendMessageToAssistant(message, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.invokeSkill',
      async (args?: { skillName?: string; intent?: string; skill?: { name?: string } }) => {
        await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
        if (args?.intent) {
          const skillPrefix = args.skill?.name ? `[${args.skill.name}] ` : '';
          await chatViewProvider.sendMessageToAssistant(`${skillPrefix}${args.intent}`, true);
        } else if (args?.skillName) {
          await chatViewProvider.sendMessageToAssistant(`/${args.skillName}`, true);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.sendContext',
      async (payload: AgentContextPayload) => {
        const routedPayload =
          buildCanvasStoryboardActionIntentContextPayload({
            payload,
            locale: vscode.env.language,
          }) ?? payload;
        await chatViewProvider.sendContextPayload(routedPayload);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      NEKO_AGENT_CHARACTER_DIALOGUE_COMMAND,
      async (request: unknown) => {
        await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
        if (!isNpcTestBenchLaunchRequest(request)) {
          await vscode.window.showErrorMessage('无法启动角色对话：启动请求无效。');
          return null;
        }
        return chatViewProvider.startCharacterDialogue(request);
      },
    ),
  );

  registerCharacterRoleWorkflowCommand(
    context,
    chatViewProvider,
    NEKO_AGENT_EMBODY_CHARACTER_COMMAND,
    'embody-character',
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateImage', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the image you want to generate',
        placeHolder: 'A beautiful sunset over mountains...',
      });

      if (!prompt) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentPromptCommandMessage({ kind: 'generate-image', prompt }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateVideo', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the video you want to generate',
        placeHolder: 'A timelapse of clouds moving...',
      });

      if (!prompt) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentPromptCommandMessage({ kind: 'generate-video', prompt }),
        true,
      );
    }),
  );

  registerScriptCommands(context, chatViewProvider);
  registerServiceCommands(context, services);
  registerCanvasCommands(context, chatViewProvider, services);
  registerPluginCommands(context, chatViewProvider);
  registerDragAndDropCommands(context, chatViewProvider);
  registerInternalApiCommands(context, services);
}

function registerScriptCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generate', async () => {
      const text = getSelectedOrFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'optimize', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate-image', text }),
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      const text = getFullEditorText();
      if (text === undefined) return;

      await chatViewProvider.sendMessageToAssistant(
        buildAgentScriptCommandMessage({ kind: 'generate-video', text }),
        true,
      );
    }),
  );
}

function registerCharacterRoleWorkflowCommand(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  command: string,
  workflow: NpcAgentWorkflowRequest['workflow'],
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(command, async (request: unknown) => {
      await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
      if (!isNpcAgentWorkflowRequest(request) || request.workflow !== workflow) {
        await vscode.window.showErrorMessage('无法启动角色工作流：请求无效。');
        return null;
      }
      await chatViewProvider.startEmbodyCharacter(request);
      return { ok: true, workflow: request.workflow };
    }),
  );
}

function registerServiceCommands(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.rescanSkills', () => {
      getSkillFileService()
        .triggerRescan()
        .catch((err) => {
          getRootLogger().warn('neko.agent.rescanSkills failed', { error: err });
        });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.refreshModels', async () => {
      const platform = services.get(IPlatform);
      if (!platform) return;
      const result = await refreshOllamaModels({
        config: platform.config,
        providers: platform.providers,
        logger: getRootLogger(),
      });
      getRootLogger().info(`Ollama model refresh: +${result.added} new model(s)`);
    }),
  );
}

function registerCanvasCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  services: ServiceCollection,
): void {
  const creativeAiRunRuntime = createCreativeAiRunRuntime({
    emit: (event) => chatViewProvider.projectCreativeAiRunSnapshot(event.snapshot),
  });
  const creativeAiRouting = new CreativeAiConversationRoutingService({
    conversations: {
      getSelectedAgentConversationId: () => chatViewProvider.getSelectedAgentConversationId(),
      hasConversation: (conversationId) => chatViewProvider.hasConversation(conversationId),
      createBackgroundConversation: (input) =>
        chatViewProvider.createBackgroundCreativeAiConversation({ title: input.title }),
    },
    storage: createMementoCreativeAiAssociationStorage(context.workspaceState),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      NEKO_AGENT_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND,
      async (
        invocation: ExternalCreativeAiInvocation,
      ): Promise<CreativeAiExternalInvocationCommandResult> => {
        const resolvedModel = resolveCreativeAiRuntimeModel(invocation, services.get(IPlatform));
        if (!resolvedModel.ok) {
          return { ok: false, diagnostics: resolvedModel.diagnostics };
        }

        const routed = await creativeAiRouting.routeExternalInvocation(invocation);
        if (!routed.ok) {
          return { ok: false, diagnostics: routed.diagnostics };
        }

        const accepted = creativeAiRunRuntime.acceptInvocation({
          invocation,
          routingDecision: routed.decision,
          modelSnapshot: resolvedModel.modelSnapshot,
        });
        if (accepted.status === 'rejected') {
          return { ok: false, diagnostics: accepted.diagnostics };
        }
        if (accepted.status === 'created') {
          creativeAiRunRuntime.startBackgroundWorkItem({
            runId: accepted.snapshot.runId,
            laneKind: resolveCreativeAiInvocationLaneKind(invocation),
            ...(invocation.targetRef ? { targetRef: invocation.targetRef } : {}),
            ...(invocation.candidateTargetRef
              ? { candidateTargetRef: invocation.candidateTargetRef }
              : {}),
            execute: (workItemContext) =>
              executeCanvasCreativeAiWorkItem({
                invocation,
                platform: resolvedModel.platform,
                modelSnapshot: resolvedModel.modelSnapshot,
                runId: workItemContext.runId,
                workItemId: workItemContext.workItemId,
                conversationId: workItemContext.conversationId,
                runtime: workItemContext.runtime,
              }),
          });
        }
        const snapshot =
          creativeAiRunRuntime.getRunSnapshot(accepted.snapshot.runId) ?? accepted.snapshot;

        getRootLogger().info('Accepted external creative AI invocation', {
          invocationId: invocation.invocationId,
          conversationId: routed.decision.conversationId,
          runId: snapshot.runId,
          status: accepted.status,
        });

        return {
          ok: true,
          decision: routed.decision,
          snapshot,
          status: accepted.status,
          diagnostics: routed.decision.diagnostics,
        };
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.buildPrompt',
      async (shotData: CanvasShotPromptData): Promise<string> => {
        try {
          return await createCanvasGenerationRuntime(services).buildPrompt(shotData);
        } catch (err) {
          getRootLogger().warn('neko.agent.buildPrompt failed', { error: err });
          return '';
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.generateForNode',
      async (input: CanvasGenerationInput): Promise<{ dataUrl: string } | undefined> => {
        try {
          return await createCanvasGenerationRuntime(services).generateForNode(input);
        } catch (err) {
          getRootLogger().warn('neko.agent.generateForNode failed', { error: err });
          return undefined;
        }
      },
    ),
  );
}

function createMementoCreativeAiAssociationStorage(
  state: vscode.Memento,
): CreativeAiConversationAssociationStorage {
  return {
    get: <T>(key: string): T | undefined => state.get<T>(key),
    update: (key: string, value: unknown): Promise<void> =>
      Promise.resolve(state.update(key, value)),
  };
}

type CreativeAiRuntimeModelResolution =
  | {
      readonly ok: true;
      readonly platform: Platform;
      readonly purpose: AgentModelPurpose;
      readonly modelSnapshot: CreativeAiModelSnapshotRef;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

type CanvasModelPreferenceResolution =
  | {
      readonly ok: true;
      readonly ref?: { readonly providerId: string; readonly modelId: string };
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

function resolveCreativeAiRuntimeModel(
  invocation: ExternalCreativeAiInvocation,
  platform: Platform | undefined,
): CreativeAiRuntimeModelResolution {
  if (!platform) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-platform-unavailable',
          'Agent platform is unavailable for Canvas creative AI execution.',
          'platform',
          { retryable: true },
        ),
      ],
    };
  }

  const purpose = resolveCreativeAiInvocationModelPurpose(invocation);
  const modelType = resolveModelTypeForPurpose(purpose);
  const preferred = resolveCanvasModelPreference(invocation, platform);
  if (!preferred.ok) {
    return { ok: false, diagnostics: preferred.diagnostics };
  }
  const configuredRef =
    preferred.ref ??
    platform.config.getDefaultModelRef(modelType) ??
    platform.config.resolveModelRefForPurpose(purpose);
  if (!configuredRef) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-capability-unavailable',
          `No configured Agent model supports ${purpose}.`,
          'model',
          { metadata: { purpose } },
        ),
      ],
    };
  }

  const provider = platform.config.getProvider(configuredRef.providerId);
  if (!provider || provider.enabled === false) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-provider-unavailable',
          `Configured provider ${configuredRef.providerId} is unavailable or disabled.`,
          'providerId',
          { metadata: { providerId: configuredRef.providerId, purpose } },
        ),
      ],
    };
  }

  const model = platform.config.getModel(configuredRef.modelId);
  if (!model || model.enabled === false) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-unavailable',
          `Configured model ${configuredRef.modelId} is unavailable or disabled.`,
          'modelId',
          {
            metadata: {
              providerId: configuredRef.providerId,
              modelId: configuredRef.modelId,
              purpose,
            },
          },
        ),
      ],
    };
  }
  if (model.providerId !== configuredRef.providerId) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-provider-mismatch',
          `Configured model ${configuredRef.modelId} belongs to provider ${model.providerId}, not ${configuredRef.providerId}.`,
          'modelId',
          {
            metadata: {
              expectedProviderId: configuredRef.providerId,
              receivedProviderId: model.providerId,
              purpose,
            },
          },
        ),
      ],
    };
  }
  if (!modelSupportsPurpose(model, purpose)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-capability-mismatch',
          `Configured model ${configuredRef.modelId} does not support ${purpose}.`,
          'modelId',
          {
            metadata: {
              providerId: configuredRef.providerId,
              modelId: configuredRef.modelId,
              purpose,
              capabilities: model.capabilities,
            },
          },
        ),
      ],
    };
  }
  if (
    (purpose === 'image.generate' || purpose === 'image.edit' || purpose === 'video.generate') &&
    !platform.media
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-media-runtime-unavailable',
          'Agent media generation runtime is unavailable.',
          'media',
          { metadata: { purpose }, retryable: true },
        ),
      ],
    };
  }

  return {
    ok: true,
    platform,
    purpose,
    modelSnapshot: {
      providerId: configuredRef.providerId,
      modelId: configuredRef.modelId,
      capabilityId: purpose,
      capabilityRevision: 'agent-model-purpose-v1',
    },
  };
}

async function executeCanvasCreativeAiWorkItem(input: {
  readonly invocation: ExternalCreativeAiInvocation;
  readonly platform: Platform;
  readonly modelSnapshot: CreativeAiModelSnapshotRef;
  readonly runId: string;
  readonly workItemId: string;
  readonly conversationId: string;
  readonly runtime: CreativeAiRunRuntime;
}): Promise<void> {
  const actionId = resolveCanvasCreativeAiActionId(input.invocation);
  const actionRequest = resolveCanvasCreativeAiActionRequest(input.invocation);
  if (!actionId || !actionRequest) {
    input.runtime.failWorkItem(input.runId, input.workItemId, [
      diagnostic(
        'creative-ai-canvas-action-metadata-missing',
        'Canvas creative AI execution requires action metadata.',
        'metadata.canvasCreativeAiAction',
      ),
    ]);
    return;
  }

  const outputRefs =
    actionId === 'optimize-image-prompt' || actionId === 'optimize-video-prompt'
      ? await executeCanvasPromptOptimization(input, actionId, actionRequest)
      : await executeCanvasMediaGeneration(input, actionId, actionRequest);
  if (!outputRefs.ok) {
    input.runtime.failWorkItem(input.runId, input.workItemId, outputRefs.diagnostics);
    return;
  }

  input.runtime.markGeneratedObservation(input.runId, input.workItemId, [
    diagnostic(
      'creative-ai-candidate-generated',
      'Agent generated a Canvas creative AI candidate output.',
      'outputRefs',
      {
        severity: 'info',
        metadata: {
          outputRefIds: outputRefs.outputRefs.map((outputRef) => outputRef.id),
          actionId,
        },
      },
    ),
  ]);

  const applyRequest = buildCanvasCandidateApplyRequest({
    invocation: input.invocation,
    runId: input.runId,
    workItemId: input.workItemId,
    conversationId: input.conversationId,
    outputRefs: outputRefs.outputRefs,
  });
  const applyResult = await vscode.commands.executeCommand<unknown>(
    'neko.canvas.creativeAi.apply',
    applyRequest,
  );
  const applyDiagnostics = readCreativeAiDiagnostics(applyResult);
  if (!isOkResult(applyResult)) {
    if (applyDiagnostics.some((item) => item.code.includes('stale'))) {
      input.runtime.markWorkItemStale(input.runId, input.workItemId, applyDiagnostics);
      return;
    }
    input.runtime.failWorkItemApply(input.runId, input.workItemId, applyDiagnostics);
    return;
  }

  input.runtime.completeWorkItem(input.runId, input.workItemId);
  maybeStartCanvasJudgeWorkItem(input, outputRefs.outputRefs);
}

type CreativeAiOutputResolution =
  | {
      readonly ok: true;
      readonly outputRefs: readonly CreativeAiOutputRef[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

async function executeCanvasPromptOptimization(
  input: {
    readonly invocation: ExternalCreativeAiInvocation;
    readonly platform: Platform;
    readonly modelSnapshot: CreativeAiModelSnapshotRef;
    readonly workItemId: string;
  },
  actionId: CanvasCreativeAiActionId,
  actionRequest: CanvasCreativeAiActionRequest,
): Promise<CreativeAiOutputResolution> {
  const sourcePrompt = resolveCanvasPromptText(actionRequest, actionId);
  if (!sourcePrompt) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-prompt-missing',
          'Canvas prompt optimization requires a prompt document.',
          'creativeParameters.promptDocuments',
        ),
      ],
    };
  }
  if (!input.modelSnapshot.providerId || !input.modelSnapshot.modelId) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-snapshot-incomplete',
          'Canvas prompt optimization requires resolved provider and model ids.',
          'modelSnapshot',
        ),
      ],
    };
  }

  try {
    const service = input.platform.createService();
    const response = await service.chat(
      [
        {
          role: 'system',
          content:
            'Optimize the Canvas shot prompt. Return only the improved prompt text, without markdown fences or commentary.',
        },
        {
          role: 'user',
          content: [
            `Action: ${actionId}`,
            `Target: ${actionRequest.target.nodeId}`,
            '',
            'Current prompt:',
            sourcePrompt,
          ].join('\n'),
        },
      ],
      {
        providerId: input.modelSnapshot.providerId,
        modelId: input.modelSnapshot.modelId,
        temperature: 0.4,
        maxTokens: 1200,
      },
    );
    const optimized = readTextContent(response.message.content).trim();
    if (!optimized) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-empty-prompt-optimization',
            'Prompt optimization returned empty text.',
            'output',
            { retryable: true },
          ),
        ],
      };
    }
    return {
      ok: true,
      outputRefs: [
        {
          kind: 'text',
          id: `${input.workItemId}:optimized-prompt`,
          label: `${actionId} candidate prompt`,
          mimeType: 'text/plain',
          metadata: {
            text: optimized,
            sourcePromptRevision: actionRequest.targetRevision,
            actionId,
          },
        },
      ],
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-prompt-optimization-failed',
          error instanceof Error ? error.message : String(error),
          'provider',
          { retryable: true },
        ),
      ],
    };
  }
}

async function executeCanvasMediaGeneration(
  input: {
    readonly invocation: ExternalCreativeAiInvocation;
    readonly platform: Platform;
    readonly modelSnapshot: CreativeAiModelSnapshotRef;
    readonly runId: string;
    readonly workItemId: string;
    readonly conversationId: string;
    readonly runtime: CreativeAiRunRuntime;
  },
  actionId: CanvasCreativeAiActionId,
  actionRequest: CanvasCreativeAiActionRequest,
): Promise<CreativeAiOutputResolution> {
  const prompt = resolveCanvasPromptText(actionRequest, actionId);
  if (!prompt) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-prompt-missing',
          'Canvas media generation requires a prompt document.',
          'creativeParameters.promptDocuments',
        ),
      ],
    };
  }
  if (!input.platform.media) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-media-runtime-unavailable',
          'Agent media generation runtime is unavailable.',
          'media',
          { retryable: true },
        ),
      ],
    };
  }
  if (!input.modelSnapshot.providerId || !input.modelSnapshot.modelId) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-model-snapshot-incomplete',
          'Canvas media generation requires resolved provider and model ids.',
          'modelSnapshot',
        ),
      ],
    };
  }

  try {
    const mediaTask =
      actionId === 'generate-image' || actionId === 'edit-image'
        ? await input.platform.media.generateImage(
            buildCanvasImageGenerationRequest(
              actionRequest,
              actionId,
              prompt,
              input.modelSnapshot.providerId,
              input.modelSnapshot.modelId,
              input.conversationId,
            ),
          )
        : await input.platform.media.generateVideo(
            buildCanvasVideoGenerationRequest(
              actionRequest,
              actionId,
              prompt,
              input.modelSnapshot.providerId,
              input.modelSnapshot.modelId,
              input.conversationId,
            ),
          );
    input.runtime.updateWorkItemProgress(input.runId, input.workItemId, [
      diagnostic(
        'creative-ai-media-task-submitted',
        `Agent submitted media task ${mediaTask.id}.`,
        'mediaTask',
        {
          severity: 'info',
          metadata: {
            mediaTaskId: mediaTask.id,
            providerId: mediaTask.providerId,
            modelId: mediaTask.modelId,
          },
        },
      ),
    ]);
    const completed =
      mediaTask.status === 'completed'
        ? mediaTask
        : await input.platform.media.waitForTask(mediaTask.scope);
    if (completed.status !== 'completed' || !completed.outputs || completed.outputs.length === 0) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-media-task-failed',
            completed.error?.message ?? `Media task ${completed.id} did not produce outputs.`,
            'mediaTask',
            {
              retryable: completed.error?.retryable ?? true,
              metadata: {
                mediaTaskId: completed.id,
                status: completed.status,
                errorCode: completed.error?.code,
              },
            },
          ),
        ],
      };
    }
    return {
      ok: true,
      outputRefs: buildMediaTaskOutputRefs(completed, actionId),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-media-generation-failed',
          error instanceof Error ? error.message : String(error),
          'provider',
          { retryable: true },
        ),
      ],
    };
  }
}

function buildCanvasImageGenerationRequest(
  actionRequest: CanvasCreativeAiActionRequest,
  actionId: CanvasCreativeAiActionId,
  prompt: string,
  providerId: string,
  modelId: string,
  conversationId: string,
): ImageGenerationRequest {
  const generation = actionRequest.creativeParameters?.generation;
  const referenceImageUri = resolveFirstReferenceMediaUri(
    actionRequest.creativeParameters?.referenceMedia?.imageRefs,
  );
  return {
    prompt,
    providerId,
    modelId,
    ...(generation?.aspectRatio ? { aspectRatio: generation.aspectRatio } : {}),
    ...(actionId === 'edit-image' ? { editInstruction: prompt } : {}),
    ...(referenceImageUri ? { referenceImageUri } : {}),
    metadata: buildCanvasMediaRequestMetadata(actionRequest, actionId, conversationId),
  };
}

function buildCanvasVideoGenerationRequest(
  actionRequest: CanvasCreativeAiActionRequest,
  actionId: CanvasCreativeAiActionId,
  prompt: string,
  providerId: string,
  modelId: string,
  conversationId: string,
): VideoGenerationRequest {
  const generation = actionRequest.creativeParameters?.generation;
  const referenceImageUri = resolveFirstReferenceMediaUri(
    actionRequest.creativeParameters?.referenceMedia?.imageRefs,
  );
  const sourceVideoUrl = resolveFirstReferenceMediaUri(
    actionRequest.creativeParameters?.referenceMedia?.videoRefs,
  );
  return {
    prompt,
    providerId,
    modelId,
    ...(typeof generation?.duration === 'number' ? { duration: generation.duration } : {}),
    ...(generation?.aspectRatio ? { aspectRatio: generation.aspectRatio } : {}),
    ...(actionId === 'edit-video' ? { editInstruction: prompt } : {}),
    ...(referenceImageUri ? { referenceImageUri } : {}),
    ...(sourceVideoUrl ? { sourceVideoUrl } : {}),
    metadata: buildCanvasMediaRequestMetadata(actionRequest, actionId, conversationId),
  };
}

function buildCanvasMediaRequestMetadata(
  actionRequest: CanvasCreativeAiActionRequest,
  actionId: CanvasCreativeAiActionId,
  conversationId: string,
): Record<string, unknown> {
  return {
    conversationId,
    sourcePackage: 'neko-canvas',
    canvasActionId: actionId,
    canvasRequestId: actionRequest.requestId,
    targetRefId: actionRequest.targetRef.id,
    candidateTargetRefId: actionRequest.candidateTargetRef.id,
  };
}

function buildMediaTaskOutputRefs(
  task: MediaTask,
  actionId: CanvasCreativeAiActionId,
): readonly CreativeAiOutputRef[] {
  return (task.outputs ?? []).map((output, index) => {
    const generatedAssetId = `${task.id}:output:${index}`;
    return {
      kind: 'generated-asset',
      id: generatedAssetId,
      generatedAssetId,
      mimeType: output.mimeType,
      label: `${actionId} output ${index + 1}`,
      resourceRef: {
        id: generatedAssetId,
        scope: 'project',
        provider: 'neko-agent',
        kind: 'generated',
        source: {
          kind: 'generated-asset',
          generatedAssetId,
          metadata: {
            mediaTaskId: task.id,
            outputIndex: index,
            outputType: output.type,
          },
        },
        locator: { kind: 'generated-asset', assetId: generatedAssetId },
        fingerprint: {
          strategy: 'provider',
          value: `${task.providerId}:${task.modelId}:${task.id}:${index}`,
          providerId: task.providerId,
        },
      },
      metadata: {
        mediaTaskId: task.id,
        outputIndex: index,
        actionId,
      },
    };
  });
}

function buildCanvasCandidateApplyRequest(input: {
  readonly invocation: ExternalCreativeAiInvocation;
  readonly runId: string;
  readonly workItemId: string;
  readonly conversationId: string;
  readonly outputRefs: readonly CreativeAiOutputRef[];
}): CreativeAiApplyRequest {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId: `creative-ai-canvas-apply:${input.runId}:${input.workItemId}`,
    conversationId: input.conversationId,
    runId: input.runId,
    workItemId: input.workItemId,
    sourcePackage: input.invocation.sourcePackage,
    ...(input.invocation.targetRef ? { targetRef: input.invocation.targetRef } : {}),
    ...(input.invocation.candidateTargetRef
      ? { candidateTargetRef: input.invocation.candidateTargetRef }
      : {}),
    outputRefs: input.outputRefs,
    writeback: {
      kind: 'candidate',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    ...(input.invocation.targetRevision !== undefined
      ? { targetRevision: input.invocation.targetRevision }
      : {}),
    idempotencyKey: `${input.invocation.idempotencyKey}:candidate-apply:${input.workItemId}`,
    requestedAt: new Date().toISOString(),
    diagnostics: [
      diagnostic(
        'creative-ai-agent-candidate-apply-requested',
        'Agent requested Canvas candidate apply through the owning package adapter.',
        'candidateTargetRef',
        {
          severity: 'info',
          metadata: {
            invocationId: input.invocation.invocationId,
            runId: input.runId,
            workItemId: input.workItemId,
          },
        },
      ),
    ],
  };
}

function maybeStartCanvasJudgeWorkItem(
  input: {
    readonly invocation: ExternalCreativeAiInvocation;
    readonly platform: Platform;
    readonly runId: string;
    readonly workItemId: string;
    readonly runtime: CreativeAiRunRuntime;
  },
  outputRefs: readonly CreativeAiOutputRef[],
): void {
  if (input.invocation.metadata?.['judgeRequired'] !== true) {
    return;
  }
  input.runtime.startBackgroundWorkItem({
    runId: input.runId,
    laneKind: 'judge',
    ...(input.invocation.targetRef ? { targetRef: input.invocation.targetRef } : {}),
    ...(input.invocation.candidateTargetRef
      ? { candidateTargetRef: input.invocation.candidateTargetRef }
      : {}),
    parentWorkItemId: input.workItemId,
    execute: async (judgeContext) => {
      const judgeModel = resolveJudgeRuntimeModel(input.platform);
      if (!judgeModel.ok) {
        judgeContext.runtime.failWorkItem(
          judgeContext.runId,
          judgeContext.workItemId,
          judgeModel.diagnostics,
        );
        return;
      }
      try {
        const response = await input.platform.createService().chat(
          [
            {
              role: 'system',
              content:
                'Judge whether the Canvas creative AI candidate is acceptable. Return JSON with {"pass":true|false,"reason":"..."} only.',
            },
            {
              role: 'user',
              content: JSON.stringify(
                {
                  intent: input.invocation.intent,
                  targetRef: input.invocation.targetRef,
                  candidateTargetRef: input.invocation.candidateTargetRef,
                  outputRefs,
                },
                null,
                2,
              ),
            },
          ],
          {
            providerId: judgeModel.modelSnapshot.providerId,
            modelId: judgeModel.modelSnapshot.modelId,
            temperature: 0,
            maxTokens: 600,
          },
        );
        const parsed = parseJudgeResponse(readTextContent(response.message.content));
        if (!parsed.pass) {
          judgeContext.runtime.failWorkItem(judgeContext.runId, judgeContext.workItemId, [
            diagnostic(
              'creative-ai-judge-rejected-candidate',
              parsed.reason ?? 'Judge rejected the candidate.',
              'judge',
              { metadata: { outputRefIds: outputRefs.map((outputRef) => outputRef.id) } },
            ),
          ]);
          return;
        }
        judgeContext.runtime.completeWorkItem(judgeContext.runId, judgeContext.workItemId);
      } catch (error) {
        judgeContext.runtime.failWorkItem(judgeContext.runId, judgeContext.workItemId, [
          diagnostic(
            'creative-ai-judge-infrastructure-failed',
            error instanceof Error ? error.message : String(error),
            'judge',
            { retryable: true },
          ),
        ]);
      }
    },
  });
}

function resolveJudgeRuntimeModel(platform: Platform): CreativeAiRuntimeModelResolution {
  const ref = platform.config.resolveModelRefForPurpose('llm.judge');
  if (!ref) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-judge-model-unavailable',
          'No configured Agent judge model supports llm.judge.',
          'judgeModel',
        ),
      ],
    };
  }
  const model = platform.config.getModel(ref.modelId);
  const provider = platform.config.getProvider(ref.providerId);
  if (!model || model.enabled === false || !provider || provider.enabled === false) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-judge-model-unavailable',
          'Configured judge model or provider is unavailable.',
          'judgeModel',
          { metadata: { providerId: ref.providerId, modelId: ref.modelId } },
        ),
      ],
    };
  }
  if (!modelSupportsPurpose(model, 'llm.judge')) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-judge-model-capability-mismatch',
          `Configured judge model ${ref.modelId} does not support llm.judge.`,
          'judgeModel',
          { metadata: { providerId: ref.providerId, modelId: ref.modelId } },
        ),
      ],
    };
  }
  return {
    ok: true,
    platform,
    purpose: 'llm.judge',
    modelSnapshot: {
      providerId: ref.providerId,
      modelId: ref.modelId,
      capabilityId: 'llm.judge',
      capabilityRevision: 'agent-model-purpose-v1',
    },
  };
}

function resolveCreativeAiInvocationModelPurpose(
  invocation: ExternalCreativeAiInvocation,
): AgentModelPurpose {
  const actionId = resolveCanvasCreativeAiActionId(invocation);
  switch (actionId) {
    case 'generate-image':
      return 'image.generate';
    case 'edit-image':
      return 'image.edit';
    case 'generate-video':
    case 'edit-video':
      return 'video.generate';
    case 'optimize-image-prompt':
    case 'optimize-video-prompt':
    case undefined:
      return 'llm.chat';
  }
}

function resolveModelTypeForPurpose(purpose: AgentModelPurpose): ModelType {
  if (purpose.startsWith('image.')) return 'image';
  if (purpose.startsWith('video.')) return 'video';
  if (purpose.startsWith('audio.')) return 'audio';
  return 'llm';
}

function resolveCanvasModelPreference(
  invocation: ExternalCreativeAiInvocation,
  platform: Platform,
): CanvasModelPreferenceResolution {
  const request = resolveCanvasCreativeAiActionRequest(invocation);
  const requestedModelId =
    request?.creativeParameters?.generation?.modelId ??
    request?.creativeParameters?.modelCapability?.modelId;
  if (!requestedModelId) return { ok: true };
  const model = platform.config.getModel(requestedModelId);
  const providerId = request?.creativeParameters?.modelCapability?.providerId ?? model?.providerId;
  if (!model || !providerId) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-requested-model-unavailable',
          `Requested Canvas creative AI model ${requestedModelId} is not configured in Agent.`,
          'creativeParameters.modelId',
          { metadata: { modelId: requestedModelId } },
        ),
      ],
    };
  }
  return { ok: true, ref: { providerId, modelId: requestedModelId } };
}

function resolveCanvasCreativeAiActionId(
  invocation: ExternalCreativeAiInvocation,
): CanvasCreativeAiActionId | undefined {
  const actionId = invocation.metadata?.['actionId'];
  return isCanvasCreativeAiActionId(actionId) ? actionId : undefined;
}

function resolveCanvasCreativeAiActionRequest(
  invocation: ExternalCreativeAiInvocation,
): CanvasCreativeAiActionRequest | undefined {
  const request = invocation.metadata?.['canvasCreativeAiAction'];
  return isCanvasCreativeAiActionRequest(request) ? request : undefined;
}

function resolveCanvasPromptText(
  actionRequest: CanvasCreativeAiActionRequest,
  actionId: CanvasCreativeAiActionId,
): string | undefined {
  const blockKind =
    actionId === 'optimize-video-prompt' ||
    actionId === 'generate-video' ||
    actionId === 'edit-video'
      ? 'video'
      : 'image';
  const prompt = actionRequest.creativeParameters?.promptDocuments?.find(
    (document) => document.blockKind === blockKind,
  );
  return typeof prompt?.text === 'string' && prompt.text.trim().length > 0
    ? prompt.text.trim()
    : undefined;
}

function resolveFirstReferenceMediaUri(
  refs: readonly StoryboardMediaRef[] | undefined,
): string | undefined {
  if (!refs) return undefined;
  for (const ref of refs) {
    const resourcePath =
      ref.resourceRef?.source?.projectRelativePath ??
      ref.resourceRef?.source?.uri ??
      (ref.resourceRef?.locator?.kind === 'file' ? ref.resourceRef.locator.path : undefined);
    if (resourcePath) return resourcePath;
    if (isRecord(ref.locator)) {
      if (ref.locator['type'] === 'workspace-path' && typeof ref.locator['path'] === 'string') {
        return ref.locator['path'];
      }
      if (ref.locator['type'] === 'asset' && typeof ref.locator['uri'] === 'string') {
        return ref.locator['uri'];
      }
    }
  }
  return undefined;
}

function readTextContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

function isOkResult(value: unknown): boolean {
  return isRecord(value) && value['ok'] === true;
}

function readCreativeAiDiagnostics(value: unknown): readonly CreativeAiDiagnostic[] {
  if (!isRecord(value) || !Array.isArray(value['diagnostics'])) {
    return [
      diagnostic(
        'creative-ai-apply-result-invalid',
        'Canvas creative AI apply returned an invalid result.',
        'applyResult',
      ),
    ];
  }
  return value['diagnostics'].filter(isCreativeAiDiagnostic);
}

function isCreativeAiDiagnostic(value: unknown): value is CreativeAiDiagnostic {
  return (
    isRecord(value) &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string'
  );
}

function parseJudgeResponse(text: string): { readonly pass: boolean; readonly reason?: string } {
  try {
    const value = JSON.parse(text) as unknown;
    if (isRecord(value) && typeof value['pass'] === 'boolean') {
      return {
        pass: value['pass'],
        ...(typeof value['reason'] === 'string' ? { reason: value['reason'] } : {}),
      };
    }
  } catch {
    // Fall through to conservative rejection.
  }
  return { pass: false, reason: 'Judge response was not valid JSON.' };
}

function diagnostic(
  code: string,
  message: string,
  target?: string,
  options: {
    readonly severity?: CreativeAiDiagnostic['severity'];
    readonly retryable?: boolean;
    readonly metadata?: Readonly<Record<string, unknown>>;
  } = {},
): CreativeAiDiagnostic {
  return {
    ...createCreativeAiDiagnostic(options.severity ?? 'error', code, message, target),
    ...(options.retryable !== undefined ? { retryable: options.retryable } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveCreativeAiInvocationLaneKind(
  invocation: ExternalCreativeAiInvocation,
): CreativeAiLaneKind {
  const actionId = invocation.metadata?.['actionId'];
  if (isCanvasCreativeAiActionId(actionId)) {
    const modality = getCanvasCreativeAiActionModality(actionId);
    if (modality === 'image') return 'image';
    if (modality === 'video') return 'video';
    return 'text';
  }
  const modality = invocation.metadata?.['modality'];
  if (modality === 'image' || modality === 'audio' || modality === 'video') {
    return modality;
  }
  if (modality === 'judge') {
    return 'judge';
  }
  if (invocation.mode === 'optimize') {
    return 'text';
  }
  return 'text';
}

function registerPluginCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  const slashRegistry = getSlashCommandRegistry();
  context.subscriptions.push(
    slashRegistry,
    vscode.commands.registerCommand(
      NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
      (extensionId: string, commands: PluginSlashCommandDef[]) => {
        if (!extensionId || !Array.isArray(commands)) return;
        slashRegistry.register(extensionId, commands);
        chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
      },
    ),
  );

  context.subscriptions.push(
    slashRegistry.onDidChange(() => {
      chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
    }),
  );

  chatViewProvider.setPluginCommandsGetter(() => slashRegistry.getAll());
}

function registerDragAndDropCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  const dndBroker = chatViewProvider.dndBroker;
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.getDndPayload', () => {
      return dndBroker.getPayload();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.clearDndPayload', () => {
      dndBroker.clearPayload();
    }),
  );
}

function registerInternalApiCommands(
  context: vscode.ExtensionContext,
  services: ServiceCollection,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.internalChat',
      async (messages: ChatMessage[], options?: ServiceOptions): Promise<string | null> => {
        const platform = services.get(IPlatform);
        return runInternalChatRuntime(
          { messages, options },
          {
            createService: platform ? () => platform.createService() : undefined,
            getSelectedChatModel: () => {
              const settings = platform?.config.getAssistantRuntimeSettingsSnapshot();
              if (!settings?.selectedProviderId || !settings.selectedModelId) return undefined;
              return {
                providerId: settings.selectedProviderId,
                modelId: settings.selectedModelId,
              };
            },
            logger: getRootLogger(),
          },
        );
      },
    ),
  );
}

function getSelectedOrFullEditorText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void handleMissingEditor();
    return undefined;
  }

  const selection = editor.selection;
  return editor.document.getText(selection.isEmpty ? undefined : selection);
}

function getFullEditorText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void handleMissingEditor();
    return undefined;
  }

  return editor.document.getText();
}

async function handleMissingEditor(): Promise<void> {
  await handleError(new Error('No active editor'), { showToUser: true });
}
