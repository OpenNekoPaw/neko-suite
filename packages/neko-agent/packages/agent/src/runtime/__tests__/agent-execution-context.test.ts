import { describe, expect, it } from 'vitest';
import {
  buildAgentSessionExecutionContext,
  createAgentParentAgentId,
} from '../agent-execution-context';

describe('agent execution context', () => {
  it('builds parent agent ids from conversation ids', () => {
    expect(createAgentParentAgentId('conv-1')).toBe('agent-conv-1');
  });

  it('projects turn context into session execution context metadata', () => {
    expect(
      buildAgentSessionExecutionContext({
        conversationId: 'conv-1',
        context: {
          workspaceRoot: '/workspace',
          projectType: 'video',
          activeFile: 'file:///workspace/a.nks',
          metadata: { requestId: 'req-1' },
          multimodalContextPacket: { kind: 'packet' },
        },
      }),
    ).toEqual({
      workspaceRoot: '/workspace',
      projectType: 'video',
      activeFile: 'file:///workspace/a.nks',
      metadata: {
        requestId: 'req-1',
        multimodalContextPacket: { kind: 'packet' },
        conversationId: 'conv-1',
        parentAgentId: 'agent-conv-1',
      },
    });
  });

  it('allows explicit parent agent id overrides', () => {
    expect(
      buildAgentSessionExecutionContext({
        conversationId: 'child',
        parentAgentId: 'parent',
        context: {},
      }).metadata,
    ).toEqual({
      conversationId: 'child',
      parentAgentId: 'parent',
    });
  });
});
