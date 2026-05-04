import { describe, expect, it, vi } from 'vitest';
import {
  buildTurnMultimodalContextPacket,
  createCanvasSelectionContextPacket,
  createMediaAttachmentContextPacket,
  createTimelineSelectionContextPacket,
  filterToolsByModalityAvailability,
  loadPacketMediaPayloads,
  projectGeneratedArtifactReference,
} from '../multimodal-context-packet';

describe('multimodal-context-packet runtime', () => {
  it('builds one packet from image attachments, timeline, canvas, audio/video metadata, and workflow links', () => {
    const timeline = createTimelineSelectionContextPacket(
      [
        {
          elementId: 'clip-1',
          trackId: 'v1',
          sourceUri: '${WORKSPACE}/media/clip.mp4',
          mediaType: 'video',
          durationMs: 4000,
        },
      ],
      { createdAt: 10, playheadMs: 1200 },
    );
    const canvas = createCanvasSelectionContextPacket(
      [
        {
          nodeId: 'shot-1',
          type: 'shot',
          summary: 'Hero shot',
          assetUri: '${WORKSPACE}/shot.png',
          assetKind: 'image',
        },
      ],
      { createdAt: 10 },
    );

    const packet = buildTurnMultimodalContextPacket({
      conversationId: 'conv-1',
      workflow: {
        workflowDefinitionId: 'neko.workflow.idc.v1',
        workflowRunId: 'run-1',
        workflowNodeId: 'draft',
      },
      message: 'revise this scene',
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'YWJj' }],
      mediaAttachments: [
        {
          id: 'voice',
          uri: '${WORKSPACE}/voice.wav',
          modality: 'audio',
          metadata: {
            mimeType: 'audio/wav',
            durationMs: 1800,
            sampleRate: 48000,
            uriPolicy: 'workspace-uri',
          },
        },
        {
          id: 'reference-video',
          uri: '${WORKSPACE}/ref.mp4',
          modality: 'video',
          metadata: {
            mimeType: 'video/mp4',
            durationMs: 2400,
            frameRate: 24,
            uriPolicy: 'workspace-uri',
          },
        },
      ],
      timelineContextPacket: timeline,
      canvasContextPacket: canvas,
      createdAt: 20,
    });

    expect(packet).toMatchObject({
      metadata: {
        conversationId: 'conv-1',
        workflow: {
          workflowRunId: 'run-1',
          workflowNodeId: 'draft',
        },
      },
      uiContext: {
        userAnnotation: 'revise this scene',
      },
    });
    expect(packet?.perceptionInputs.map((input) => input.modality)).toEqual([
      'text',
      'image',
      'audio',
      'video',
      'image',
      'image',
    ]);
    expect(packet?.artifactRefs.map((artifact) => artifact.kind)).toEqual([
      'image',
      'audio',
      'video',
      'video',
      'image',
    ]);
  });

  it('records evidence as withheld when evidence injection is disabled', () => {
    const packet = buildTurnMultimodalContextPacket({
      message: 'inspect video',
      evidenceRefs: [
        {
          id: 'evidence-1',
          source: 'engine',
          modality: 'video',
          summary: 'Motion evidence',
        },
      ],
      includeEvidence: false,
      createdAt: 1,
    });

    expect(packet?.metadata?.['evidenceRefs']).toEqual([
      {
        id: 'evidence-1',
        source: 'engine',
        modality: 'video',
        summary: 'Motion evidence',
        withheld: true,
      },
    ]);
  });

  it('filters modality-gated tools using packet evidence availability', () => {
    const packet = createMediaAttachmentContextPacket({
      id: 'clip',
      uri: '${WORKSPACE}/clip.mp4',
      modality: 'video',
      metadata: { mimeType: 'video/mp4' },
      createdAt: 1,
    });

    expect(
      filterToolsByModalityAvailability(
        [
          {
            toolName: 'video_quality',
            acceptedModalities: ['video'],
            requiredEvidence: ['video'],
          },
          {
            toolName: 'audio_quality',
            acceptedModalities: ['audio'],
            requiredEvidence: ['audio'],
          },
          {
            toolName: 'read_file',
            acceptedModalities: ['text', 'data'],
          },
        ],
        packet,
        ['video_quality', 'audio_quality', 'read_file'],
      ),
    ).toEqual(['video_quality', 'read_file']);
  });

  it('keeps media payload loading behind a host adapter', async () => {
    const packet = createMediaAttachmentContextPacket({
      id: 'image',
      uri: '${WORKSPACE}/image.png',
      modality: 'image',
      metadata: { mimeType: 'image/png' },
      createdAt: 1,
    });
    const adapter = {
      loadMediaPayload: vi.fn(async () => ({
        encoding: 'base64' as const,
        data: 'abc',
        mimeType: 'image/png',
      })),
    };

    await expect(loadPacketMediaPayloads(packet, adapter)).resolves.toEqual([
      { encoding: 'base64', data: 'abc', mimeType: 'image/png' },
    ]);
    expect(adapter.loadMediaPayload).toHaveBeenCalledWith({
      artifactId: 'artifact-attachment-image',
      uri: '${WORKSPACE}/image.png',
      modality: 'image',
      preferredEncoding: 'base64',
    });
  });

  it('projects generated media artifacts with workflow and task linkage', () => {
    expect(
      projectGeneratedArtifactReference({
        id: 'asset-1',
        type: 'video',
        uri: '${WORKSPACE}/out.mp4',
        mimeType: 'video/mp4',
        conversationId: 'conv-1',
        taskId: 'task-1',
        toolCallId: 'tool-1',
        workflow: {
          workflowDefinitionId: 'neko.workflow.idc.v1',
          workflowRunId: 'run-1',
          workflowNodeId: 'apply',
        },
      }),
    ).toMatchObject({
      artifactRefs: [
        {
          id: 'generated-asset-1',
          kind: 'video',
          uri: '${WORKSPACE}/out.mp4',
          mimeType: 'video/mp4',
          metadata: {
            conversationId: 'conv-1',
            taskId: 'task-1',
            toolCallId: 'tool-1',
            workflow: {
              workflowRunId: 'run-1',
              workflowNodeId: 'apply',
            },
          },
        },
      ],
    });
  });
});
