import type { ChatMessage, PromptFragment } from '@neko/shared';
import type { AgentExecutor } from '../executor';
import type { PromptContext } from '../prompt/context';
import type { SystemPromptComposer } from '../prompt/system-prompt-composer';
import type { ModuleOrchestrator } from '../prompt/composer/module-orchestrator';
import type { PromptModule } from '../prompt/registry/module-manifest';

export interface PromptRuntimeComposerPort {
  readonly promptComposer: SystemPromptComposer;
  readonly promptModuleOrchestrator: ModuleOrchestrator;
  readonly promptContextProvider: () => PromptContext;
}

export interface PromptRuntimeModulePort {
  readonly validationGuidanceModule: PromptRuntimeContentModule;
  readonly memoryRecallModule: PromptRuntimeContentModule;
  readonly creativeVersionLogModule: PromptRuntimeVersionLogModule;
  readonly subpackageFragmentsModule: PromptRuntimeFragmentsModule;
}

export interface PromptRuntimeContentModule extends PromptModule {
  readonly setContent: (content: string | null) => void;
}

export interface PromptRuntimeVersionLogModule extends PromptModule {
  readonly setSummary: (summary: string | null) => void;
}

export interface PromptRuntimeFragmentsModule extends PromptModule {
  readonly setFragments: (fragments: readonly PromptFragment[] | undefined) => void;
}

export interface PromptRuntimeExecutorPort {
  readonly getExecutor: () => AgentExecutor | null;
  readonly getCreativeVersionSummary: () => string | null;
}

export interface PromptRuntimeDiagnosticsPort {
  readonly debug: (message: string, data?: Record<string, unknown>) => void;
}

export interface PromptRuntimeFacadePorts {
  readonly composer: PromptRuntimeComposerPort;
  readonly modules: PromptRuntimeModulePort;
  readonly executor: PromptRuntimeExecutorPort;
  readonly diagnostics: PromptRuntimeDiagnosticsPort;
}

export interface PromptRuntimeFacadeOptions {
  readonly ports: PromptRuntimeFacadePorts;
}

export class PromptRuntimeFacade {
  private readonly _options: PromptRuntimeFacadeOptions;

  constructor(options: PromptRuntimeFacadeOptions) {
    this._options = options;
  }

  setBasePrompt(prompt: string): void {
    this._options.ports.composer.promptComposer.setBase(prompt);
  }

  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void {
    this._options.ports.modules.subpackageFragmentsModule.setFragments(fragments);
    this.applyModuleSync(this._options.ports.modules.subpackageFragmentsModule);
  }

  setMemoryRecallContent(content: string | null): void {
    this._options.ports.modules.memoryRecallModule.setContent(content);
  }

  setValidationGuidanceContent(content: string | null): void {
    this._options.ports.modules.validationGuidanceModule.setContent(content);
  }

  composeText(): string {
    return this._options.ports.composer.promptComposer.compose();
  }

  syncSystemPrompt(input: {
    readonly history: ChatMessage[];
    readonly historyEventIds: string[][];
  }): string[][] {
    this.applyModuleSync(this._options.ports.modules.validationGuidanceModule);
    this.applyModuleSync(this._options.ports.modules.memoryRecallModule);

    this._options.ports.modules.creativeVersionLogModule.setSummary(
      this._options.ports.executor.getCreativeVersionSummary(),
    );
    this.applyModuleSync(this._options.ports.modules.creativeVersionLogModule);

    const structured = this._options.ports.composer.promptComposer.composeStructured();
    let nextHistoryEventIds = input.historyEventIds;
    if (input.history.length > 0 && input.history[0]?.role === 'system') {
      input.history[0].content = structured.text;
      if (nextHistoryEventIds.length === 0) {
        nextHistoryEventIds = input.history.map(() => []);
      }
      nextHistoryEventIds[0] = [];
    }

    const executor = this._options.ports.executor.getExecutor();
    if (executor && structured.sections.length > 0) {
      executor.updateServiceOptions({
        systemPromptSections: structured.sections,
      });
    }

    const promptComposer = this._options.ports.composer.promptComposer;
    const promptSections = promptComposer.dumpSections();
    this._options.ports.diagnostics.debug('neko.agent.prompt.composed', {
      sectionCount: promptSections.length,
      textChars: structured.text.length,
      sectionChars: structured.sections.map((section, index) => ({
        index,
        chars: section.content.length,
        cacheControl: section.cacheControl,
      })),
      sections: promptSections,
      layerUsage: promptComposer.getLayerUsage(),
    });
    this._options.ports.diagnostics.debug('neko.agent.prompt.composed.raw', {
      text: structured.text,
      sections: structured.sections.map((section, index) => ({
        index,
        cacheControl: section.cacheControl,
        content: section.content,
      })),
      dump: promptSections,
    });

    return nextHistoryEventIds;
  }

  private applyModuleSync(module: PromptModule): void {
    this._options.ports.composer.promptModuleOrchestrator.applyOneSync(
      module,
      this._options.ports.composer.promptContextProvider(),
    );
  }
}
