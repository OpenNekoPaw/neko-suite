import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { assertCharacterSchemaEditable, evaluateCharacterSchemaVersion } from '../../types/scene';
import type {
  CharacterCommand,
  LayeredCharacterDescription,
  ModelingSession,
  NkcCharacterFile,
  RenderFrameMeta,
  SceneCommandEnvelope,
  SceneDelta,
  SceneSnapshot,
  VertexBrushPatch,
} from '../../types/scene';

interface SceneContractFixture {
  snapshot: SceneSnapshot;
  delta: SceneDelta;
  deltaWithOmittedFields: SceneDelta;
  renderFrameMeta: RenderFrameMeta;
  character: LayeredCharacterDescription;
  characterCommandEnvelope: SceneCommandEnvelope;
  modelingSession: ModelingSession;
  vertexBrushPatch: VertexBrushPatch;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '../__fixtures__/scene-contract-v1.json');
const legacyCharacterFixturePath = resolve(__dirname, '../__fixtures__/scene-character-v0.json');

function loadFixture(): SceneContractFixture {
  return JSON.parse(readFileSync(fixturePath, 'utf-8')) as SceneContractFixture;
}

function loadLegacyCharacterFixture(): NkcCharacterFile {
  return JSON.parse(readFileSync(legacyCharacterFixturePath, 'utf-8')) as NkcCharacterFile;
}

describe('scene contract fixtures', () => {
  it('preserves snapshot node ids and revision through JSON roundtrip', () => {
    const fixture = loadFixture();
    const roundtripped = JSON.parse(JSON.stringify(fixture.snapshot)) as SceneSnapshot;

    expect(roundtripped.revision).toBe(40);
    expect(roundtripped.nodes.map((node) => node.nodeId)).toEqual(['node-root', 'node-mesh']);
    expect(roundtripped.nodes[1]?.mesh?.id).toBe('mesh-main');
    expect(roundtripped.nodes[1]?.worldBounds?.min).toEqual({ x: 2, y: 4, z: 4.5 });
    expect(roundtripped.nodes[1]?.worldBounds?.max).toEqual({ x: 4, y: 6, z: 5.5 });
  });

  it('preserves SceneDelta patch fields through JSON roundtrip', () => {
    const fixture = loadFixture();
    const roundtripped = JSON.parse(JSON.stringify(fixture.delta)) as SceneDelta;

    expect(roundtripped.revision).toBe(41);
    expect(roundtripped.appliedSeq).toBe(7);
    expect(roundtripped.updatedTransforms?.[0]?.nodeId).toBe('node-mesh');
    expect(roundtripped.updatedMorphWeights?.[0]?.weights[0]?.name).toBe('Smile');
    expect(roundtripped.updatedMaterials?.[0]?.materialId).toBe('mat-main');
    expect(roundtripped.updatedAssetReferences?.[0]?.textures).toBeUndefined();
    expect(roundtripped.updatedLights?.[0]?.kind).toBe('directional');
    expect(roundtripped.updatedCameras?.[0]?.cameraId).toBe('camera-editor');
    expect(roundtripped.topologyChanges?.[0]?.operation).toBe('subdivide');
    expect(roundtripped.topologyChanges?.[0]?.migrationResults?.[1]?.status).toBe('invalidated');
    expect(roundtripped.modelingSessions?.[0]?.pendingMigrations).toEqual([
      'morph-retarget',
      'skin-retarget',
    ]);
    expect(roundtripped.updatedCharacterMorphWeights?.[0]?.characterId).toBe('character-a');
    expect(roundtripped.updatedCharacterMaterials?.[0]?.slotId).toBe('skin');
    expect(roundtripped.updatedSkeletonPose?.[0]?.boneId).toBe('head');
    expect(roundtripped.characterOverrides?.[0]?.overrides?.[0]?.operation).toBe('set');
    expect(roundtripped.overlay?.viewportId).toBe('viewport-main');
  });

  it('treats omitted SceneDelta fields as unchanged patch fields', () => {
    const fixture = loadFixture();
    const roundtripped = JSON.parse(JSON.stringify(fixture.deltaWithOmittedFields)) as SceneDelta;

    expect(roundtripped.revision).toBe(42);
    expect(roundtripped.updatedTransforms).toBeUndefined();
    expect(roundtripped.updatedMaterials).toBeUndefined();
    expect(roundtripped.removedNodes).toBeUndefined();
    expect(roundtripped.overlay).toBeUndefined();
  });

  it('preserves RenderFrameMeta viewport and frame identity', () => {
    const fixture = loadFixture();
    const roundtripped = JSON.parse(JSON.stringify(fixture.renderFrameMeta)) as RenderFrameMeta;

    expect(roundtripped.streamId).toBe('stream-main');
    expect(roundtripped.viewportId).toBe('viewport-main');
    expect(roundtripped.frameId).toBe(1001);
    expect(roundtripped.durationUs).toBe(16666);
    expect(roundtripped.sceneRevision).toBe(41);
    expect(roundtripped.appliedSeq).toBe(7);
    expect(roundtripped.sceneId).toBe('scene-main');
    expect(roundtripped.frameTimestamp).toBe(1770000000048);
    expect(roundtripped.viewTransform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(roundtripped.projectionJson).toContain('perspective');
    expect(roundtripped.diagnostics?.qualityTier).toBe('high');
    expect(roundtripped.diagnostics?.gpuUploadTimeMs).toBe(1.4);
  });

  it('roundtrips LayeredCharacterDescription and CharacterCommand contracts', () => {
    const fixture = loadFixture();
    const character = JSON.parse(JSON.stringify(fixture.character)) as LayeredCharacterDescription;
    const commandEnvelope = JSON.parse(
      JSON.stringify(fixture.characterCommandEnvelope),
    ) as SceneCommandEnvelope;
    const characterCommand = commandEnvelope.command?.characterCommand as CharacterCommand;

    expect(character.descriptor?.characterId).toBe('character-a');
    expect(character.geometry?.dataBlocks[0]?.uri).toBe('characters/ava.nkcdata');
    expect(character.materialSlots[0]?.slotId).toBe('skin');
    expect(character.overrideLayer?.overrides[0]?.path).toContain('Smile');
    expect(commandEnvelope.command?.type).toBe('character');
    expect(characterCommand.type).toBe('morph-set');
    expect(characterCommand.morphSet?.weight).toBe(0.6);
  });

  it('roundtrips ModelingSession and VertexBrushPatch contracts', () => {
    const fixture = loadFixture();
    const session = JSON.parse(JSON.stringify(fixture.modelingSession)) as ModelingSession;
    const patch = JSON.parse(JSON.stringify(fixture.vertexBrushPatch)) as VertexBrushPatch;

    expect(session.sessionId).toBe('session-sculpt');
    expect(session.opLog[0]?.operation).toBe('brush');
    expect(patch.strokeId).toBe('stroke-1');
    expect(patch.encoding).toBe('f32-delta');
    expect(Array.from(patch.payload as unknown as number[])).toEqual([0, 1, 2, 3]);
  });

  it('classifies legacy and future character schema versions', () => {
    const legacy = loadLegacyCharacterFixture();
    const current: Pick<NkcCharacterFile, 'schemaVersion'> = { schemaVersion: 1 };

    expect(evaluateCharacterSchemaVersion(current).status).toBe('current');
    expect(evaluateCharacterSchemaVersion(legacy)).toEqual({
      status: 'migration-required',
      schemaVersion: 0,
      currentSchemaVersion: 1,
      migrationId: 'character-v0-to-v1',
    });
    expect(() => assertCharacterSchemaEditable({ ...legacy, schemaVersion: 99 })).toThrow(
      /requires runtime schema/,
    );
  });
});
