import { describe, expect, it, vi } from 'vitest';
import type { CanvasStoryboardPayload, EntityMemoryContribution } from '@neko/shared';
import { StoryboardDeliveryService, injectEntityDecisionRefs } from './storyboardDeliveryService';

describe('StoryboardDeliveryService', () => {
  it('injects matched existing entity refs by stable character id', () => {
    const result = injectEntityDecisionRefs(makePayload(), [
      {
        kind: 'matched-existing',
        name: 'Rin',
        storyboardCharacterId: 'story-char-rin',
        entityRef: { entityId: 'char_rin', entityKind: 'character' },
      },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(firstCharacter(result.payload)).toEqual(
      expect.objectContaining({
        characterId: 'story-char-rin',
        entityRef: { entityId: 'char_rin', entityKind: 'character' },
      }),
    );
  });

  it('injects matched candidate ids by shot number and character index', () => {
    const result = injectEntityDecisionRefs(makePayload(), [
      {
        kind: 'matched-candidate',
        name: 'Rin',
        candidateId: 'candidate:character:rin',
        shotNumber: 1,
        characterIndex: 0,
      },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(firstCharacter(result.payload)).toEqual(
      expect.objectContaining({
        candidateId: 'candidate:character:rin',
      }),
    );
  });

  it('injects created candidate ids by source provenance', () => {
    const result = injectEntityDecisionRefs(makePayload(), [
      {
        kind: 'created-candidate',
        name: 'Rin',
        candidateId: 'candidate:character:new-rin',
        provenance: { sourceRef: 'panel-1:rin' },
      },
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(firstCharacter(result.payload)).toEqual(
      expect.objectContaining({
        candidateId: 'candidate:character:new-rin',
      }),
    );
  });

  it('records a timeout diagnostic and leaves characters unlinked', async () => {
    const service = new StoryboardDeliveryService({
      defaultTimeoutMs: 1,
      entityAutomation: {
        processContribution: () => new Promise(() => undefined),
      },
    });

    const result = await service.prepare({
      payload: makePayload(),
      entityContribution: {
        contribution: makeContribution(),
        toolCallId: 'tool-1',
      },
    });

    expect(firstCharacter(result.payload).candidateId).toBeUndefined();
    expect(result.payload.diagnostics).toEqual([
      expect.objectContaining({
        code: 'missing-capability',
        details: expect.objectContaining({ reason: 'timeout' }),
      }),
    ]);
  });

  it('does not write by name when same-name characters are ambiguous', () => {
    const payload = makePayload({
      characters: [{ characterName: 'Rin' }, { characterName: 'Rin' }],
    });

    const result = injectEntityDecisionRefs(payload, [
      {
        kind: 'created-candidate',
        name: 'Rin',
        candidateId: 'candidate:character:rin',
      },
    ]);

    expect(result.payload.scenes[0]?.shotPlans[0]?.characters).toEqual([
      { characterName: 'Rin' },
      { characterName: 'Rin' },
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'backfill-target-not-found',
        details: expect.objectContaining({ reason: 'candidate-ambiguous' }),
      }),
    ]);
  });

  it('processes contribution before returning an import payload', async () => {
    const processContribution = vi.fn().mockResolvedValue({
      contributionId: 'contribution-1',
      decisions: [
        {
          kind: 'created-candidate',
          name: 'Rin',
          candidateId: 'candidate:character:rin',
          storyboardCharacterId: 'story-char-rin',
        },
      ],
    });
    const service = new StoryboardDeliveryService({
      entityAutomation: { processContribution },
    });

    const result = await service.prepare({
      payload: makePayload(),
      entityContribution: {
        contribution: makeContribution(),
        toolCallId: 'tool-1',
      },
    });

    expect(processContribution).toHaveBeenCalledWith({
      contribution: makeContribution(),
      toolCallId: 'tool-1',
    });
    expect(firstCharacter(result.payload)).toEqual(
      expect.objectContaining({ candidateId: 'candidate:character:rin' }),
    );
  });
});

function makePayload(
  options: {
    readonly characters?: CanvasStoryboardPayload['scenes'][number]['shotPlans'][number]['characters'];
  } = {},
): CanvasStoryboardPayload {
  return {
    mode: 'semantic',
    sourceScriptUri: 'agent://storyboard-table',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Opening',
        sceneNumber: 1,
        shotPlans: [
          {
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Rin enters.',
            characters: options.characters ?? [
              {
                characterId: 'story-char-rin',
                characterName: 'Rin',
                referenceNodeId: 'panel-1:rin',
              },
            ],
            shotScale: 'MS',
            characterAction: 'Rin enters.',
            emotion: [],
            sceneTags: [],
          },
        ],
      },
    ],
  };
}

function firstCharacter(payload: CanvasStoryboardPayload) {
  return payload.scenes[0]!.shotPlans[0]!.characters[0]!;
}

function makeContribution(): EntityMemoryContribution {
  return {
    contributionId: 'contribution-1',
    sourcePackage: 'neko-agent',
    sourceRef: { kind: 'tool-result', toolCallId: 'tool-1' },
    reviewPolicy: 'source-approved',
  };
}
