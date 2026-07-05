import type {
  AgentCapabilityAction,
  AgentCapabilityInvocationInput,
  AgentCapabilityInvocationResult,
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityLifecycleDiagnostic,
  AgentCapabilityLifecyclePhase,
  AgentCapabilityLifecycleTargetRef,
  ToolResult,
} from '@neko/shared';
import {
  createAgentCapabilityLifecycleDiagnostic,
  isAgentCapabilityInvocationResult,
  validateAgentCapabilityInvocationInput,
  validateAgentCapabilityInvocationResult,
  validateAgentCapabilityLifecycleDescriptor,
} from '@neko/shared';

export type AgentCapabilityLifecycleHandler = (
  input: AgentCapabilityInvocationInput,
  context: AgentCapabilityLifecycleHandlerContext,
) => Promise<AgentCapabilityInvocationResult> | AgentCapabilityInvocationResult;

export interface AgentCapabilityLifecycleHandlerContext {
  readonly descriptor: AgentCapabilityLifecycleDescriptor;
}

export interface AgentCapabilityLifecycleRuntime {
  registerDescriptor(descriptor: AgentCapabilityLifecycleDescriptor): void;
  registerManyDescriptors(descriptors: readonly AgentCapabilityLifecycleDescriptor[]): void;
  unregisterDescriptor(capabilityId: string): boolean;
  listDescriptors(): readonly AgentCapabilityLifecycleDescriptor[];
  getDescriptor(capabilityId: string): AgentCapabilityLifecycleDescriptor | undefined;
  registerHandler(capabilityId: string, handler: AgentCapabilityLifecycleHandler): void;
  unregisterHandler(capabilityId: string): boolean;
  invoke(input: AgentCapabilityInvocationInput): Promise<AgentCapabilityInvocationResult>;
}

export class AgentCapabilityLifecycleRuntimeError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly AgentCapabilityLifecycleDiagnostic[],
  ) {
    super(message);
    this.name = 'AgentCapabilityLifecycleRuntimeError';
  }
}

export function createAgentCapabilityLifecycleRuntime(): AgentCapabilityLifecycleRuntime {
  return new DefaultAgentCapabilityLifecycleRuntime();
}

export function toAgentCapabilityToolResult(result: AgentCapabilityInvocationResult): ToolResult {
  const blocked = result.status === 'blocked' || result.status === 'waiting-approval';
  return {
    success: !blocked,
    data: result,
    ...(blocked
      ? {
          error:
            result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
            result.diagnostics[0]?.message ??
            'Agent capability lifecycle invocation did not complete.',
        }
      : {}),
  };
}

class DefaultAgentCapabilityLifecycleRuntime implements AgentCapabilityLifecycleRuntime {
  private readonly descriptors = new Map<string, AgentCapabilityLifecycleDescriptor>();
  private readonly handlers = new Map<string, AgentCapabilityLifecycleHandler>();

  registerDescriptor(descriptor: AgentCapabilityLifecycleDescriptor): void {
    const diagnostics = validateAgentCapabilityLifecycleDescriptor(descriptor);
    if (diagnostics.length > 0) {
      throw new AgentCapabilityLifecycleRuntimeError(
        'Agent capability lifecycle descriptor is invalid.',
        diagnostics,
      );
    }
    this.descriptors.set(descriptor.capabilityId, descriptor);
  }

  registerManyDescriptors(descriptors: readonly AgentCapabilityLifecycleDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.registerDescriptor(descriptor);
    }
  }

  unregisterDescriptor(capabilityId: string): boolean {
    this.handlers.delete(capabilityId);
    return this.descriptors.delete(capabilityId);
  }

  listDescriptors(): readonly AgentCapabilityLifecycleDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  getDescriptor(capabilityId: string): AgentCapabilityLifecycleDescriptor | undefined {
    return this.descriptors.get(capabilityId);
  }

  registerHandler(capabilityId: string, handler: AgentCapabilityLifecycleHandler): void {
    if (!this.descriptors.has(capabilityId)) {
      throw new AgentCapabilityLifecycleRuntimeError(
        'Agent capability lifecycle handler references an unknown descriptor.',
        [
          createAgentCapabilityLifecycleDiagnostic(
            'error',
            'agent-capability-lifecycle-missing-descriptor',
            'Agent capability lifecycle handler must be registered after its descriptor.',
            'capabilityId',
          ),
        ],
      );
    }
    this.handlers.set(capabilityId, handler);
  }

  unregisterHandler(capabilityId: string): boolean {
    return this.handlers.delete(capabilityId);
  }

  async invoke(input: AgentCapabilityInvocationInput): Promise<AgentCapabilityInvocationResult> {
    const inputDiagnostics = validateAgentCapabilityInvocationInput(input);
    if (inputDiagnostics.length > 0) {
      return createBlockedResult(readCapabilityId(input), readPhase(input), inputDiagnostics);
    }

    const descriptor = this.descriptors.get(input.capabilityId);
    if (!descriptor) {
      return createBlockedResult(input.capabilityId, input.phase, [
        createAgentCapabilityLifecycleDiagnostic(
          'error',
          'agent-capability-lifecycle-unknown-capability',
          'Agent capability lifecycle descriptor is not registered.',
          'capabilityId',
        ),
      ]);
    }

    if (!descriptor.phases.includes(input.phase)) {
      return createBlockedResult(input.capabilityId, input.phase, [
        createAgentCapabilityLifecycleDiagnostic(
          'error',
          'agent-capability-lifecycle-unsupported-phase',
          'Agent capability lifecycle descriptor does not support the requested phase.',
          'phase',
        ),
      ]);
    }

    const preflightDiagnostics = validateLifecyclePreflight(input, descriptor);
    const blockingPreflightDiagnostics = preflightDiagnostics.filter(
      (diagnostic) =>
        diagnostic.severity === 'error' ||
        diagnostic.code === 'agent-capability-lifecycle-approval-required',
    );
    if (blockingPreflightDiagnostics.length > 0) {
      return {
        capabilityId: input.capabilityId,
        phase: input.phase,
        status: blockingPreflightDiagnostics.some(
          (diagnostic) => diagnostic.code === 'agent-capability-lifecycle-approval-required',
        )
          ? 'waiting-approval'
          : 'blocked',
        diagnostics: preflightDiagnostics,
      };
    }

    const handler = this.handlers.get(input.capabilityId);
    if (!handler) {
      return createBlockedResult(input.capabilityId, input.phase, [
        createAgentCapabilityLifecycleDiagnostic(
          'error',
          'agent-capability-lifecycle-missing-handler',
          'Agent capability lifecycle handler is not registered.',
          'capabilityId',
        ),
      ]);
    }

    try {
      const result = await handler(input, { descriptor });
      return mergePreflightDiagnostics(normalizeHandlerResult(input, result), preflightDiagnostics);
    } catch (error) {
      return createBlockedResult(input.capabilityId, input.phase, [
        createAgentCapabilityLifecycleDiagnostic(
          'error',
          'agent-capability-lifecycle-handler-failed',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
  }
}

function mergePreflightDiagnostics(
  result: AgentCapabilityInvocationResult,
  preflightDiagnostics: readonly AgentCapabilityLifecycleDiagnostic[],
): AgentCapabilityInvocationResult {
  if (preflightDiagnostics.length === 0) return result;
  return {
    ...result,
    diagnostics: [...preflightDiagnostics, ...result.diagnostics],
  };
}

function validateLifecyclePreflight(
  input: AgentCapabilityInvocationInput,
  descriptor: AgentCapabilityLifecycleDescriptor,
): readonly AgentCapabilityLifecycleDiagnostic[] {
  const diagnostics: AgentCapabilityLifecycleDiagnostic[] = [];
  if (isMutatingPhase(input.phase) && requiresApproval(descriptor) && !input.approval) {
    diagnostics.push(
      createAgentCapabilityLifecycleDiagnostic(
        'warning',
        'agent-capability-lifecycle-approval-required',
        'Agent capability lifecycle mutation requires approval before execution.',
        'approval',
      ),
    );
  }

  if (isMutatingPhase(input.phase)) {
    if (descriptor.queryBeforeMutate && !input.provenance?.toolCallId) {
      diagnostics.push(
        createAgentCapabilityLifecycleDiagnostic(
          'info',
          'agent-capability-lifecycle-query-before-mutate',
          descriptor.queryBeforeMutate.reason ??
            'Agent capability lifecycle mutation should resolve stable target context before execution.',
          'queryBeforeMutate',
        ),
      );
    }
    for (const field of descriptor.targetRequirements?.required ?? []) {
      if (!hasTargetField(input.target, field)) {
        diagnostics.push(
          createAgentCapabilityLifecycleDiagnostic(
            'error',
            'agent-capability-lifecycle-target-required',
            `Agent capability lifecycle mutation requires target field "${field}".`,
            `target.${field}`,
          ),
        );
      }
    }
  }
  return diagnostics;
}

function normalizeHandlerResult(
  input: AgentCapabilityInvocationInput,
  result: AgentCapabilityInvocationResult,
): AgentCapabilityInvocationResult {
  if (
    !isAgentCapabilityInvocationResult(result) ||
    result.capabilityId !== input.capabilityId ||
    result.phase !== input.phase
  ) {
    return createBlockedResult(input.capabilityId, input.phase, [
      ...validateAgentCapabilityInvocationResult(result),
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-result-mismatch',
        'Agent capability lifecycle handler returned a result that does not match the invocation.',
      ),
    ]);
  }
  return result;
}

function createBlockedResult(
  capabilityId: string,
  phase: AgentCapabilityLifecyclePhase,
  diagnostics: readonly AgentCapabilityLifecycleDiagnostic[],
): AgentCapabilityInvocationResult {
  return {
    capabilityId,
    phase,
    status: 'blocked',
    diagnostics,
  };
}

function requiresApproval(descriptor: AgentCapabilityLifecycleDescriptor): boolean {
  return (
    descriptor.requiresApproval ||
    descriptor.safetyKind === 'confirmation-gated' ||
    descriptor.safetyKind === 'destructive-mutation'
  );
}

function isMutatingPhase(phase: AgentCapabilityLifecyclePhase): boolean {
  return phase === 'apply' || phase === 'execute';
}

function hasTargetField(
  target: AgentCapabilityLifecycleTargetRef | undefined,
  field: string,
): boolean {
  if (!target) return false;
  const value = (target as unknown as Readonly<Record<string, unknown>>)[field];
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined;
}

function readCapabilityId(input: unknown): string {
  return isRecord(input) && typeof input['capabilityId'] === 'string'
    ? input['capabilityId']
    : 'unknown';
}

function readPhase(input: unknown): AgentCapabilityLifecyclePhase {
  return isRecord(input) && input['phase'] === 'describe' ? 'describe' : 'validate';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
