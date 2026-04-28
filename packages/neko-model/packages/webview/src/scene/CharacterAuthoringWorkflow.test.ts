import { describe, expect, it } from 'vitest';
import type { LayeredCharacterDescription } from '@neko/shared';
import {
  CharacterCommandHistory,
  buildCharacterInspectorSchema,
  buildMaterialLayerInspector,
  buildMorphSliderControls,
  compileBonePoseCommand,
  compileExpressionPresetCommands,
  compileMaterialLayerCommand,
  compileMorphSetCommand,
  createCharacterCommandEnvelope,
} from './CharacterAuthoringWorkflow';

const character: LayeredCharacterDescription = {
  descriptor: {
    characterId: 'character-a',
    name: 'Ava',
    schemaVersion: 1,
    featureFlags: [],
  },
  topologyVersion: 3,
  definition: {
    controls: [
      {
        morphId: 'Smile',
        displayName: 'Smile',
        targetPath: '$.geometry.blendShapes.Smile',
        defaultWeight: 0,
        min: 0,
        max: 1,
        tags: ['face'],
      },
    ],
    expressionPresets: [
      {
        presetId: 'happy',
        displayName: 'Happy',
        morphWeights: [{ name: 'Smile', weight: 1 }],
        bonePoseIds: [],
        materialOverrideIds: [],
      },
    ],
    behaviorDrivers: [],
  },
  geometry: {
    baseMesh: { id: 'mesh-main' },
    morphLibrary: [],
    skinWeightAtlases: [],
    blendShapes: [],
    dataBlocks: [],
  },
  materialSlots: [
    {
      slotId: 'skin',
      name: 'Skin',
      material: { id: 'mat-skin' },
    },
  ],
  overrideLayer: {
    overrides: [],
  },
};

describe('CharacterAuthoringWorkflow', () => {
  it('builds morph slider schema and coalesced CharacterCommand envelopes', () => {
    const controls = buildMorphSliderControls(character, { Smile: 0.25 });
    expect(controls).toEqual([
      expect.objectContaining({
        morphId: 'Smile',
        value: 0.25,
        coalesceKey: 'character:character-a:morph:Smile',
      }),
    ]);

    expect(
      createCharacterCommandEnvelope({
        seq: 5,
        baseRevision: 9,
        coalesceKey: controls[0]?.coalesceKey,
        command: compileMorphSetCommand('character-a', 3, 'Smile', 0.75),
      }),
    ).toMatchObject({
      seq: 5,
      baseRevision: 9,
      coalesceKey: 'character:character-a:morph:Smile',
      command: {
        type: 'character',
        topologyVersion: 3,
        characterCommand: {
          type: 'morph-set',
          characterId: 'character-a',
          morphSet: { morphId: 'Smile', weight: 0.75 },
        },
      },
    });
  });

  it('builds material, expression, bone, and Inspector command models', () => {
    expect(buildMaterialLayerInspector(character.materialSlots[0]!, { roughness: 0.4 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slotId: 'skin', path: 'roughness', value: 0.4 }),
        expect.objectContaining({ slotId: 'skin', path: 'baseColor' }),
        expect.objectContaining({ slotId: 'skin', path: 'normal' }),
        expect.objectContaining({ slotId: 'skin', path: 'ao' }),
        expect.objectContaining({ slotId: 'skin', path: 'emissive' }),
      ]),
    );
    expect(compileMaterialLayerCommand('character-a', 3, 'skin', { roughness: 0.4 })).toMatchObject(
      {
        type: 'material-layer-set',
        materialLayer: { slotId: 'skin', paramsJson: '{"roughness":0.4}' },
      },
    );
    expect(compileExpressionPresetCommands(character, 'character-a', 3, 'happy')).toEqual([
      expect.objectContaining({ type: 'morph-set', morphSet: { morphId: 'Smile', weight: 1 } }),
    ]);
    expect(compileBonePoseCommand('character-a', 3, 'jaw', [0, 0, 0, 1])).toMatchObject({
      type: 'bone-pose-set',
      bonePose: { boneId: 'jaw' },
    });
    expect(buildCharacterInspectorSchema(character)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'morph.Smile', commandType: 'morph-set' }),
        expect.objectContaining({
          path: 'material.skin.roughness',
          commandType: 'material-layer-set',
        }),
        expect.objectContaining({ component: 'transform', path: 'position.x' }),
      ]),
    );
  });

  it('uses acknowledged command history for character undo and redo', () => {
    const history = new CharacterCommandHistory();
    history.recordMorphEdit({
      characterId: 'character-a',
      morphId: 'Smile',
      topologyVersion: 3,
      previousWeight: 0,
      nextWeight: 0.8,
    });

    expect(history.undo(10, 4)).toMatchObject({
      seq: 10,
      command: { characterCommand: { morphSet: { weight: 0 } } },
    });
    expect(history.redo(11, 5)).toMatchObject({
      seq: 11,
      command: { characterCommand: { morphSet: { weight: 0.8 } } },
    });
  });
});
