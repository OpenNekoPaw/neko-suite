import type { ConfiguredToolGroup } from '@neko/shared';
import {
  projectRuntimeToolGroups,
  type RuntimeToolGroupRegistryView,
} from '../../skill/tool-group-projector';
import type { CapabilityRuntimeBindings } from './capability-runtime-bindings';

export interface CapabilityRuntimeRefreshLogger {
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface CapabilityRuntimeRefreshResult {
  readonly refreshedAgentRuntime: boolean;
  readonly toolSkills: ConfiguredToolGroup[];
}

export interface CapabilityRuntimeRefreshRuntime {
  syncToolSkills(): ConfiguredToolGroup[];
  handleCapabilityChanged(): CapabilityRuntimeRefreshResult;
}

export interface CapabilityRuntimeRefreshOptions {
  readonly getBindings: () => Readonly<CapabilityRuntimeBindings>;
  readonly refreshAgentRuntime?: () => void;
  readonly setToolSkills?: (toolSkills: ConfiguredToolGroup[]) => void;
  readonly logger?: CapabilityRuntimeRefreshLogger;
}

export function createCapabilityRuntimeRefreshRuntime(
  options: CapabilityRuntimeRefreshOptions,
): CapabilityRuntimeRefreshRuntime {
  return new DefaultCapabilityRuntimeRefreshRuntime(options);
}

class DefaultCapabilityRuntimeRefreshRuntime implements CapabilityRuntimeRefreshRuntime {
  constructor(private readonly options: CapabilityRuntimeRefreshOptions) {}

  syncToolSkills(): ConfiguredToolGroup[] {
    try {
      const toolGroupRegistry = this.options.getBindings().toolGroupRegistry;
      if (!isRuntimeToolGroupRegistryView(toolGroupRegistry)) {
        this.options.logger?.warn(
          'ToolGroupRegistry unavailable; skipping ToolSkills initialization',
        );
        return [];
      }

      const toolSkills = projectRuntimeToolGroups(toolGroupRegistry);
      this.options.setToolSkills?.(toolSkills);
      return toolSkills;
    } catch (error) {
      this.options.logger?.error('Failed to initialize ToolSkills:', error);
      return [];
    }
  }

  handleCapabilityChanged(): CapabilityRuntimeRefreshResult {
    let refreshedAgentRuntime = false;

    try {
      this.options.refreshAgentRuntime?.();
      refreshedAgentRuntime = this.options.refreshAgentRuntime !== undefined;
    } catch (error) {
      this.options.logger?.error('Failed to refresh capability runtime:', error);
    }

    return {
      refreshedAgentRuntime,
      toolSkills: this.syncToolSkills(),
    };
  }
}

function isRuntimeToolGroupRegistryView(value: unknown): value is RuntimeToolGroupRegistryView {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { list?: unknown }).list === 'function'
  );
}
