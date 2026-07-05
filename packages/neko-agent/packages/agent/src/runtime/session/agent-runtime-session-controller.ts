import type { ConfiguredToolGroup, PromptFragment } from '@neko/shared';
import type { AgentSessionConfig, IAgentSession } from '../../session/types';
import {
  buildAgentRuntimeSessionFactoryConfig,
  type AgentRuntimeSessionAssemblyInput,
} from './runtime-host-bindings';
import { projectRuntimeToolGroups } from '../../skill/tool-group-projector';
import {
  createAgentRuntimeSession,
  unregisterAgentRuntimeSession,
  updateAgentRuntimeSession,
  type AgentRuntimeSessionHandle,
  type AgentRuntimeSessionUpdate,
} from './agent-session-factory';

export interface AgentRuntimeSessionControllerTarget {
  getSession(): IAgentSession | undefined;
  setSession(session: IAgentSession): void;
  configureSession(config: Partial<AgentSessionConfig>): void;
  setPromptFragments(fragments: readonly PromptFragment[] | undefined): void;
}

export interface AgentRuntimeSessionController {
  configure(input: AgentRuntimeSessionAssemblyInput): Promise<AgentRuntimeSessionHandle>;
  refresh(input: AgentRuntimeSessionAssemblyInput): AgentRuntimeSessionUpdate | null;
  getHandle(): AgentRuntimeSessionHandle | undefined;
  getToolSkills(): ConfiguredToolGroup[];
  dispose(): void;
}

export function createAgentRuntimeSessionController(
  target: AgentRuntimeSessionControllerTarget,
): AgentRuntimeSessionController {
  return new DefaultAgentRuntimeSessionController(target);
}

class DefaultAgentRuntimeSessionController implements AgentRuntimeSessionController {
  private handle?: AgentRuntimeSessionHandle;

  constructor(private readonly target: AgentRuntimeSessionControllerTarget) {}

  async configure(input: AgentRuntimeSessionAssemblyInput): Promise<AgentRuntimeSessionHandle> {
    const factoryConfig = buildAgentRuntimeSessionFactoryConfig({
      ...input,
      previousOperationToolAdapterRegistry:
        input.previousOperationToolAdapterRegistry ?? this.handle?.operationToolAdapterRegistry,
    });

    if (!this.target.getSession() || !this.handle) {
      this.handle = await createAgentRuntimeSession(factoryConfig);
      this.target.setSession(this.handle.session);
      return this.handle;
    }

    const update = updateAgentRuntimeSession(this.handle, factoryConfig);
    this.target.setPromptFragments(update.promptFragments);
    this.target.configureSession(update.sessionConfig);
    return this.handle;
  }

  refresh(input: AgentRuntimeSessionAssemblyInput): AgentRuntimeSessionUpdate | null {
    if (!this.target.getSession() || !this.handle) {
      return null;
    }

    const update = updateAgentRuntimeSession(
      this.handle,
      buildAgentRuntimeSessionFactoryConfig({
        ...input,
        previousOperationToolAdapterRegistry:
          input.previousOperationToolAdapterRegistry ?? this.handle.operationToolAdapterRegistry,
      }),
    );
    this.target.setPromptFragments(update.promptFragments);
    return update;
  }

  getHandle(): AgentRuntimeSessionHandle | undefined {
    return this.handle;
  }

  getToolSkills(): ConfiguredToolGroup[] {
    return projectRuntimeToolGroups(this.handle?.toolGroupRegistry);
  }

  dispose(): void {
    if (!this.handle) {
      return;
    }

    unregisterAgentRuntimeSession(this.handle);
    this.handle = undefined;
  }
}
