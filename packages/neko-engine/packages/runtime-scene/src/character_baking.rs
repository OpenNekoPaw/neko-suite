//! Deterministic character bake path for export.

use crate::asset_database::AssetDatabase;
use crate::character_authoring::NkcCharacterFile;
use crate::components::{CharacterBonePose, CharacterMaterialLayer, CharacterMorphWeight};
use crate::exporter::ExportOptions;
use crate::modeling_session::{TopologyMigrationResult, TopologyMigrationStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterExportFormat {
    Glb,
    Vrm,
    Fbx,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCharacterPose {
    pub morph_weights: Vec<CharacterMorphWeight>,
    pub skeleton_pose: Vec<CharacterBonePose>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterTopologyExportState {
    pub topology_version: u64,
    pub migration_results: Vec<TopologyMigrationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BakedCharacter {
    pub character_id: String,
    pub topology_version: u64,
    pub export_format: CharacterExportFormat,
    pub morph_weights: Vec<CharacterMorphWeight>,
    pub material_layers: Vec<CharacterMaterialLayer>,
    pub skeleton_pose: Vec<CharacterBonePose>,
    pub material_slot_ids: Vec<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CharacterBakeError {
    #[error("Character file has no character description")]
    MissingCharacter,
    #[error("Topology version mismatch: character {character_topology_version}, export {export_topology_version}")]
    TopologyVersionMismatch {
        character_topology_version: u64,
        export_topology_version: u64,
    },
    #[error("Topology migration invalidates export data: {0}")]
    InvalidTopologyData(String),
    #[error("Character export format is not supported yet: {0}")]
    UnsupportedFormat(String),
    #[error("Baked character serialization failed: {0}")]
    Serialization(String),
}

#[derive(Debug, Clone, Copy)]
pub struct CharacterBakeRequest<'a> {
    pub character_file: &'a NkcCharacterFile,
    pub asset_database: &'a AssetDatabase,
    pub engine_pose: Option<&'a EngineCharacterPose>,
    pub topology_state: &'a CharacterTopologyExportState,
    pub export_options: ExportOptions,
    pub format: CharacterExportFormat,
}

#[derive(Debug, Clone, Default)]
pub struct CharacterBakingSystem;

impl CharacterBakingSystem {
    pub fn bake(
        &self,
        request: CharacterBakeRequest<'_>,
    ) -> Result<BakedCharacter, CharacterBakeError> {
        let character = &request.character_file.character;
        if character.topology_version != request.topology_state.topology_version {
            return Err(CharacterBakeError::TopologyVersionMismatch {
                character_topology_version: character.topology_version,
                export_topology_version: request.topology_state.topology_version,
            });
        }
        let invalid = request
            .topology_state
            .migration_results
            .iter()
            .filter(|result| result.status == TopologyMigrationStatus::Invalidated)
            .map(|result| result.data_kind.clone())
            .collect::<Vec<_>>();
        if !invalid.is_empty() {
            return Err(CharacterBakeError::InvalidTopologyData(invalid.join(",")));
        }

        let mut morph_weights = character
            .geometry
            .morph_library
            .iter()
            .map(|morph| CharacterMorphWeight {
                morph_id: morph.morph_id.clone(),
                weight: morph.default_weight,
            })
            .collect::<Vec<_>>();
        if let Some(pose) = request.engine_pose {
            for pose_weight in &pose.morph_weights {
                if let Some(weight) = morph_weights
                    .iter_mut()
                    .find(|entry| entry.morph_id == pose_weight.morph_id)
                {
                    weight.weight = pose_weight.weight;
                } else {
                    morph_weights.push(pose_weight.clone());
                }
            }
        }
        morph_weights.sort_by(|left, right| left.morph_id.cmp(&right.morph_id));

        let mut material_layers = character
            .material_slots
            .iter()
            .map(|slot| CharacterMaterialLayer {
                slot_id: slot.slot_id.clone(),
                params_json: "{}".to_string(),
                topology_version: character.topology_version,
            })
            .collect::<Vec<_>>();
        for override_entry in &character.override_layer.overrides {
            let Some(slot_id) = override_entry
                .path
                .strip_prefix("$.materialSlots.")
                .and_then(|path| path.strip_suffix(".paramsJson"))
            else {
                continue;
            };
            if let Some(layer) = material_layers
                .iter_mut()
                .find(|layer| layer.slot_id == slot_id)
            {
                layer.params_json = override_entry.value_json.clone();
            }
        }
        material_layers.sort_by(|left, right| left.slot_id.cmp(&right.slot_id));

        let mut skeleton_pose = request
            .engine_pose
            .map(|pose| pose.skeleton_pose.clone())
            .unwrap_or_default();
        skeleton_pose.sort_by(|left, right| left.bone_id.cmp(&right.bone_id));

        let material_slot_ids = character
            .material_slots
            .iter()
            .filter(|slot| {
                request
                    .asset_database
                    .metadata(&crate::asset_database::AssetHandle::new(&slot.material.id))
                    .is_some()
                    || slot.material.uri.is_some()
            })
            .map(|slot| slot.slot_id.clone())
            .collect();

        Ok(BakedCharacter {
            character_id: character.descriptor.character_id.clone(),
            topology_version: character.topology_version,
            export_format: request.format,
            morph_weights,
            material_layers,
            skeleton_pose,
            material_slot_ids,
            diagnostics: Vec::new(),
        })
    }

    pub fn export_baked(
        &self,
        request: CharacterBakeRequest<'_>,
    ) -> Result<Vec<u8>, CharacterBakeError> {
        let format = request.format;
        let baked = self.bake(request)?;
        match format {
            CharacterExportFormat::Glb | CharacterExportFormat::Vrm => serde_json::to_vec(&baked)
                .map_err(|error| CharacterBakeError::Serialization(error.to_string())),
            CharacterExportFormat::Fbx => Err(CharacterBakeError::UnsupportedFormat(
                "FBX writer is not implemented; baked character representation is available"
                    .to_string(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::character_authoring::{
        AssetRef, CharacterDefinition, CharacterDescriptor, CharacterGeometry,
        CharacterOverrideEntry, CharacterOverrideLayer, CharacterOverrideOperation,
        LayeredCharacterDescription, MaterialSlot, MorphDescriptor, NkcCharacterFile,
        CURRENT_CHARACTER_SCHEMA_VERSION,
    };
    use crate::components::Transform;

    fn character_file() -> NkcCharacterFile {
        NkcCharacterFile {
            file_kind: "neko.character".to_string(),
            schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
            data_blocks: Vec::new(),
            feature_flags: Vec::new(),
            migration_manifest_uri: None,
            checksum: None,
            character: LayeredCharacterDescription {
                descriptor: CharacterDescriptor {
                    character_id: "character-a".to_string(),
                    name: "Ava".to_string(),
                    schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
                    feature_flags: Vec::new(),
                    base_template: None,
                    template_version: None,
                    checksum: None,
                },
                topology_version: 3,
                definition: CharacterDefinition::default(),
                geometry: CharacterGeometry {
                    base_mesh: AssetRef {
                        id: "mesh-a".to_string(),
                        uri: Some("assets/ava.glb".to_string()),
                        kind: Some("mesh".to_string()),
                    },
                    skeleton: None,
                    morph_library: vec![MorphDescriptor {
                        morph_id: "Smile".to_string(),
                        display_name: "Smile".to_string(),
                        target_path: "$.geometry.blendShapes.Smile".to_string(),
                        default_weight: 0.25,
                        min: Some(0.0),
                        max: Some(1.0),
                        sparse_delta: None,
                        tags: Vec::new(),
                    }],
                    skin_weight_atlases: Vec::new(),
                    blend_shapes: Vec::new(),
                    data_blocks: Vec::new(),
                },
                material_slots: vec![MaterialSlot {
                    slot_id: "skin".to_string(),
                    name: "Skin".to_string(),
                    material: AssetRef {
                        id: "mat-skin".to_string(),
                        uri: None,
                        kind: Some("material".to_string()),
                    },
                    role: Some("skin".to_string()),
                    index: Some(0),
                }],
                override_layer: CharacterOverrideLayer {
                    base_template: None,
                    overrides: vec![CharacterOverrideEntry {
                        path: "$.materialSlots.skin.paramsJson".to_string(),
                        value_type: "object".to_string(),
                        value_json: "{\"roughness\":0.4}".to_string(),
                        operation: CharacterOverrideOperation::Set,
                        base_revision: None,
                    }],
                },
            },
        }
    }

    fn topology_state(results: Vec<TopologyMigrationResult>) -> CharacterTopologyExportState {
        CharacterTopologyExportState {
            topology_version: 3,
            migration_results: results,
        }
    }

    #[test]
    fn baking_uses_authoring_data_asset_database_and_engine_pose_deterministically() {
        let system = CharacterBakingSystem;
        let file = character_file();
        let pose = EngineCharacterPose {
            morph_weights: vec![CharacterMorphWeight {
                morph_id: "Smile".to_string(),
                weight: 0.8,
            }],
            skeleton_pose: vec![CharacterBonePose {
                bone_id: "jaw".to_string(),
                transform: Transform::default(),
                topology_version: 3,
            }],
        };
        let baked = system
            .bake(CharacterBakeRequest {
                character_file: &file,
                asset_database: &AssetDatabase::default(),
                engine_pose: Some(&pose),
                topology_state: &topology_state(Vec::new()),
                export_options: ExportOptions::default(),
                format: CharacterExportFormat::Glb,
            })
            .unwrap();

        assert_eq!(baked.morph_weights[0].weight, 0.8);
        assert_eq!(baked.material_layers[0].params_json, "{\"roughness\":0.4}");
        assert_eq!(baked.skeleton_pose[0].bone_id, "jaw");
    }

    #[test]
    fn baking_blocks_invalid_topology_and_excludes_prediction_state() {
        let system = CharacterBakingSystem;
        let file = character_file();
        let invalid = topology_state(vec![TopologyMigrationResult {
            data_kind: "skin".to_string(),
            status: TopologyMigrationStatus::Invalidated,
            diagnostic: Some("requires repair".to_string()),
        }]);

        assert!(matches!(
            system.bake(CharacterBakeRequest {
                character_file: &file,
                asset_database: &AssetDatabase::default(),
                engine_pose: None,
                topology_state: &invalid,
                export_options: ExportOptions::default(),
                format: CharacterExportFormat::Vrm,
            }),
            Err(CharacterBakeError::InvalidTopologyData(_))
        ));
    }

    #[test]
    fn glb_vrm_and_fbx_use_same_baked_character_path() {
        let system = CharacterBakingSystem;
        let file = character_file();
        let topology = topology_state(Vec::new());
        let glb = system
            .export_baked(CharacterBakeRequest {
                character_file: &file,
                asset_database: &AssetDatabase::default(),
                engine_pose: None,
                topology_state: &topology,
                export_options: ExportOptions::default(),
                format: CharacterExportFormat::Glb,
            })
            .unwrap();
        let vrm = system
            .export_baked(CharacterBakeRequest {
                character_file: &file,
                asset_database: &AssetDatabase::default(),
                engine_pose: None,
                topology_state: &topology,
                export_options: ExportOptions::default(),
                format: CharacterExportFormat::Vrm,
            })
            .unwrap();
        let fbx = system
            .export_baked(CharacterBakeRequest {
                character_file: &file,
                asset_database: &AssetDatabase::default(),
                engine_pose: None,
                topology_state: &topology,
                export_options: ExportOptions::default(),
                format: CharacterExportFormat::Fbx,
            })
            .unwrap_err();

        assert!(String::from_utf8(glb)
            .unwrap()
            .contains("\"exportFormat\":\"glb\""));
        assert!(String::from_utf8(vrm)
            .unwrap()
            .contains("\"exportFormat\":\"vrm\""));
        assert!(matches!(fbx, CharacterBakeError::UnsupportedFormat(_)));
    }
}
