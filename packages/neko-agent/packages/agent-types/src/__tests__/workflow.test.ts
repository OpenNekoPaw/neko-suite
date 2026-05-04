import { describe, expect, it } from 'vitest';
import type { AgentWorkflowDefinition, AgentWorkflowRun } from '../workflow';
import { projectMediaTaskToWorkItem, projectSubAgentEventToWorkItem } from '../work-item-projector';

describe('workflow contracts', () => {
  it('represents IDC Draft, Plan, and Apply as workflow nodes', () => {
    const definition: AgentWorkflowDefinition = {
      id: 'workflow.idc.v1',
      version: '1.0.0',
      title: 'IDC Creation',
      nodes: [
        { id: 'draft', kind: 'idc-stage', title: 'Draft', status: 'pending', stage: 'draft' },
        { id: 'plan', kind: 'idc-stage', title: 'Plan', status: 'pending', stage: 'plan' },
        { id: 'apply', kind: 'idc-stage', title: 'Apply', status: 'pending', stage: 'apply' },
      ],
    };
    const run: AgentWorkflowRun = {
      id: 'run-1',
      definitionId: definition.id,
      conversationId: 'conv-1',
      status: 'running',
      activeNodeId: 'draft',
      nodes: definition.nodes,
      transitions: [],
      createdAt: 100,
      updatedAt: 100,
    };

    expect(run.nodes.map((node) => node.stage)).toEqual(['draft', 'plan', 'apply']);
  });

  it('preserves workflow identity on media and subagent work items', () => {
    const workflow = {
      workflowDefinitionId: 'workflow.idc.v1',
      workflowRunId: 'run-1',
      workflowNodeId: 'apply',
    };

    expect(
      projectMediaTaskToWorkItem({
        conversationId: 'conv-1',
        workflow,
        task: {
          id: 'media-1',
          type: 'video',
          status: 'processing',
          progress: 40,
          providerId: 'runway',
          modelId: 'gen-4',
          createdAt: '2026-05-04T00:00:00.000Z',
          updatedAt: '2026-05-04T00:00:01.000Z',
          request: { prompt: 'Generate a clip' },
        },
      }).workflow,
    ).toEqual(workflow);

    expect(
      projectSubAgentEventToWorkItem(
        {
          type: 'started',
          subAgentId: 'sub-1',
          parentAgentId: 'agent-1',
          conversationId: 'conv-1',
          timestamp: 100,
        },
        workflow,
      ).workflow,
    ).toEqual(workflow);
  });
});
