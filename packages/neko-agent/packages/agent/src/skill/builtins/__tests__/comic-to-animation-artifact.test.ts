import { describe, expect, it } from 'vitest';
import {
  projectCompositeArtifactToCanvasStoryboardPayload,
  projectCompositeArtifactToCutStoryboardPayload,
  validateCompositeArtifact,
  type ArtifactProfileDescriptor,
  type CompositeArtifact,
} from '@neko/shared';
import { createAgentCapabilityInjectionRuntime } from '../../../runtime/agent-capability-injection-runtime';
import sampleArtifact from '../samples/comic-to-animation-composite-artifact.json';

const profileDescriptors: readonly ArtifactProfileDescriptor[] = [
  {
    profileId: 'comic-to-animation-plan',
    protocol: 'CompositeArtifact',
    version: 1,
    source: 'skill-local',
    blockComposition: [
      { kind: 'gallery', required: true, minCount: 1 },
      { kind: 'table', required: true, minCount: 1 },
      { kind: 'diagnostic', required: true, minCount: 1 },
    ],
  },
  {
    profileId: 'comic-shot-asset-prep',
    protocol: 'GenericTable',
    version: 1,
    source: 'skill-local',
    columns: [
      { columnId: 'shotId', cellType: 'string', required: true },
      {
        columnId: 'sourcePanel',
        cellType: 'media-preview',
        required: true,
        resourceMediaTypes: ['image'],
      },
      {
        columnId: 'motionPlan',
        cellType: 'json',
        required: true,
        schemaRef: 'neko.motion-plan.v1',
        shape: {
          requiredKeys: ['layer', 'durationMs', 'assetRef'],
          fieldTypes: { layer: 'string', durationMs: 'number', assetRef: 'string' },
        },
      },
    ],
  },
];

describe('comic-to-animation composite artifact sample', () => {
  it('validates the review-only sample with Skill-local profile descriptors', () => {
    const result = validateCompositeArtifact(sampleArtifact, {
      profiles: profileDescriptors,
      persisted: true,
      resolvedSchemaRefs: ['neko.motion-plan.v1'],
    });

    expect(result).toEqual({ ok: true, diagnostics: [] });
  });

  it('keeps suggested execution actions unavailable without provider registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: 'skill:comic-to-animation',
        source: 'builtin',
        sourceId: 'comic-to-animation',
        trustLevel: 'core',
      },
      metadata: {
        mediaWorkflow: {
          producedArtifacts: ['CompositeArtifact', 'GenericTable'],
          artifactProfiles: ['comic-shot-asset-prep', 'comic-to-animation-plan'],
          referencedCapabilities: ['canvas.importStoryboard', 'cut.importStoryboard'],
        },
      },
    });

    expect(runtime.findArtifactCapabilities('canvas.importStoryboard')).toEqual([]);
    expect(sampleArtifact.suggestedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'canvas.importStoryboard',
          disabled: true,
          disabledReason: 'Provider unavailable',
        }),
      ]),
    );
  });

  it('projects the reviewed storyboard domain block when Canvas and Cut providers are registered', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      {
        identity: {
          id: 'provider:canvas',
          source: 'provider',
          sourceId: 'neko-canvas',
          trustLevel: 'core',
        },
        artifactFacets: {
          projectors: [
            {
              id: 'projector:storyboard-to-canvas',
              accepts: ['StoryboardTable'],
              produces: ['CanvasStoryboardPayload'],
              profiles: ['manga-to-video'],
              lazy: true,
            },
          ],
          capabilities: [
            {
              capabilityId: 'canvas.importStoryboard',
              packageId: 'neko-canvas',
              accepts: ['CanvasStoryboardPayload'],
              produces: ['canvas-node-ref'],
              actions: ['canvas.importStoryboard'],
              risk: 'medium',
              requiresApproval: true,
            },
          ],
        },
      },
      {
        identity: {
          id: 'provider:cut',
          source: 'provider',
          sourceId: 'neko-cut',
          trustLevel: 'core',
        },
        artifactFacets: {
          projectors: [
            {
              id: 'projector:storyboard-to-cut',
              accepts: ['StoryboardTable'],
              produces: ['CutStoryboardImportPayload'],
              profiles: ['manga-to-video'],
              lazy: true,
            },
          ],
          capabilities: [
            {
              capabilityId: 'cut.importStoryboard',
              packageId: 'neko-cut',
              accepts: ['CutStoryboardImportPayload'],
              produces: ['timeline-element-ref'],
              actions: ['cut.importStoryboard'],
              risk: 'medium',
              requiresApproval: true,
            },
          ],
        },
      },
    ]);

    expect(runtime.findArtifactCapabilities('canvas.importStoryboard')).toHaveLength(1);
    expect(runtime.findArtifactCapabilities('cut.importStoryboard')).toHaveLength(1);

    const artifact = sampleArtifact as CompositeArtifact;
    const canvasProjection = projectCompositeArtifactToCanvasStoryboardPayload({ artifact });
    const cutProjection = projectCompositeArtifactToCutStoryboardPayload({
      artifact,
      options: {
        resolveImagePath: () => '${WORKSPACE}/comic/panel-1.png',
      },
    });

    expect(canvasProjection.diagnostics).toEqual([]);
    expect(canvasProjection.payload?.scenes[0]?.shotPlans[0]).toMatchObject({
      shotNumber: 1,
      dialogue: 'We have to run.',
    });
    expect(cutProjection.diagnostics).toEqual([]);
    expect(cutProjection.payload?.shots[0]).toMatchObject({
      id: 'shot-1',
      imagePath: '${WORKSPACE}/comic/panel-1.png',
    });
  });
});
