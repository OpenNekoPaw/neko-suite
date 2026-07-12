import type {
  CreateSkillInput,
  CreateSkillResult,
  ISkillRegistry,
  IToolRegistry,
  Skill,
  SkillInjection,
} from '@neko/shared';
import type {
  ActiveSkillLifecycleProjection,
  SkillLifecycleDeactivationRequest,
  SkillLifecycleProjection,
} from '@neko/shared';
import { SkillRegistry } from './skill-registry';
import { createSkillService, type SkillService } from './skill-service';
import {
  buildSkillAwareSystemPrompt,
  getEnabledSkillPromptEntries,
  toSkillPromptEntries,
} from './skill-system-prompt';
import {
  SkillRegistryPopulator,
  type LazySkillRegistryScanResult,
  type SkillRegistryPopulationSummary,
} from './skill-registry-populator';
import { createConversationSkillProvider } from './skill-meta-provider';
import type { ISubpackageResolver } from './subpackage-guard';
import type {
  SkillActivationProviderResult,
  SkillActivationRequest,
  SkillDeactivationProviderResult,
  SkillProviderFactory,
} from '../tools/core/meta-tools';

export interface RuntimeSkillAwareSystemPromptResult {
  readonly prompt: string;
  readonly enabledSkillCount: number;
}

export interface BuildRuntimeSkillAwareSystemPromptInput {
  readonly basePrompt: string;
  readonly skillService: Pick<SkillService, 'registry'>;
  readonly locale?: string;
}

export interface PopulateLazyRuntimeSkillRegistryInput {
  readonly skillService: Pick<SkillService, 'registry'>;
  readonly populator: SkillRegistryPopulator;
  readonly scanResult: LazySkillRegistryScanResult;
  readonly builtinSkills?: readonly Skill[];
}

export interface RuntimeSkillLazySyncLogger {
  warn(message: string, details?: unknown): void;
}

export interface RuntimeSkillLazySyncOptions {
  readonly scanLazy: () => Promise<LazySkillRegistryScanResult>;
  readonly populateLazy: (
    scanResult: LazySkillRegistryScanResult,
  ) => SkillRegistryPopulationSummary;
  readonly logger?: RuntimeSkillLazySyncLogger;
  readonly initialFailureMessage?: string;
  readonly refreshFailureMessage?: string;
}

export interface RuntimeSkillLazySync {
  syncInitial(): Promise<SkillRegistryPopulationSummary | null>;
  resync(): Promise<SkillRegistryPopulationSummary | null>;
}

export interface RuntimeSkillBootstrapLogger {
  debug?(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn?(message: string, details?: unknown): void;
  error?(message: string, details?: unknown): void;
}

export interface RuntimeSkillBootstrapOptions {
  readonly registry?: ISkillRegistry;
  readonly toolRegistry?: IToolRegistry;
  readonly subpackageResolver?: ISubpackageResolver;
  readonly builtinSkills?: readonly Skill[];
  readonly skillService?: SkillService;
  readonly populator?: SkillRegistryPopulator;
  readonly locale?: string;
  readonly logger?: RuntimeSkillBootstrapLogger;
}

export interface RuntimeSkillProviderState {
  getActiveSkill(conversationId: string): { readonly skill: Skill } | undefined;
  getActiveSkillLifecycle?(conversationId: string): ActiveSkillLifecycleProjection;
  syncSkillLifecycleProjection?(conversationId: string): SkillLifecycleProjection | undefined;
  activateLifecycleSkill?(
    conversationId: string,
    input: SkillActivationRequest,
  ): Promise<SkillActivationProviderResult>;
  deactivateLifecycleSkill?(
    conversationId: string,
    input?: {
      readonly recordId?: string;
      readonly slot?: SkillLifecycleDeactivationRequest['slot'];
      readonly skillName?: string;
    },
  ): Promise<SkillDeactivationProviderResult>;
  applySkillInjection(
    conversationId: string,
    injection: SkillInjection,
    skill: Skill,
  ): void | Promise<void>;
  clearActiveSkill(conversationId: string): void | Promise<void>;
  createSkill?(conversationId: string, input: CreateSkillInput): Promise<CreateSkillResult>;
}

export interface RuntimeSkillBootstrap {
  readonly skillService: SkillService;
  buildSystemPrompt(basePrompt: string): RuntimeSkillAwareSystemPromptResult;
  populateLazy(scanResult: LazySkillRegistryScanResult): SkillRegistryPopulationSummary;
  createSkillProviderFactory(state: RuntimeSkillProviderState): SkillProviderFactory;
}

export function createRuntimeSkillBootstrap(
  options: RuntimeSkillBootstrapOptions = {},
): RuntimeSkillBootstrap {
  return new DefaultRuntimeSkillBootstrap(options);
}

export function buildRuntimeSkillAwareSystemPrompt(
  input: BuildRuntimeSkillAwareSystemPromptInput,
): RuntimeSkillAwareSystemPromptResult {
  const skills = toSkillPromptEntries(input.skillService.registry.listSkills());
  const enabledSkills = getEnabledSkillPromptEntries(skills);

  return {
    prompt: buildSkillAwareSystemPrompt({
      basePrompt: input.basePrompt,
      skills: enabledSkills,
      locale: input.locale,
    }),
    enabledSkillCount: enabledSkills.length,
  };
}

export function populateLazyRuntimeSkillRegistry(
  input: PopulateLazyRuntimeSkillRegistryInput,
): SkillRegistryPopulationSummary {
  return input.populator.populateLazy({
    registry: asMutableSkillRegistry(input.skillService.registry),
    scanResult: input.scanResult,
    builtinSkills: input.builtinSkills,
  });
}

export function createRuntimeSkillLazySync(
  options: RuntimeSkillLazySyncOptions,
): RuntimeSkillLazySync {
  return new DefaultRuntimeSkillLazySync(options);
}

function asMutableSkillRegistry(registry: ISkillRegistry): SkillRegistry {
  if (registry instanceof SkillRegistry) {
    return registry;
  }

  if (
    typeof (registry as { registerLazySkill?: unknown }).registerLazySkill === 'function' &&
    typeof (registry as { unregisterSkill?: unknown }).unregisterSkill === 'function'
  ) {
    return registry as SkillRegistry;
  }

  throw new Error('Runtime SkillService registry does not support lazy skill population');
}

class DefaultRuntimeSkillLazySync implements RuntimeSkillLazySync {
  constructor(private readonly options: RuntimeSkillLazySyncOptions) {}

  syncInitial(): Promise<SkillRegistryPopulationSummary | null> {
    return this.sync(
      this.options.initialFailureMessage ?? 'Failed to lazy-load initial skills into SkillService:',
    );
  }

  resync(): Promise<SkillRegistryPopulationSummary | null> {
    return this.sync(this.options.refreshFailureMessage ?? 'Failed to lazy-rescan skills:');
  }

  private async sync(failureMessage: string): Promise<SkillRegistryPopulationSummary | null> {
    try {
      return this.options.populateLazy(await this.options.scanLazy());
    } catch (error) {
      this.options.logger?.warn(failureMessage, error);
      return null;
    }
  }
}

class DefaultRuntimeSkillBootstrap implements RuntimeSkillBootstrap {
  readonly skillService: SkillService;
  private readonly populator: SkillRegistryPopulator;
  private readonly builtinSkills: readonly Skill[] | undefined;
  private readonly locale: string | undefined;
  private readonly logger: RuntimeSkillBootstrapLogger | undefined;

  constructor(options: RuntimeSkillBootstrapOptions) {
    this.skillService =
      options.skillService ??
      createSkillService({
        registry: options.registry ?? new SkillRegistry(),
        toolRegistry: options.toolRegistry,
        subpackageResolver: options.subpackageResolver,
      });
    this.populator = options.populator ?? new SkillRegistryPopulator();
    this.builtinSkills = options.builtinSkills;
    this.locale = options.locale;
    this.logger = options.logger;
  }

  buildSystemPrompt(basePrompt: string): RuntimeSkillAwareSystemPromptResult {
    const result = buildRuntimeSkillAwareSystemPrompt({
      basePrompt,
      skillService: this.skillService,
      locale: this.locale,
    });

    this.logger?.debug?.(`Building system prompt with ${result.enabledSkillCount} skills`);
    return result;
  }

  populateLazy(scanResult: LazySkillRegistryScanResult): SkillRegistryPopulationSummary {
    const summary = populateLazyRuntimeSkillRegistry({
      skillService: this.skillService,
      populator: this.populator,
      scanResult,
      builtinSkills: this.builtinSkills,
    });

    this.logger?.info(`Skill registry populated (lazy): ${summary.total} skills`, {
      builtin: summary.builtin,
      personalLazy: summary.personal,
      projectLazy: summary.project,
      personalLazyCommands: summary.personalCommands,
      projectLazyCommands: summary.projectCommands,
    });
    return summary;
  }

  createSkillProviderFactory(state: RuntimeSkillProviderState): SkillProviderFactory {
    return (conversationId) => {
      const getActiveSkillLifecycle = state.getActiveSkillLifecycle;
      const syncSkillLifecycleProjection = state.syncSkillLifecycleProjection;
      const activateLifecycleSkill = state.activateLifecycleSkill;
      const deactivateLifecycleSkill = state.deactivateLifecycleSkill;
      const createSkill = state.createSkill;

      return createConversationSkillProvider({
        skillService: this.skillService,
        effects: {
          getActiveSkill: () => state.getActiveSkill(conversationId)?.skill,
          ...(getActiveSkillLifecycle
            ? {
                getActiveSkillLifecycle: () => getActiveSkillLifecycle(conversationId),
              }
            : {}),
          ...(activateLifecycleSkill
            ? {
                activateLifecycleSkill: async (input) => {
                  const result = await activateLifecycleSkill(conversationId, input);
                  if (result.success) {
                    syncSkillLifecycleProjection?.(conversationId);
                  }
                  return result;
                },
              }
            : {}),
          ...(deactivateLifecycleSkill
            ? {
                deactivateLifecycleSkill: async (input) => {
                  const result = await deactivateLifecycleSkill(conversationId, input);
                  if (result.success) {
                    syncSkillLifecycleProjection?.(conversationId);
                  }
                  return result;
                },
              }
            : {}),
          applySkillInjection: (injection, skill) =>
            state.applySkillInjection(conversationId, injection, skill),
          clearActiveSkill: () => state.clearActiveSkill(conversationId),
          ...(createSkill
            ? {
                createSkill: (input: CreateSkillInput) => createSkill(conversationId, input),
              }
            : {}),
        },
        logger: this.logger,
      });
    };
  }
}
