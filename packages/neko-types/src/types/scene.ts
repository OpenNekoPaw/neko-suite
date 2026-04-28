import type {
  EngineCharacterMigrationManifest,
  EngineNkcCharacterFile,
  EngineNkcDataBlockManifest,
} from '../generated/scene.engine';

export type {
  EngineAudioStreamDescriptor as AudioStreamDescriptor,
  EngineBlendShape as BlendShape,
  EngineCharacterCommand as CharacterCommand,
  EngineCharacterCommandType as CharacterCommandType,
  EngineCharacterDataBlockRef as CharacterDataBlockRef,
  EngineCharacterDescriptor as CharacterDescriptor,
  EngineCharacterGeometry as CharacterGeometry,
  EngineCharacterOverrideEntry as CharacterOverrideEntry,
  EngineCharacterOverrideLayer as CharacterOverrideLayer,
  EngineCharacterOverrideOperation as CharacterOverrideOperation,
  EngineCharacterDefinition as CharacterDefinition,
  EngineCharacterMigrationManifest as CharacterMigrationManifest,
  EngineMaterialSlot as MaterialSlot,
  EngineModelingSession as ModelingSession,
  EngineMorphDescriptor as MorphDescriptor,
  EngineNkcCharacterFile as NkcCharacterFile,
  EngineNkcDataBlockManifest as NkcDataBlockManifest,
  EngineRenderFrameMeta as RenderFrameMeta,
  EngineRenderStreamDescriptor as RenderStreamDescriptor,
  EngineSceneCommand as SceneCommand,
  EngineSceneCommandAck as SceneCommandAck,
  EngineSceneCommandEnvelope as SceneCommandEnvelope,
  EngineSceneDelta as SceneDelta,
  EngineSceneSnapshot as SceneSnapshot,
  EngineSkeletonDescriptor as SkeletonDescriptor,
  EngineSkinWeightAtlas as SkinWeightAtlas,
  EngineLayeredCharacterDescription as LayeredCharacterDescription,
  EngineTopologyChangeEvent as TopologyChangeEvent,
  EngineVertexBrushPatch as VertexBrushPatch,
  EngineViewportDescriptor as ViewportDescriptor,
} from '../generated/scene.engine';

export const CURRENT_CHARACTER_SCHEMA_VERSION = 1;

export type CharacterSchemaCompatibilityStatus =
  | 'current'
  | 'migration-required'
  | 'unsupported-legacy'
  | 'unsupported-future';

export interface CharacterSchemaCompatibility {
  status: CharacterSchemaCompatibilityStatus;
  schemaVersion: number;
  currentSchemaVersion: number;
  migrationId?: string;
}

export const DEFAULT_CHARACTER_MIGRATION_MANIFEST: EngineCharacterMigrationManifest = {
  currentSchemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
  supportedLegacyVersions: [0],
  steps: [
    {
      fromSchemaVersion: 0,
      toSchemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
      migrationId: 'character-v0-to-v1',
      requiredFeatureFlags: [],
    },
  ],
};

export function evaluateCharacterSchemaVersion(
  file: Pick<EngineNkcCharacterFile | EngineNkcDataBlockManifest, 'schemaVersion'>,
  manifest: EngineCharacterMigrationManifest = DEFAULT_CHARACTER_MIGRATION_MANIFEST,
): CharacterSchemaCompatibility {
  const currentSchemaVersion = manifest.currentSchemaVersion;
  const schemaVersion = file.schemaVersion;

  if (schemaVersion === currentSchemaVersion) {
    return { status: 'current', schemaVersion, currentSchemaVersion };
  }
  if (schemaVersion > currentSchemaVersion) {
    return { status: 'unsupported-future', schemaVersion, currentSchemaVersion };
  }

  const migrationStep = manifest.steps.find(
    (step) =>
      step.fromSchemaVersion === schemaVersion && step.toSchemaVersion === currentSchemaVersion,
  );
  if (migrationStep && manifest.supportedLegacyVersions.includes(schemaVersion)) {
    return {
      status: 'migration-required',
      schemaVersion,
      currentSchemaVersion,
      migrationId: migrationStep.migrationId,
    };
  }

  return { status: 'unsupported-legacy', schemaVersion, currentSchemaVersion };
}

export function assertCharacterSchemaEditable(
  file: Pick<EngineNkcCharacterFile | EngineNkcDataBlockManifest, 'schemaVersion'>,
  manifest: EngineCharacterMigrationManifest = DEFAULT_CHARACTER_MIGRATION_MANIFEST,
): CharacterSchemaCompatibility {
  const compatibility = evaluateCharacterSchemaVersion(file, manifest);
  if (compatibility.status === 'unsupported-future') {
    throw new Error(
      `Character schema version ${compatibility.schemaVersion} requires runtime schema ${compatibility.currentSchemaVersion} or newer`,
    );
  }
  if (compatibility.status === 'unsupported-legacy') {
    throw new Error(`Character schema version ${compatibility.schemaVersion} is not supported`);
  }
  return compatibility;
}
