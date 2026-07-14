import type {
  AgentConfig,
  IOperationToolAdapterRegistry,
  IService,
  IToolCategoryRegistry,
  IToolRegistry,
  PromptFragment,
} from '@neko/shared';
import {
  createSubAgentSystem,
  registerSubAgentTools,
  type SubAgentCreateAgentContext,
  type SubAgentEvent,
  type SubAgentEventListener,
  type SubAgentExecutor,
  type ModelTier,
  type ModelTierResolver,
  type SubAgentSystem,
  type SpecializedAgentPreset,
} from '../subagent';
import type { AgentSessionConfig } from '../session/types';
import { createAgentSessionWithRuntime } from './session/session-config-projection';
import { summarizeAgentEventProgress } from './turn/message-runtime';
import { createNodeWorkspaceRuntimeStore } from './session/node-workspace-runtime-store';
import type { ICapabilityRuntime, IValidationLoop, IWorkspaceRuntimeStore } from './types';
import type { WorkspaceFileIgnoreRules } from '../input/workspace-ignore';
import type { SupportedLocale } from '@neko/shared/i18n';

export interface AgentSubAgentSystemConfig {
  readonly createService: () => IService;
  readonly toolRegistry: IToolRegistry;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly registerTools?: boolean;
  readonly specializedPresets?: Readonly<Record<string, SpecializedAgentPreset>>;
}

export interface AgentSubAgentRuntimeRegistration {
  readonly conversationId?: string;
  readonly workspaceRoot?: string;
  readonly authorizedReadRoots?: readonly string[];
  readonly workspaceIgnoreRules?: WorkspaceFileIgnoreRules;
  readonly createService: () => IService;
  readonly toolRegistry: IToolRegistry;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly promptLocale: SupportedLocale;
  readonly modelTierResolver?: ModelTierResolver;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly promptFragments?: readonly PromptFragment[];
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly workspaceStore?: IWorkspaceRuntimeStore;
  readonly validationLoop?: IValidationLoop;
  readonly perceptionClients?: AgentSessionConfig['perceptionClients'];
}

type RegisteredAgentSubAgentRuntime = AgentSubAgentRuntimeRegistration & {
  readonly conversationId: string;
};

/**
 * Owns SubAgent runtime wiring without depending on VSCode.
 *
 * Hosts only provide service/tool adapters and subscribe to emitted events.
 */
export class SubAgentRuntimeCoordinator {
  private _system?: SubAgentSystem;
  private readonly _runtimes = new Map<string, RegisteredAgentSubAgentRuntime>();
  private readonly _listeners = new Set<SubAgentEventListener>();
  private _unsubscribeSystemEvents?: () => void;

  ensureSystem(config: AgentSubAgentSystemConfig): void {
    if (this._system) {
      const hasSubAgentTool =
        config.toolRegistry.has?.('subagent') ??
        config.toolRegistry.list().some((tool) => tool.name === 'subagent');
      if (!hasSubAgentTool) {
        registerSubAgentTools(config.toolRegistry, this._system.manager);
      }
      return;
    }

    this._system = createSubAgentSystem({
      createService: config.createService,
      createAgent: (agentConfig, _hooks, context) =>
        this._createSubAgentExecutor(agentConfig, context),
      toolRegistry: config.toolRegistry,
      modelTierResolver: (tier, context) => this._resolveModelTier(tier, context),
      ...(config.capabilityRuntime?.skillService
        ? { skillService: config.capabilityRuntime.skillService }
        : {}),
      ...(config.capabilityRuntime?.toolGroupRegistry
        ? { toolSkillRegistry: config.capabilityRuntime.toolGroupRegistry }
        : {}),
      ...(config.specializedPresets ? { specializedPresets: config.specializedPresets } : {}),
      ...(config.registerTools !== undefined ? { registerTools: config.registerTools } : {}),
    });

    this._unsubscribeSystemEvents = this._system.manager.onEvent((event) => {
      this._emit(event);
    });
  }

  registerRuntime(registration: AgentSubAgentRuntimeRegistration): void {
    const conversationId = registration.conversationId;
    if (conversationId) {
      this._runtimes.set(conversationId, { ...registration, conversationId });
    }
  }

  unregisterRuntime(conversationId: string | undefined): void {
    if (conversationId) {
      this._runtimes.delete(conversationId);
    }
  }

  onEvent(listener: SubAgentEventListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  dispose(): void {
    this._unsubscribeSystemEvents?.();
    this._unsubscribeSystemEvents = undefined;
    this._system?.dispose();
    this._system = undefined;
    this._runtimes.clear();
    this._listeners.clear();
  }

  private _resolveRuntime(
    context: { readonly conversationId: string } | undefined,
  ): RegisteredAgentSubAgentRuntime {
    const conversationId = context?.conversationId;
    if (!conversationId) {
      throw new Error('SubAgent runtime requires conversationId');
    }

    const runtime = this._runtimes.get(conversationId);
    if (!runtime) {
      throw new Error(`SubAgent runtime is not configured for conversation: ${conversationId}`);
    }
    return runtime;
  }

  private _resolveModelTier(
    tier: ModelTier,
    context: Parameters<ModelTierResolver>[1],
  ): ReturnType<ModelTierResolver> {
    const runtime = this._resolveRuntime(context);
    const resolved = runtime.modelTierResolver?.(tier, context);
    if (resolved) {
      return resolved;
    }
    return runtime.providerId && runtime.modelId
      ? { providerId: runtime.providerId, modelId: runtime.modelId }
      : undefined;
  }

  private _createSubAgentExecutor(
    agentConfig: AgentConfig,
    context: SubAgentCreateAgentContext | undefined,
  ): SubAgentExecutor {
    const runtime = this._resolveRuntime(context);
    let session: ReturnType<typeof createAgentSessionWithRuntime> | undefined;

    return {
      execute: async (prompt, executorOptions) => {
        const conversationId = runtime.conversationId;
        session = createAgentSessionWithRuntime({
          service: runtime.createService(),
          toolRegistry: runtime.toolRegistry,
          systemPrompt: agentConfig.systemPrompt,
          executionMode: 'auto',
          maxIterations: agentConfig.maxIterations,
          providerId: agentConfig.providerId,
          modelId: agentConfig.primaryModel,
          locale: runtime.promptLocale === 'zh-cn' ? 'zh' : 'en',
          runtime: {
            capabilityRuntime: {
              ...(runtime.capabilityRuntime?.skillService
                ? { skillService: runtime.capabilityRuntime.skillService }
                : {}),
              ...(runtime.capabilityRuntime?.skillRegistry
                ? { skillRegistry: runtime.capabilityRuntime.skillRegistry }
                : {}),
              ...(runtime.capabilityRuntime?.toolGroupRegistry
                ? { toolGroupRegistry: runtime.capabilityRuntime.toolGroupRegistry }
                : {}),
              ...(runtime.promptFragments !== undefined
                ? { promptFragments: runtime.promptFragments }
                : {}),
              ...(runtime.toolCategoryRegistry
                ? { toolCategoryRegistry: runtime.toolCategoryRegistry }
                : {}),
              ...(runtime.capabilityRuntime?.providerCardRegistry
                ? { providerCardRegistry: runtime.capabilityRuntime.providerCardRegistry }
                : {}),
              ...(runtime.capabilityRuntime?.externalProcessorRuntime
                ? {
                    externalProcessorRuntime: runtime.capabilityRuntime.externalProcessorRuntime,
                  }
                : {}),
              ...(runtime.capabilityRuntime?.contentAccessRuntime
                ? {
                    contentAccessRuntime: runtime.capabilityRuntime.contentAccessRuntime,
                  }
                : {}),
              ...(runtime.operationToolAdapterRegistry
                ? { operationToolAdapterRegistry: runtime.operationToolAdapterRegistry }
                : {}),
            },
            workspaceStore:
              runtime.workspaceStore ??
              createNodeWorkspaceRuntimeStore({
                ...(runtime.workspaceRoot ? { workspaceRoot: runtime.workspaceRoot } : {}),
              }),
            ...(runtime.validationLoop ? { validationLoop: runtime.validationLoop } : {}),
          },
          conversationId,
          ...(runtime.perceptionClients ? { perceptionClients: runtime.perceptionClients } : {}),
        });

        let response = '';
        let iterations = 0;
        let success = true;
        if (!context) throw new Error('SubAgent executor requires complete child-run scope');
        const parentAgentId = context.scope.childRunId;
        for await (const event of session.execute(prompt, {
          workspaceRoot: runtime.workspaceRoot,
          metadata: {
            conversationId,
            runId: context.scope.runId,
            parentAgentId,
          },
        })) {
          const progress = summarizeAgentEventProgress(event);
          if (progress) {
            executorOptions?.onProgress?.(progress);
          }
          if (event.type === 'text' || event.type === 'text_delta') {
            response += event.content ?? '';
          }
          if (event.type === 'iteration') {
            iterations = event.iteration?.current ?? iterations;
          }
          if (event.type === 'error') {
            success = false;
            response += event.error?.message ?? '';
          }
        }

        return { success, response, iterations };
      },
      abort: () => {
        session?.cancel();
      },
    };
  }

  private _emit(event: SubAgentEvent): void {
    for (const listener of this._listeners) {
      listener(event);
    }
  }
}
