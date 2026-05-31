//! Character authoring data model and file helpers.
//!
//! This module owns the CPU-side `.nkc` authoring contract for editable
//! characters. Runtime ECS components and Render World data are projections of
//! this source, not the canonical authoring store.

use crate::asset_database::{
    AssetDatabase, AssetDescriptor, AssetHandle, BlendShapeDescriptor,
    CharacterDataBlockDescriptor, CharacterDescriptionDescriptor, MorphAssetDescriptor,
    SkeletonAssetDescriptor, SkinWeightAtlasDescriptor,
};
use crate::components::{
    CharacterBonePose, CharacterInstanceId,
    CharacterMaterialLayer as RuntimeCharacterMaterialLayer, CharacterMaterialLayers,
    CharacterMorphWeight, CharacterMorphWeights, CharacterOverrideState, CharacterOverrides,
    SkeletonPose, Transform,
};
use crate::scene_control::{
    ensure_scene_control_resources, mark_character_materials_dirty,
    mark_character_morph_weights_dirty, mark_character_overrides_dirty,
    mark_character_skeleton_pose_dirty,
};
use bevy_ecs::prelude::{Entity, Resource, World};
use neko_engine_types::project_context::{ProjectContext, ResolvedPath};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub const CURRENT_CHARACTER_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum CharacterAuthoringError {
    #[error("Character JSON parse failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Unsupported future character schema version {found}; runtime supports {supported}")]
    UnsupportedFutureSchema { found: u32, supported: u32 },
    #[error("Unsupported legacy character schema version {found}")]
    UnsupportedLegacySchema { found: u32 },
    #[error("Character URI must be relative or variable-based: {0}")]
    AbsoluteUri(String),
    #[error("Character data checksum mismatch for {uri}: expected {expected}, got {actual}")]
    ChecksumMismatch {
        uri: String,
        expected: String,
        actual: String,
    },
    #[error("Path resolution failed for {uri}: {message}")]
    PathResolution { uri: String, message: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharacterValidationIssue {
    pub field: String,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CharacterAuthoringMutationError {
    #[error("Character not found: {0}")]
    CharacterNotFound(String),
    #[error("Morph not found: {character_id}/{morph_id}")]
    MorphNotFound {
        character_id: String,
        morph_id: String,
    },
    #[error("Material slot not found: {character_id}/{slot_id}")]
    MaterialSlotNotFound {
        character_id: String,
        slot_id: String,
    },
    #[error(
        "Topology version mismatch for {character_id}: command {command_topology_version}, authoring {authoring_topology_version}"
    )]
    TopologyVersionMismatch {
        character_id: String,
        command_topology_version: u64,
        authoring_topology_version: u64,
    },
    #[error("Morph weight {weight} is outside range {min}..{max} for {character_id}/{morph_id}")]
    MorphWeightOutOfRange {
        character_id: String,
        morph_id: String,
        weight: f32,
        min: f32,
        max: f32,
    },
    #[error("Character override value for {path} is not valid JSON: {message}")]
    InvalidOverrideJson { path: String, message: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CharacterSchemaCompatibility {
    Current,
    MigrationRequired { migration_id: String },
    UnsupportedLegacy,
    UnsupportedFuture,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NkcCharacterFile {
    pub file_kind: String,
    pub schema_version: u32,
    pub character: LayeredCharacterDescription,
    #[serde(default)]
    pub data_blocks: Vec<CharacterDataBlockRef>,
    #[serde(default)]
    pub feature_flags: Vec<String>,
    pub migration_manifest_uri: Option<String>,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NkcDataBlockManifest {
    pub file_kind: String,
    pub schema_version: u32,
    pub block_id: String,
    pub encoding: String,
    pub byte_length: u64,
    pub checksum: String,
    #[serde(default)]
    pub entries: Vec<NkcDataBlockEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NkcDataBlockEntry {
    pub entry_id: String,
    pub kind: CharacterDataBlockKind,
    pub uri: String,
    pub checksum: String,
    pub byte_offset: u64,
    pub byte_length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayeredCharacterDescription {
    pub descriptor: CharacterDescriptor,
    pub topology_version: u64,
    pub definition: CharacterDefinition,
    pub geometry: CharacterGeometry,
    #[serde(default)]
    pub material_slots: Vec<MaterialSlot>,
    pub override_layer: CharacterOverrideLayer,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDescriptor {
    pub character_id: String,
    pub name: String,
    pub schema_version: u32,
    #[serde(default)]
    pub feature_flags: Vec<String>,
    pub base_template: Option<AssetRef>,
    pub template_version: Option<String>,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDefinition {
    #[serde(default)]
    pub controls: Vec<MorphDescriptor>,
    #[serde(default)]
    pub expression_presets: Vec<ExpressionPreset>,
    #[serde(default)]
    pub behavior_drivers: Vec<BehaviorDriver>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region_descriptors: Option<CharacterRegionDescriptorSet>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRegionDescriptorSet {
    pub schema_version: u32,
    #[serde(default)]
    pub regions: Vec<CharacterRegionDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRegionDescriptor {
    pub region_id: String,
    pub display_name: String,
    pub schema_version: u32,
    #[serde(default)]
    pub bindings: Vec<CharacterRegionBinding>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterRegionBinding {
    pub kind: CharacterRegionBindingKind,
    pub target_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<f32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CharacterRegionBindingKind {
    MorphControl,
    MaterialSlot,
    Bone,
    Submesh,
    Primitive,
    Mask,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGeometry {
    pub base_mesh: AssetRef,
    pub skeleton: Option<SkeletonDescriptor>,
    #[serde(default)]
    pub morph_library: Vec<MorphDescriptor>,
    #[serde(default)]
    pub skin_weight_atlases: Vec<SkinWeightAtlas>,
    #[serde(default)]
    pub blend_shapes: Vec<BlendShape>,
    #[serde(default)]
    pub data_blocks: Vec<CharacterDataBlockRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub id: String,
    pub uri: Option<String>,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterDataBlockKind {
    MorphSparseDelta,
    SkinWeightAtlas,
    BlendShape,
    AuxiliaryGeometry,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDataBlockRef {
    pub block_id: String,
    pub kind: CharacterDataBlockKind,
    pub uri: String,
    pub asset_handle_id: Option<String>,
    pub checksum: Option<String>,
    pub encoding: Option<String>,
    pub byte_offset: Option<u64>,
    pub byte_length: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MorphDescriptor {
    pub morph_id: String,
    pub display_name: String,
    pub target_path: String,
    pub default_weight: f32,
    pub min: Option<f32>,
    pub max: Option<f32>,
    pub sparse_delta: Option<CharacterDataBlockRef>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkeletonDescriptor {
    pub skeleton_id: String,
    pub skeleton: AssetRef,
    pub root_bone: Option<String>,
    #[serde(default)]
    pub bind_joints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkinWeightAtlas {
    pub atlas_id: String,
    pub data: CharacterDataBlockRef,
    pub joint_count: u32,
    pub vertex_count: u32,
    pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BlendShape {
    pub blend_shape_id: String,
    pub name: String,
    pub data: CharacterDataBlockRef,
    #[serde(default)]
    pub default_weights: Vec<MorphWeightEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MorphWeightEntry {
    pub name: String,
    pub weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MaterialSlot {
    pub slot_id: String,
    pub name: String,
    pub material: AssetRef,
    pub role: Option<String>,
    pub index: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionPreset {
    pub preset_id: String,
    pub display_name: String,
    #[serde(default)]
    pub morph_weights: Vec<MorphWeightEntry>,
    #[serde(default)]
    pub bone_pose_ids: Vec<String>,
    #[serde(default)]
    pub material_override_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorDriver {
    pub driver_id: String,
    pub kind: String,
    pub target_path: String,
    pub params_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterOverrideLayer {
    pub base_template: Option<AssetRef>,
    #[serde(default)]
    pub overrides: Vec<CharacterOverrideEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterOverrideEntry {
    pub path: String,
    pub value_type: String,
    pub value_json: String,
    pub operation: CharacterOverrideOperation,
    pub base_revision: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterOverrideOperation {
    Set,
    Remove,
    Reset,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharacterProjectionPlan {
    pub character_id: String,
    pub topology_version: u64,
    pub morph_count: usize,
    pub material_slot_count: usize,
    pub data_block_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharacterOverrideConflict {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CharacterOverrideMergeResult {
    pub merged: LayeredCharacterDescription,
    pub conflicts: Vec<CharacterOverrideConflict>,
}

#[derive(Debug, Clone, Default, Resource, Serialize, Deserialize)]
pub struct CharacterAuthoringStore {
    descriptions: HashMap<String, LayeredCharacterDescription>,
}

impl CharacterAuthoringStore {
    pub fn insert(&mut self, character: LayeredCharacterDescription) {
        self.descriptions
            .insert(character.descriptor.character_id.clone(), character);
    }

    pub fn get(&self, character_id: &str) -> Option<&LayeredCharacterDescription> {
        self.descriptions.get(character_id)
    }

    pub fn set_morph_weight(
        &mut self,
        character_id: &str,
        morph_id: &str,
        weight: f32,
        topology_version: u64,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError> {
        let description = self.description_mut(character_id)?;
        assert_topology_version(description, character_id, topology_version)?;
        let morph = description
            .geometry
            .morph_library
            .iter_mut()
            .find(|entry| entry.morph_id == morph_id)
            .ok_or_else(|| CharacterAuthoringMutationError::MorphNotFound {
                character_id: character_id.to_string(),
                morph_id: morph_id.to_string(),
            })?;
        let min = morph.min.unwrap_or(0.0);
        let max = morph.max.unwrap_or(1.0);
        if weight < min || weight > max {
            return Err(CharacterAuthoringMutationError::MorphWeightOutOfRange {
                character_id: character_id.to_string(),
                morph_id: morph_id.to_string(),
                weight,
                min,
                max,
            });
        }

        morph.default_weight = weight;
        Ok(description.clone())
    }

    pub fn set_material_layer(
        &mut self,
        character_id: &str,
        slot_id: &str,
        params_json: &str,
        topology_version: u64,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError> {
        let description = self.description_mut(character_id)?;
        assert_topology_version(description, character_id, topology_version)?;
        if !description
            .material_slots
            .iter()
            .any(|slot| slot.slot_id == slot_id)
        {
            return Err(CharacterAuthoringMutationError::MaterialSlotNotFound {
                character_id: character_id.to_string(),
                slot_id: slot_id.to_string(),
            });
        }

        let value: serde_json::Value = serde_json::from_str(params_json).map_err(|error| {
            CharacterAuthoringMutationError::InvalidOverrideJson {
                path: material_layer_params_path(slot_id),
                message: error.to_string(),
            }
        })?;
        upsert_authoring_override(
            &mut description.override_layer.overrides,
            CharacterOverrideEntry {
                path: material_layer_params_path(slot_id),
                value_type: json_value_type(&value).to_string(),
                value_json: value.to_string(),
                operation: CharacterOverrideOperation::Set,
                base_revision: None,
            },
        );
        Ok(description.clone())
    }

    pub fn set_bone_pose(
        &mut self,
        character_id: &str,
        bone_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
        topology_version: u64,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError> {
        let description = self.description_mut(character_id)?;
        assert_topology_version(description, character_id, topology_version)?;
        let value = serde_json::json!({
            "position": position,
            "rotation": rotation,
            "scale": scale
        });
        upsert_authoring_override(
            &mut description.override_layer.overrides,
            CharacterOverrideEntry {
                path: skeleton_pose_path(bone_id),
                value_type: "object".to_string(),
                value_json: value.to_string(),
                operation: CharacterOverrideOperation::Set,
                base_revision: None,
            },
        );
        Ok(description.clone())
    }

    pub fn apply_expression_preset(
        &mut self,
        character_id: &str,
        preset_id: &str,
        weight: f32,
        topology_version: u64,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError> {
        let description = self.description_mut(character_id)?;
        assert_topology_version(description, character_id, topology_version)?;
        let morph_weights = description
            .definition
            .expression_presets
            .iter()
            .find(|preset| preset.preset_id == preset_id)
            .map(|preset| preset.morph_weights.clone())
            .unwrap_or_else(|| {
                vec![MorphWeightEntry {
                    name: preset_id.to_string(),
                    weight: 1.0,
                }]
            });

        for entry in morph_weights {
            if let Some(morph) = description
                .geometry
                .morph_library
                .iter_mut()
                .find(|morph| morph.morph_id == entry.name)
            {
                let min = morph.min.unwrap_or(0.0);
                let max = morph.max.unwrap_or(1.0);
                morph.default_weight = (entry.weight * weight).clamp(min, max);
            }
        }

        Ok(description.clone())
    }

    pub fn apply_override(
        &mut self,
        character_id: &str,
        path: &str,
        value_type: &str,
        value_json: &str,
        topology_version: u64,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError> {
        let description = self.description_mut(character_id)?;
        assert_topology_version(description, character_id, topology_version)?;
        serde_json::from_str::<serde_json::Value>(value_json).map_err(|error| {
            CharacterAuthoringMutationError::InvalidOverrideJson {
                path: path.to_string(),
                message: error.to_string(),
            }
        })?;
        upsert_authoring_override(
            &mut description.override_layer.overrides,
            CharacterOverrideEntry {
                path: path.to_string(),
                value_type: value_type.to_string(),
                value_json: value_json.to_string(),
                operation: CharacterOverrideOperation::Set,
                base_revision: None,
            },
        );
        Ok(description.clone())
    }

    fn description_mut(
        &mut self,
        character_id: &str,
    ) -> Result<&mut LayeredCharacterDescription, CharacterAuthoringMutationError> {
        self.descriptions
            .get_mut(character_id)
            .ok_or_else(|| CharacterAuthoringMutationError::CharacterNotFound(character_id.into()))
    }
}

pub fn ensure_character_authoring_store(world: &mut World) {
    if !world.contains_resource::<CharacterAuthoringStore>() {
        world.insert_resource(CharacterAuthoringStore::default());
    }
}

#[derive(Debug, Clone, Default)]
pub struct LibraryOverrideResolver;

impl LibraryOverrideResolver {
    pub fn resolve(
        &self,
        base: &LayeredCharacterDescription,
        override_layer: &CharacterOverrideLayer,
    ) -> CharacterOverrideMergeResult {
        let mut value = serde_json::to_value(base).unwrap_or(serde_json::Value::Null);
        let mut conflicts = Vec::new();
        let mut overrides = override_layer.overrides.clone();
        overrides.sort_by(|left, right| left.path.cmp(&right.path));

        for entry in overrides {
            if let Err(reason) = apply_override_entry(&mut value, &entry) {
                conflicts.push(CharacterOverrideConflict {
                    path: entry.path,
                    reason,
                });
            }
        }

        let merged = serde_json::from_value(value).unwrap_or_else(|_| base.clone());
        CharacterOverrideMergeResult { merged, conflicts }
    }
}

#[derive(Debug, Clone, Default)]
pub struct CharacterAuthoringModule;

impl CharacterAuthoringModule {
    pub fn load_nkc_str(&self, json: &str) -> Result<NkcCharacterFile, CharacterAuthoringError> {
        let file: NkcCharacterFile = serde_json::from_str(json)?;
        self.validate_file(&file)?;
        Ok(file)
    }

    pub fn save_nkc_string(
        &self,
        file: &NkcCharacterFile,
    ) -> Result<String, CharacterAuthoringError> {
        self.validate_file(file)?;
        Ok(serde_json::to_string_pretty(file)?)
    }

    pub fn validate_file(
        &self,
        file: &NkcCharacterFile,
    ) -> Result<Vec<CharacterValidationIssue>, CharacterAuthoringError> {
        match evaluate_schema_version(file.schema_version) {
            CharacterSchemaCompatibility::Current
            | CharacterSchemaCompatibility::MigrationRequired { .. } => {}
            CharacterSchemaCompatibility::UnsupportedFuture => {
                return Err(CharacterAuthoringError::UnsupportedFutureSchema {
                    found: file.schema_version,
                    supported: CURRENT_CHARACTER_SCHEMA_VERSION,
                });
            }
            CharacterSchemaCompatibility::UnsupportedLegacy => {
                return Err(CharacterAuthoringError::UnsupportedLegacySchema {
                    found: file.schema_version,
                });
            }
        }

        let mut issues = Vec::new();
        validate_asset_ref_uri(
            "character.geometry.baseMesh.uri",
            &file.character.geometry.base_mesh,
        )?;
        for block in file
            .data_blocks
            .iter()
            .chain(file.character.geometry.data_blocks.iter())
        {
            validate_relative_uri(&block.uri)?;
        }
        if file.character.descriptor.character_id.trim().is_empty() {
            issues.push(CharacterValidationIssue {
                field: "character.descriptor.characterId".to_string(),
                message: "character id is required".to_string(),
            });
        }
        validate_region_descriptors(&file.character, &mut issues);
        Ok(issues)
    }

    pub fn resolve_data_block_uri(
        &self,
        project_context: &ProjectContext,
        block: &CharacterDataBlockRef,
    ) -> Result<ResolvedPath, CharacterAuthoringError> {
        validate_relative_uri(&block.uri)?;
        project_context.resolve(&block.uri).map_err(|message| {
            CharacterAuthoringError::PathResolution {
                uri: block.uri.clone(),
                message,
            }
        })
    }

    pub fn verify_data_block_checksum(
        &self,
        block: &CharacterDataBlockRef,
        bytes: &[u8],
    ) -> Result<(), CharacterAuthoringError> {
        let Some(expected) = &block.checksum else {
            return Ok(());
        };
        let actual = checksum_fnv1a64(bytes);
        if expected == &actual {
            return Ok(());
        }
        Err(CharacterAuthoringError::ChecksumMismatch {
            uri: block.uri.clone(),
            expected: expected.clone(),
            actual,
        })
    }

    pub fn create_project_local_override(
        &self,
        base_template: &LayeredCharacterDescription,
        base_template_ref: AssetRef,
        character_id: &str,
        name: &str,
        nkc_uri: &str,
        asset_database: &mut AssetDatabase,
    ) -> Result<NkcCharacterFile, CharacterAuthoringError> {
        validate_relative_uri(nkc_uri)?;
        let mut character = base_template.clone();
        character.descriptor.character_id = character_id.to_string();
        character.descriptor.name = name.to_string();
        character.descriptor.base_template = Some(base_template_ref.clone());
        character.override_layer.base_template = Some(base_template_ref);
        character.override_layer.overrides.clear();

        let file = NkcCharacterFile {
            file_kind: "neko.character".to_string(),
            schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
            character,
            data_blocks: base_template.geometry.data_blocks.clone(),
            feature_flags: base_template.descriptor.feature_flags.clone(),
            migration_manifest_uri: None,
            checksum: None,
        };
        self.validate_file(&file)?;
        register_character_asset_descriptors(asset_database, nkc_uri, &file.character);
        Ok(file)
    }

    pub fn project_to_ecs_plan(
        &self,
        character: &LayeredCharacterDescription,
    ) -> CharacterProjectionPlan {
        CharacterProjectionPlan {
            character_id: character.descriptor.character_id.clone(),
            topology_version: character.topology_version,
            morph_count: character.geometry.morph_library.len(),
            material_slot_count: character.material_slots.len(),
            data_block_count: character.geometry.data_blocks.len(),
        }
    }

    pub fn project_to_ecs(
        &self,
        world: &mut World,
        character: &LayeredCharacterDescription,
    ) -> Entity {
        ensure_scene_control_resources(world);
        let character_id = character.descriptor.character_id.clone();
        let entity = find_or_spawn_character_entity(world, &character_id);
        let skeleton_pose = SkeletonPose {
            bones: character
                .override_layer
                .overrides
                .iter()
                .filter_map(|entry| skeleton_pose_from_override(entry, character.topology_version))
                .collect(),
        };

        world.entity_mut(entity).insert((
            CharacterMorphWeights {
                weights: character
                    .geometry
                    .morph_library
                    .iter()
                    .map(|morph| CharacterMorphWeight {
                        morph_id: morph.morph_id.clone(),
                        weight: morph.default_weight,
                    })
                    .collect(),
                topology_version: character.topology_version,
            },
            CharacterMaterialLayers {
                layers: character
                    .material_slots
                    .iter()
                    .map(|slot| RuntimeCharacterMaterialLayer {
                        slot_id: slot.slot_id.clone(),
                        params_json: material_layer_params_json(
                            &character.override_layer.overrides,
                            &slot.slot_id,
                        )
                        .unwrap_or_else(|| "{}".to_string()),
                        topology_version: character.topology_version,
                    })
                    .collect(),
            },
            CharacterOverrides {
                entries: character
                    .override_layer
                    .overrides
                    .iter()
                    .map(|entry| CharacterOverrideState {
                        path: entry.path.clone(),
                        value_type: entry.value_type.clone(),
                        value_json: entry.value_json.clone(),
                        topology_version: character.topology_version,
                    })
                    .collect(),
            },
            skeleton_pose,
        ));

        mark_character_morph_weights_dirty(world, &character_id);
        mark_character_materials_dirty(world, &character_id);
        mark_character_overrides_dirty(world, &character_id);
        mark_character_skeleton_pose_dirty(world, &character_id);
        entity
    }
}

fn find_or_spawn_character_entity(world: &mut World, character_id: &str) -> Entity {
    let existing = {
        let mut query = world.query::<(Entity, &CharacterInstanceId)>();
        query
            .iter(world)
            .find_map(|(entity, id)| (id.0 == character_id).then_some(entity))
    };
    existing.unwrap_or_else(|| {
        world
            .spawn(CharacterInstanceId(character_id.to_string()))
            .id()
    })
}

fn assert_topology_version(
    description: &LayeredCharacterDescription,
    character_id: &str,
    command_topology_version: u64,
) -> Result<(), CharacterAuthoringMutationError> {
    if description.topology_version == command_topology_version {
        return Ok(());
    }

    Err(CharacterAuthoringMutationError::TopologyVersionMismatch {
        character_id: character_id.to_string(),
        command_topology_version,
        authoring_topology_version: description.topology_version,
    })
}

fn upsert_authoring_override(
    overrides: &mut Vec<CharacterOverrideEntry>,
    override_entry: CharacterOverrideEntry,
) {
    if let Some(existing) = overrides
        .iter_mut()
        .find(|entry| entry.path == override_entry.path)
    {
        *existing = override_entry;
    } else {
        overrides.push(override_entry);
    }
}

fn material_layer_params_path(slot_id: &str) -> String {
    format!("$.materialSlots.{slot_id}.paramsJson")
}

fn skeleton_pose_path(bone_id: &str) -> String {
    format!("$.skeletonPose.{bone_id}")
}

fn json_value_type(value: &serde_json::Value) -> &'static str {
    match value {
        serde_json::Value::String(_) => "string",
        serde_json::Value::Number(_) => "number",
        serde_json::Value::Bool(_) => "bool",
        serde_json::Value::Array(_) => "array",
        serde_json::Value::Object(_) => "object",
        serde_json::Value::Null => "null",
    }
}

fn material_layer_params_json(
    overrides: &[CharacterOverrideEntry],
    slot_id: &str,
) -> Option<String> {
    let path = material_layer_params_path(slot_id);
    overrides
        .iter()
        .find(|entry| {
            entry.path == path && matches!(&entry.operation, CharacterOverrideOperation::Set)
        })
        .map(|entry| entry.value_json.clone())
}

fn skeleton_pose_from_override(
    entry: &CharacterOverrideEntry,
    topology_version: u64,
) -> Option<CharacterBonePose> {
    let bone_id = entry.path.strip_prefix("$.skeletonPose.")?;
    if !matches!(&entry.operation, CharacterOverrideOperation::Set) {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(&entry.value_json).ok()?;
    let position = value
        .get("position")
        .and_then(json_array3)
        .unwrap_or([0.0, 0.0, 0.0]);
    let rotation = value
        .get("rotation")
        .and_then(json_array4)
        .unwrap_or([0.0, 0.0, 0.0, 1.0]);
    let scale = value
        .get("scale")
        .and_then(json_array3)
        .unwrap_or([1.0, 1.0, 1.0]);

    Some(CharacterBonePose {
        bone_id: bone_id.to_string(),
        transform: Transform {
            position: glam::Vec3::from(position),
            rotation: glam::Quat::from_array(rotation),
            scale: glam::Vec3::from(scale),
        },
        topology_version,
    })
}

fn json_array3(value: &serde_json::Value) -> Option<[f32; 3]> {
    let values = value.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
    ])
}

fn json_array4(value: &serde_json::Value) -> Option<[f32; 4]> {
    let values = value.as_array()?;
    Some([
        values.first()?.as_f64()? as f32,
        values.get(1)?.as_f64()? as f32,
        values.get(2)?.as_f64()? as f32,
        values.get(3)?.as_f64()? as f32,
    ])
}

fn register_character_asset_descriptors(
    asset_database: &mut AssetDatabase,
    nkc_uri: &str,
    character: &LayeredCharacterDescription,
) {
    let character_id = character.descriptor.character_id.clone();
    let data_block_handles: Vec<AssetHandle> = character
        .geometry
        .data_blocks
        .iter()
        .map(|block| register_character_data_block(asset_database, block))
        .collect();
    let character_handle = AssetHandle::new(format!("character:{character_id}"));
    asset_database.insert_descriptor(AssetDescriptor::CharacterDescription(
        CharacterDescriptionDescriptor {
            handle: character_handle,
            uri: nkc_uri.to_string(),
            character_id: character_id.clone(),
            schema_version: character.descriptor.schema_version,
            topology_version: character.topology_version,
            data_blocks: data_block_handles.clone(),
        },
    ));

    for morph in &character.geometry.morph_library {
        asset_database.insert_descriptor(AssetDescriptor::MorphDescriptor(MorphAssetDescriptor {
            handle: AssetHandle::new(format!("character-morph:{character_id}:{}", morph.morph_id)),
            character_id: character_id.clone(),
            morph_id: morph.morph_id.clone(),
            data_block: morph.sparse_delta.as_ref().map(character_data_block_handle),
        }));
    }
    if let Some(skeleton) = &character.geometry.skeleton {
        asset_database.insert_descriptor(AssetDescriptor::SkeletonDescriptor(
            SkeletonAssetDescriptor {
                handle: AssetHandle::new(format!(
                    "character-skeleton:{character_id}:{}",
                    skeleton.skeleton_id
                )),
                character_id: character_id.clone(),
                skeleton_id: skeleton.skeleton_id.clone(),
                source: Some(AssetHandle::new(skeleton.skeleton.id.clone())),
            },
        ));
    }
    for skin in &character.geometry.skin_weight_atlases {
        asset_database.insert_descriptor(AssetDescriptor::SkinWeightAtlas(
            SkinWeightAtlasDescriptor {
                handle: AssetHandle::new(format!(
                    "character-skin:{character_id}:{}",
                    skin.atlas_id
                )),
                character_id: character_id.clone(),
                atlas_id: skin.atlas_id.clone(),
                data_block: character_data_block_handle(&skin.data),
            },
        ));
    }
    for blend_shape in &character.geometry.blend_shapes {
        asset_database.insert_descriptor(AssetDescriptor::BlendShape(BlendShapeDescriptor {
            handle: AssetHandle::new(format!(
                "character-blend-shape:{character_id}:{}",
                blend_shape.blend_shape_id
            )),
            character_id: character_id.clone(),
            blend_shape_id: blend_shape.blend_shape_id.clone(),
            data_block: character_data_block_handle(&blend_shape.data),
        }));
    }
}

fn register_character_data_block(
    asset_database: &mut AssetDatabase,
    block: &CharacterDataBlockRef,
) -> AssetHandle {
    let handle = character_data_block_handle(block);
    asset_database.insert_descriptor(AssetDescriptor::CharacterDataBlock(
        CharacterDataBlockDescriptor {
            handle: handle.clone(),
            uri: block.uri.clone(),
            kind: format!("{:?}", block.kind),
            checksum: block.checksum.clone(),
            byte_length: block.byte_length,
        },
    ));
    handle
}

fn character_data_block_handle(block: &CharacterDataBlockRef) -> AssetHandle {
    block
        .asset_handle_id
        .as_ref()
        .map(|id| AssetHandle::new(id.clone()))
        .unwrap_or_else(|| AssetHandle::new(format!("character-data:{}", block.block_id)))
}

fn apply_override_entry(
    value: &mut serde_json::Value,
    entry: &CharacterOverrideEntry,
) -> Result<(), String> {
    let path = json_path_segments(&entry.path)?;
    match entry.operation {
        CharacterOverrideOperation::Set => {
            let target = value_at_path_mut(value, &path)
                .ok_or_else(|| "override path does not exist".to_string())?;
            let next_value: serde_json::Value =
                serde_json::from_str(&entry.value_json).map_err(|error| error.to_string())?;
            if !json_value_matches_type(&next_value, &entry.value_type) {
                return Err(format!(
                    "override value does not match type {}",
                    entry.value_type
                ));
            }
            if !json_value_matches_type(target, &entry.value_type) {
                return Err(format!(
                    "base value does not match type {}",
                    entry.value_type
                ));
            }
            *target = next_value;
            Ok(())
        }
        CharacterOverrideOperation::Remove => {
            remove_value_at_path(value, &path)
                .ok_or_else(|| "override path does not exist".to_string())?;
            Ok(())
        }
        CharacterOverrideOperation::Reset => Ok(()),
    }
}

fn json_path_segments(path: &str) -> Result<Vec<&str>, String> {
    let Some(stripped) = path.strip_prefix("$.") else {
        return Err("override path must start with `$`".to_string());
    };
    let segments: Vec<&str> = stripped
        .split('.')
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.is_empty() {
        return Err("override path is empty".to_string());
    }
    Ok(segments)
}

fn value_at_path_mut<'a>(
    value: &'a mut serde_json::Value,
    path: &[&str],
) -> Option<&'a mut serde_json::Value> {
    let mut current = value;
    for segment in path {
        match current {
            serde_json::Value::Object(map) => current = map.get_mut(*segment)?,
            serde_json::Value::Array(items) => {
                let index = segment.parse::<usize>().ok()?;
                current = items.get_mut(index)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

fn remove_value_at_path(value: &mut serde_json::Value, path: &[&str]) -> Option<serde_json::Value> {
    let (last, parents) = path.split_last()?;
    let parent = value_at_path_mut(value, parents)?;
    match parent {
        serde_json::Value::Object(map) => map.remove(*last),
        serde_json::Value::Array(items) => {
            let index = last.parse::<usize>().ok()?;
            if index < items.len() {
                Some(items.remove(index))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn json_value_matches_type(value: &serde_json::Value, value_type: &str) -> bool {
    match value_type {
        "string" => value.is_string(),
        "number" => value.is_number(),
        "bool" | "boolean" => value.is_boolean(),
        "object" => value.is_object(),
        "array" => value.is_array(),
        "null" => value.is_null(),
        _ => true,
    }
}

pub fn evaluate_schema_version(schema_version: u32) -> CharacterSchemaCompatibility {
    if schema_version == CURRENT_CHARACTER_SCHEMA_VERSION {
        CharacterSchemaCompatibility::Current
    } else if schema_version > CURRENT_CHARACTER_SCHEMA_VERSION {
        CharacterSchemaCompatibility::UnsupportedFuture
    } else if schema_version == 0 {
        CharacterSchemaCompatibility::MigrationRequired {
            migration_id: "character-v0-to-v1".to_string(),
        }
    } else {
        CharacterSchemaCompatibility::UnsupportedLegacy
    }
}

fn validate_region_descriptors(
    character: &LayeredCharacterDescription,
    issues: &mut Vec<CharacterValidationIssue>,
) {
    let Some(regions) = character.definition.region_descriptors.as_ref() else {
        return;
    };
    if regions.schema_version != CURRENT_CHARACTER_SCHEMA_VERSION {
        issues.push(CharacterValidationIssue {
            field: "character.definition.regionDescriptors.schemaVersion".to_string(),
            message: format!(
                "region descriptor schema {} is not supported",
                regions.schema_version
            ),
        });
    }

    let mut region_ids = std::collections::HashSet::new();
    let morph_ids: std::collections::HashSet<&str> = character
        .geometry
        .morph_library
        .iter()
        .map(|morph| morph.morph_id.as_str())
        .collect();
    let material_slot_ids: std::collections::HashSet<&str> = character
        .material_slots
        .iter()
        .map(|slot| slot.slot_id.as_str())
        .collect();
    let bone_ids: std::collections::HashSet<&str> = character
        .geometry
        .skeleton
        .as_ref()
        .map(|skeleton| skeleton.bind_joints.iter().map(String::as_str).collect())
        .unwrap_or_default();

    for region in &regions.regions {
        let field_prefix = format!(
            "character.definition.regionDescriptors.regions.{}",
            region.region_id
        );
        if region.region_id.trim().is_empty() {
            issues.push(CharacterValidationIssue {
                field: format!("{field_prefix}.regionId"),
                message: "region id is required".to_string(),
            });
        } else if !region_ids.insert(region.region_id.as_str()) {
            issues.push(CharacterValidationIssue {
                field: format!("{field_prefix}.regionId"),
                message: "region id must be unique".to_string(),
            });
        }
        if region.schema_version != regions.schema_version {
            issues.push(CharacterValidationIssue {
                field: format!("{field_prefix}.schemaVersion"),
                message: "region schema version must match descriptor set".to_string(),
            });
        }
        if region.bindings.is_empty() {
            issues.push(CharacterValidationIssue {
                field: format!("{field_prefix}.bindings"),
                message: "region descriptor must declare at least one binding".to_string(),
            });
        }
        for binding in &region.bindings {
            if binding.target_id.trim().is_empty() {
                issues.push(CharacterValidationIssue {
                    field: format!("{field_prefix}.bindings.targetId"),
                    message: "region binding target id is required".to_string(),
                });
                continue;
            }
            let target_exists = match binding.kind {
                CharacterRegionBindingKind::MorphControl => {
                    morph_ids.contains(binding.target_id.as_str())
                }
                CharacterRegionBindingKind::MaterialSlot => {
                    material_slot_ids.contains(binding.target_id.as_str())
                }
                CharacterRegionBindingKind::Bone => bone_ids.contains(binding.target_id.as_str()),
                CharacterRegionBindingKind::Submesh
                | CharacterRegionBindingKind::Primitive
                | CharacterRegionBindingKind::Mask => true,
            };
            if !target_exists {
                issues.push(CharacterValidationIssue {
                    field: format!("{field_prefix}.bindings.{}", binding.target_id),
                    message: format!(
                        "region binding target '{}' is not available for {:?}",
                        binding.target_id, binding.kind
                    ),
                });
            }
        }
    }
}

fn validate_asset_ref_uri(
    field: &str,
    asset_ref: &AssetRef,
) -> Result<(), CharacterAuthoringError> {
    if let Some(uri) = &asset_ref.uri {
        validate_relative_uri_with_field(field, uri)?;
    }
    Ok(())
}

fn validate_relative_uri(uri: &str) -> Result<(), CharacterAuthoringError> {
    validate_relative_uri_with_field("uri", uri)
}

fn validate_relative_uri_with_field(
    _field: &str,
    uri: &str,
) -> Result<(), CharacterAuthoringError> {
    if Path::new(uri).is_absolute() {
        return Err(CharacterAuthoringError::AbsoluteUri(uri.to_string()));
    }
    Ok(())
}

pub fn checksum_fnv1a64(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("fnv1a64:{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn asset_ref(id: &str, uri: &str, kind: &str) -> AssetRef {
        AssetRef {
            id: id.to_string(),
            uri: Some(uri.to_string()),
            kind: Some(kind.to_string()),
        }
    }

    fn data_block() -> CharacterDataBlockRef {
        CharacterDataBlockRef {
            block_id: "smile-delta".to_string(),
            kind: CharacterDataBlockKind::MorphSparseDelta,
            uri: "characters/ava.nkcdata".to_string(),
            asset_handle_id: None,
            checksum: Some(checksum_fnv1a64(&[1, 2, 3])),
            encoding: Some("f32".to_string()),
            byte_offset: Some(0),
            byte_length: Some(12),
        }
    }

    fn character_file() -> NkcCharacterFile {
        let block = data_block();
        NkcCharacterFile {
            file_kind: "neko.character".to_string(),
            schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
            feature_flags: vec!["morph-v1".to_string()],
            data_blocks: vec![block.clone()],
            migration_manifest_uri: None,
            checksum: None,
            character: LayeredCharacterDescription {
                descriptor: CharacterDescriptor {
                    character_id: "character-a".to_string(),
                    name: "Ava".to_string(),
                    schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
                    feature_flags: vec!["morph-v1".to_string()],
                    base_template: None,
                    template_version: None,
                    checksum: None,
                },
                topology_version: 3,
                definition: CharacterDefinition::default(),
                geometry: CharacterGeometry {
                    base_mesh: asset_ref("mesh-main", "assets/ava.glb", "mesh"),
                    skeleton: None,
                    morph_library: vec![MorphDescriptor {
                        morph_id: "Smile".to_string(),
                        display_name: "Smile".to_string(),
                        target_path: "$.geometry.blendShapes.Smile".to_string(),
                        default_weight: 0.0,
                        min: Some(0.0),
                        max: Some(1.0),
                        sparse_delta: Some(block.clone()),
                        tags: vec!["face".to_string()],
                    }],
                    skin_weight_atlases: Vec::new(),
                    blend_shapes: Vec::new(),
                    data_blocks: vec![block],
                },
                material_slots: vec![MaterialSlot {
                    slot_id: "skin".to_string(),
                    name: "Skin".to_string(),
                    material: asset_ref("mat-skin", "assets/ava.glb#skin", "material"),
                    role: Some("skin".to_string()),
                    index: Some(0),
                }],
                override_layer: CharacterOverrideLayer {
                    base_template: None,
                    overrides: vec![CharacterOverrideEntry {
                        path: "$.geometry.morphLibrary.Smile.defaultWeight".to_string(),
                        value_type: "number".to_string(),
                        value_json: "0.6".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: Some(1),
                    }],
                },
            },
        }
    }

    #[test]
    fn character_authoring_loads_saves_and_projects_nkc() {
        let module = CharacterAuthoringModule;
        let file = character_file();
        let json = module.save_nkc_string(&file).unwrap();
        let loaded = module.load_nkc_str(&json).unwrap();
        let plan = module.project_to_ecs_plan(&loaded.character);

        assert_eq!(loaded.character.descriptor.character_id, "character-a");
        assert_eq!(plan.morph_count, 1);
        assert_eq!(plan.material_slot_count, 1);
        assert_eq!(plan.data_block_count, 1);
    }

    #[test]
    fn character_authoring_projects_description_into_ecs_components() {
        let module = CharacterAuthoringModule;
        let mut world = World::new();
        let character = character_file().character;

        let entity = module.project_to_ecs(&mut world, &character);

        assert_eq!(
            world
                .get::<CharacterMorphWeights>(entity)
                .unwrap()
                .weights
                .first()
                .unwrap()
                .morph_id,
            "Smile"
        );
        assert_eq!(
            world
                .get::<CharacterMaterialLayers>(entity)
                .unwrap()
                .layers
                .first()
                .unwrap()
                .slot_id,
            "skin"
        );
        assert_eq!(
            world
                .get::<CharacterOverrides>(entity)
                .unwrap()
                .entries
                .first()
                .unwrap()
                .path,
            "$.geometry.morphLibrary.Smile.defaultWeight"
        );
    }

    #[test]
    fn character_authoring_rejects_absolute_uris() {
        let module = CharacterAuthoringModule;
        let mut file = character_file();
        file.character.geometry.base_mesh.uri = Some("/tmp/ava.glb".to_string());

        let error = module.validate_file(&file).unwrap_err();
        assert!(matches!(error, CharacterAuthoringError::AbsoluteUri(_)));
    }

    #[test]
    fn character_authoring_resolves_relative_data_block_uri() {
        let module = CharacterAuthoringModule;
        let context = ProjectContext::new(PathBuf::from("/project"));
        let resolved = module
            .resolve_data_block_uri(&context, &data_block())
            .unwrap();

        assert_eq!(
            resolved,
            ResolvedPath::Local(PathBuf::from("/project/characters/ava.nkcdata"))
        );
    }

    #[test]
    fn character_authoring_verifies_data_block_checksum() {
        let module = CharacterAuthoringModule;
        let block = data_block();

        module
            .verify_data_block_checksum(&block, &[1, 2, 3])
            .unwrap();
        assert!(module
            .verify_data_block_checksum(&block, &[3, 2, 1])
            .is_err());
    }

    #[test]
    fn character_authoring_blocks_future_schema() {
        let module = CharacterAuthoringModule;
        let mut file = character_file();
        file.schema_version = CURRENT_CHARACTER_SCHEMA_VERSION + 1;

        let error = module.validate_file(&file).unwrap_err();
        assert!(matches!(
            error,
            CharacterAuthoringError::UnsupportedFutureSchema { .. }
        ));
    }

    #[test]
    fn character_authoring_validates_region_descriptor_bindings() {
        let module = CharacterAuthoringModule;
        let mut file = character_file();
        file.character.definition.region_descriptors = Some(CharacterRegionDescriptorSet {
            schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
            regions: vec![CharacterRegionDescriptor {
                region_id: "face.mouth".to_string(),
                display_name: "Mouth".to_string(),
                schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
                bindings: vec![
                    CharacterRegionBinding {
                        kind: CharacterRegionBindingKind::MorphControl,
                        target_id: "Smile".to_string(),
                        weight: Some(1.0),
                    },
                    CharacterRegionBinding {
                        kind: CharacterRegionBindingKind::MaterialSlot,
                        target_id: "skin".to_string(),
                        weight: None,
                    },
                ],
                tags: vec!["face".to_string()],
            }],
        });

        let issues = module.validate_file(&file).unwrap();

        assert!(issues
            .iter()
            .all(|issue| !issue.field.contains("regionDescriptors")));
    }

    #[test]
    fn character_authoring_reports_invalid_region_descriptor_targets() {
        let module = CharacterAuthoringModule;
        let mut file = character_file();
        file.character.definition.region_descriptors = Some(CharacterRegionDescriptorSet {
            schema_version: CURRENT_CHARACTER_SCHEMA_VERSION + 1,
            regions: vec![
                CharacterRegionDescriptor {
                    region_id: "face.mouth".to_string(),
                    display_name: "Mouth".to_string(),
                    schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
                    bindings: vec![CharacterRegionBinding {
                        kind: CharacterRegionBindingKind::MorphControl,
                        target_id: "MissingMorph".to_string(),
                        weight: None,
                    }],
                    tags: Vec::new(),
                },
                CharacterRegionDescriptor {
                    region_id: "face.mouth".to_string(),
                    display_name: "Duplicate Mouth".to_string(),
                    schema_version: CURRENT_CHARACTER_SCHEMA_VERSION + 1,
                    bindings: Vec::new(),
                    tags: Vec::new(),
                },
            ],
        });

        let issues = module.validate_file(&file).unwrap();
        let messages = issues
            .iter()
            .map(|issue| format!("{}:{}", issue.field, issue.message))
            .collect::<Vec<_>>()
            .join("\n");

        assert!(messages.contains("region descriptor schema"));
        assert!(messages.contains("region id must be unique"));
        assert!(messages.contains("MissingMorph"));
        assert!(messages.contains("must declare at least one binding"));
    }

    #[test]
    fn library_override_resolver_merges_typed_overrides_deterministically() {
        let base = character_file().character;
        let resolver = LibraryOverrideResolver;
        let result = resolver.resolve(
            &base,
            &CharacterOverrideLayer {
                base_template: None,
                overrides: vec![
                    CharacterOverrideEntry {
                        path: "$.descriptor.name".to_string(),
                        value_type: "string".to_string(),
                        value_json: "\"Ava Custom\"".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: Some(1),
                    },
                    CharacterOverrideEntry {
                        path: "$.topologyVersion".to_string(),
                        value_type: "number".to_string(),
                        value_json: "4".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: Some(1),
                    },
                ],
            },
        );

        assert!(result.conflicts.is_empty());
        assert_eq!(result.merged.descriptor.name, "Ava Custom");
        assert_eq!(result.merged.topology_version, 4);
    }

    #[test]
    fn library_override_resolver_reports_path_and_type_conflicts() {
        let base = character_file().character;
        let resolver = LibraryOverrideResolver;
        let result = resolver.resolve(
            &base,
            &CharacterOverrideLayer {
                base_template: None,
                overrides: vec![
                    CharacterOverrideEntry {
                        path: "$.descriptor.missing".to_string(),
                        value_type: "string".to_string(),
                        value_json: "\"bad\"".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: None,
                    },
                    CharacterOverrideEntry {
                        path: "$.descriptor.name".to_string(),
                        value_type: "number".to_string(),
                        value_json: "7".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: None,
                    },
                ],
            },
        );

        assert_eq!(result.conflicts.len(), 2);
        assert!(result
            .conflicts
            .iter()
            .any(|conflict| conflict.path == "$.descriptor.missing"));
        assert!(result
            .conflicts
            .iter()
            .any(|conflict| conflict.reason.contains("base value")));
    }

    #[test]
    fn character_template_creates_project_local_nkc_override_and_asset_descriptors() {
        let module = CharacterAuthoringModule;
        let base = character_file().character;
        let mut database = AssetDatabase::default();

        let file = module
            .create_project_local_override(
                &base,
                AssetRef {
                    id: "template:ava".to_string(),
                    uri: Some("${NEKO_MARKET}/characters/ava.nkc".to_string()),
                    kind: Some("character-template".to_string()),
                },
                "project-ava",
                "Project Ava",
                "characters/project-ava.nkc",
                &mut database,
            )
            .unwrap();

        assert_eq!(file.character.descriptor.character_id, "project-ava");
        assert_eq!(
            file.character
                .override_layer
                .base_template
                .as_ref()
                .map(|asset| asset.id.as_str()),
            Some("template:ava")
        );
        assert!(file.character.override_layer.overrides.is_empty());
        assert!(database
            .character_description(&AssetHandle::new("character:project-ava"))
            .is_some());
        assert!(database
            .morph_descriptor(&AssetHandle::new("character-morph:project-ava:Smile"))
            .is_some());
        assert!(database
            .character_data_block(&AssetHandle::new("character-data:smile-delta"))
            .is_some());
    }
}
