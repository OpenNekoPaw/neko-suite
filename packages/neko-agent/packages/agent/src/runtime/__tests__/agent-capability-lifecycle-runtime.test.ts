import { describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityInvocationInput,
  AgentCapabilityInvocationResult,
  AgentCapabilityLifecycleDescriptor,
} from '@neko/shared';
import {
  AgentCapabilityLifecycleRuntimeError,
  createAgentCapabilityLifecycleRuntime,
  toAgentCapabilityToolResult,
} from '../capability/agent-capability-lifecycle-runtime';

describe('AgentCapabilityLifecycleRuntime', () => {
  it('registers descriptors and lists them by capability id', () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = createDescriptor();

    runtime.registerDescriptor(descriptor);

    expect(runtime.getDescriptor(descriptor.capabilityId)).toBe(descriptor);
    expect(runtime.listDescriptors()).toEqual([descriptor]);
  });

  it('rejects invalid descriptors before registration', () => {
    const runtime = createAgentCapabilityLifecycleRuntime();

    expect(() =>
      runtime.registerDescriptor({
        ...createDescriptor(),
        phases: ['publish' as never],
      }),
    ).toThrow(AgentCapabilityLifecycleRuntimeError);
    expect(runtime.listDescriptors()).toEqual([]);
  });

  it('returns fail-visible diagnostics for unknown capabilities and missing handlers', async () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = createDescriptor();
    runtime.registerDescriptor(descriptor);

    await expect(
      runtime.invoke({
        capabilityId: 'canvas.unknown',
        phase: 'review',
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: [
        expect.objectContaining({ code: 'agent-capability-lifecycle-unknown-capability' }),
      ],
    });
    await expect(
      runtime.invoke({
        capabilityId: descriptor.capabilityId,
        phase: 'review',
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: [
        expect.objectContaining({ code: 'agent-capability-lifecycle-missing-handler' }),
      ],
    });
  });

  it('blocks unsupported phases and unapproved mutations before calling handlers', async () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = createDescriptor();
    const handler = vi.fn();
    runtime.registerDescriptor(descriptor);
    runtime.registerHandler(descriptor.capabilityId, handler);

    await expect(
      runtime.invoke({
        capabilityId: descriptor.capabilityId,
        phase: 'execute',
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: [
        expect.objectContaining({ code: 'agent-capability-lifecycle-unsupported-phase' }),
      ],
    });
    await expect(
      runtime.invoke({
        capabilityId: descriptor.capabilityId,
        phase: 'apply',
      }),
    ).resolves.toMatchObject({
      status: 'waiting-approval',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'agent-capability-lifecycle-approval-required' }),
        expect.objectContaining({ code: 'agent-capability-lifecycle-target-required' }),
      ]),
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('invokes approved handlers with descriptor context', async () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = createDescriptor();
    const input: AgentCapabilityInvocationInput = {
      capabilityId: descriptor.capabilityId,
      phase: 'apply',
      target: { containerId: 'scene-1' },
      approval: {
        source: 'creation-apply',
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        profileId: 'idc.default',
        stageId: 'apply',
      },
    };
    const result: AgentCapabilityInvocationResult = {
      capabilityId: descriptor.capabilityId,
      phase: 'apply',
      status: 'applied',
      diagnostics: [],
      changedRefs: [{ kind: 'node', id: 'shot-1', packageId: 'neko-canvas' }],
    };
    const handler = vi.fn(async () => result);

    runtime.registerDescriptor(descriptor);
    runtime.registerHandler(descriptor.capabilityId, handler);

    await expect(runtime.invoke(input)).resolves.toBe(result);
    expect(handler).toHaveBeenCalledWith(input, { descriptor });
  });

  it('keeps query-before-mutate guidance visible without blocking approved mutations', async () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = {
      ...createDescriptor(),
      queryBeforeMutate: {
        preferredQueryTools: ['canvas.getSelection'],
        reason: 'Resolve current Canvas selection before applying.',
      },
    };
    runtime.registerDescriptor(descriptor);
    runtime.registerHandler(descriptor.capabilityId, async (input) => ({
      capabilityId: input.capabilityId,
      phase: input.phase,
      status: 'applied',
      diagnostics: [],
    }));

    await expect(
      runtime.invoke({
        capabilityId: descriptor.capabilityId,
        phase: 'apply',
        target: { containerId: 'scene-1' },
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        provenance: {
          source: 'agent',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
        },
      }),
    ).resolves.toMatchObject({
      status: 'applied',
      diagnostics: [
        expect.objectContaining({
          code: 'agent-capability-lifecycle-query-before-mutate',
          severity: 'info',
        }),
      ],
    });
  });

  it('blocks handler results that do not match the invocation envelope', async () => {
    const runtime = createAgentCapabilityLifecycleRuntime();
    const descriptor = createDescriptor();
    runtime.registerDescriptor(descriptor);
    runtime.registerHandler(descriptor.capabilityId, async () => ({
      capabilityId: descriptor.capabilityId,
      phase: 'review',
      status: 'needs-review',
      diagnostics: [],
    }));

    await expect(
      runtime.invoke({
        capabilityId: descriptor.capabilityId,
        phase: 'apply',
        target: { containerId: 'scene-1' },
        approval: { source: 'user-confirmation' },
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'agent-capability-lifecycle-result-mismatch' }),
      ]),
    });
  });

  it('adapts lifecycle results into generic tool results without losing the envelope', () => {
    const blocked: AgentCapabilityInvocationResult = {
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      phase: 'apply',
      status: 'waiting-approval',
      diagnostics: [
        {
          severity: 'warning',
          code: 'agent-capability-lifecycle-approval-required',
          message: 'Approval required.',
        },
      ],
    };
    const applied: AgentCapabilityInvocationResult = {
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      phase: 'apply',
      status: 'applied',
      diagnostics: [],
    };

    expect(toAgentCapabilityToolResult(blocked)).toMatchObject({
      success: false,
      data: blocked,
      error: 'Approval required.',
    });
    expect(toAgentCapabilityToolResult(applied)).toEqual({
      success: true,
      data: applied,
    });
  });
});

function createDescriptor(): AgentCapabilityLifecycleDescriptor {
  return {
    capabilityId: 'canvas.createStoryboardFromMarkdown',
    providerId: 'neko-canvas',
    displayName: 'Create storyboard nodes',
    description: 'Create production storyboard nodes from a reviewed Markdown draft.',
    phases: ['validate', 'review', 'apply'],
    inputSchema: { id: 'canvas.markdown.input', version: 1 },
    resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
    accepts: ['markdown', 'gfm-table'],
    produces: ['canvas.storyboard'],
    risk: 'medium',
    requiresApproval: true,
    safetyKind: 'confirmation-gated',
    targetRequirements: {
      required: ['containerId'],
    },
  };
}
