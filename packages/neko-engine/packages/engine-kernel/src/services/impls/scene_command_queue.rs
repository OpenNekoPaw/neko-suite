//! Scene command queue for engine-kernel.
//!
//! The queue serializes scene command validation and application against the
//! runtime-scene ECS world. Network transport and subscriber fan-out are handled
//! by host-http.

use bevy_ecs::prelude::World;
use neko_runtime_scene::access::SceneCommandBatch;
use neko_runtime_scene::{
    ensure_scene_control_resources, CommandApplySystem, SceneCommandAck, SceneCommandAckStatus,
    SceneCommandEnvelope, SceneCommandValidator, SceneRevision,
};

#[derive(Default)]
pub struct SceneCommandQueue {
    validator: SceneCommandValidator,
}

impl SceneCommandQueue {
    pub fn apply(
        &mut self,
        world: &mut World,
        envelope: SceneCommandEnvelope,
    ) -> Vec<SceneCommandAck> {
        ensure_scene_control_resources(world);
        let current_revision = world.resource::<SceneRevision>().current();
        let validation = match self.validator.validate(&envelope, current_revision) {
            Ok(validation) => validation,
            Err(error) => {
                return vec![SceneCommandAck {
                    seq: envelope.seq,
                    applied_seq: 0,
                    base_revision: envelope.base_revision,
                    revision: current_revision,
                    status: SceneCommandAckStatus::Rejected,
                    error: Some(error.to_string()),
                }];
            }
        };

        let outcome = match CommandApplySystem::apply(world, envelope.event.clone()) {
            Ok(outcome) => outcome,
            Err(error) => {
                return vec![SceneCommandAck {
                    seq: envelope.seq,
                    applied_seq: 0,
                    base_revision: envelope.base_revision,
                    revision: current_revision,
                    status: SceneCommandAckStatus::Rejected,
                    error: Some(error.to_string()),
                }];
            }
        };

        let mut acks = Vec::new();
        if let Some(superseded_seq) = validation.superseded_seq {
            acks.push(SceneCommandAck {
                seq: superseded_seq,
                applied_seq: envelope.seq,
                base_revision: envelope.base_revision,
                revision: outcome.revision,
                status: SceneCommandAckStatus::Superseded,
                error: None,
            });
        }
        acks.push(SceneCommandAck {
            seq: envelope.seq,
            applied_seq: envelope.seq,
            base_revision: envelope.base_revision,
            revision: outcome.revision,
            status: SceneCommandAckStatus::Applied,
            error: None,
        });
        acks
    }
}

impl SceneCommandBatch for SceneCommandQueue {
    fn apply_to_world(
        &mut self,
        world: &mut World,
        envelope: SceneCommandEnvelope,
    ) -> Vec<SceneCommandAck> {
        self.apply(world, envelope)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_runtime_scene::{
        AssetRef, CharacterAuthoringStore, CharacterDefinition, CharacterDescriptor,
        CharacterGeometry, CharacterMaterialLayers, CharacterMorphWeights, CharacterOverrideLayer,
        GlobalTransform, LayeredCharacterDescription, MaterialSlot, MorphDescriptor, NodeName,
        SceneCommandEvent, SceneNodeId, Transform, CURRENT_CHARACTER_SCHEMA_VERSION,
    };

    fn spawn_node(world: &mut World) {
        world.spawn((
            SceneNodeId("node_1".to_string()),
            NodeName("Node".to_string()),
            Transform::default(),
            GlobalTransform::identity(),
        ));
    }

    fn transform_envelope(seq: u64, base_revision: u64) -> SceneCommandEnvelope {
        SceneCommandEnvelope {
            seq,
            base_revision,
            transaction_id: None,
            phase: None,
            coalesce_key: None,
            event: SceneCommandEvent::SetTransform {
                node_id: "node_1".to_string(),
                position: [seq as f32, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            },
        }
    }

    fn test_character_description() -> LayeredCharacterDescription {
        LayeredCharacterDescription {
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
                    id: "mesh-main".to_string(),
                    uri: Some("assets/ava.glb".to_string()),
                    kind: Some("mesh".to_string()),
                },
                skeleton: None,
                morph_library: vec![MorphDescriptor {
                    morph_id: "Smile".to_string(),
                    display_name: "Smile".to_string(),
                    target_path: "$.geometry.blendShapes.Smile".to_string(),
                    default_weight: 0.0,
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
                    uri: Some("assets/ava.glb#skin".to_string()),
                    kind: Some("material".to_string()),
                },
                role: Some("skin".to_string()),
                index: Some(0),
            }],
            override_layer: CharacterOverrideLayer {
                base_template: None,
                overrides: Vec::new(),
            },
        }
    }

    fn insert_test_character_store(world: &mut World) {
        let mut store = CharacterAuthoringStore::default();
        store.insert(test_character_description());
        world.insert_resource(store);
    }

    #[test]
    fn queue_applies_command_and_rejects_stale_revision() {
        let mut world = World::new();
        spawn_node(&mut world);
        let mut queue = SceneCommandQueue::default();

        let applied = queue.apply(&mut world, transform_envelope(1, 0));
        assert_eq!(applied.len(), 1);
        assert_eq!(applied[0].status, SceneCommandAckStatus::Applied);
        assert_eq!(applied[0].revision, 1);

        let rejected = queue.apply(&mut world, transform_envelope(2, 0));
        assert_eq!(rejected.len(), 1);
        assert_eq!(rejected[0].status, SceneCommandAckStatus::Rejected);
        assert_eq!(rejected[0].revision, 1);
    }

    #[test]
    fn queue_rejects_out_of_order_seq() {
        let mut world = World::new();
        spawn_node(&mut world);
        let mut queue = SceneCommandQueue::default();

        let applied = queue.apply(&mut world, transform_envelope(2, 0));
        assert_eq!(applied[0].status, SceneCommandAckStatus::Applied);

        let rejected = queue.apply(&mut world, transform_envelope(1, 1));
        assert_eq!(rejected.len(), 1);
        assert_eq!(rejected[0].seq, 1);
        assert_eq!(rejected[0].status, SceneCommandAckStatus::Rejected);
        assert!(rejected[0]
            .error
            .as_deref()
            .is_some_and(|error| error.contains("not greater than last seen seq")));
    }

    #[test]
    fn queue_reports_superseded_coalesced_command() {
        let mut world = World::new();
        spawn_node(&mut world);
        let mut queue = SceneCommandQueue::default();

        let mut first = transform_envelope(1, 0);
        first.coalesce_key = Some("drag:node_1".to_string());
        let first_ack = queue.apply(&mut world, first);
        assert_eq!(first_ack[0].status, SceneCommandAckStatus::Applied);

        let mut second = transform_envelope(2, 1);
        second.coalesce_key = Some("drag:node_1".to_string());
        let second_ack = queue.apply(&mut world, second);
        assert_eq!(second_ack.len(), 2);
        assert_eq!(second_ack[0].seq, 1);
        assert_eq!(second_ack[0].status, SceneCommandAckStatus::Superseded);
        assert_eq!(second_ack[1].seq, 2);
        assert_eq!(second_ack[1].status, SceneCommandAckStatus::Applied);
    }

    #[test]
    fn queue_applies_and_rejects_character_commands() {
        let mut world = World::new();
        insert_test_character_store(&mut world);
        let mut queue = SceneCommandQueue::default();

        let mut first = SceneCommandEnvelope {
            seq: 1,
            base_revision: 0,
            transaction_id: None,
            phase: None,
            coalesce_key: Some("character-a:morph:Smile".to_string()),
            event: SceneCommandEvent::SetCharacterMorph {
                character_id: "character-a".to_string(),
                morph_id: "Smile".to_string(),
                weight: 0.4,
                topology_version: 3,
            },
        };
        let first_ack = queue.apply(&mut world, first.clone());
        assert_eq!(first_ack[0].status, SceneCommandAckStatus::Applied);
        assert_eq!(
            world
                .resource::<CharacterAuthoringStore>()
                .get("character-a")
                .and_then(|character| character
                    .geometry
                    .morph_library
                    .iter()
                    .find(|morph| morph.morph_id == "Smile"))
                .map(|morph| morph.default_weight),
            Some(0.4)
        );
        assert_eq!(
            world
                .query::<&CharacterMorphWeights>()
                .iter(&world)
                .next()
                .and_then(|weights| weights.weights.first())
                .map(|weight| weight.weight),
            Some(0.4)
        );

        first.seq = 2;
        first.base_revision = 1;
        if let SceneCommandEvent::SetCharacterMorph { weight, .. } = &mut first.event {
            *weight = 0.7;
        }
        let second_ack = queue.apply(&mut world, first);
        assert_eq!(second_ack[0].status, SceneCommandAckStatus::Superseded);
        assert_eq!(second_ack[1].status, SceneCommandAckStatus::Applied);
        assert_eq!(
            world
                .query::<&CharacterMorphWeights>()
                .iter(&world)
                .next()
                .and_then(|weights| weights.weights.first())
                .map(|weight| weight.weight),
            Some(0.7)
        );

        let material = queue.apply(
            &mut world,
            SceneCommandEnvelope {
                seq: 3,
                base_revision: 2,
                transaction_id: None,
                phase: None,
                coalesce_key: None,
                event: SceneCommandEvent::SetCharacterMaterialLayer {
                    character_id: "character-a".to_string(),
                    slot_id: "skin".to_string(),
                    params_json: "{\"roughness\":0.4}".to_string(),
                    topology_version: 3,
                },
            },
        );
        assert_eq!(material[0].status, SceneCommandAckStatus::Applied);
        assert_eq!(
            world
                .query::<&CharacterMaterialLayers>()
                .iter(&world)
                .next()
                .and_then(|layers| layers.layers.first())
                .map(|layer| layer.params_json.as_str()),
            Some("{\"roughness\":0.4}")
        );

        let rejected = queue.apply(
            &mut world,
            SceneCommandEnvelope {
                seq: 4,
                base_revision: 3,
                transaction_id: None,
                phase: None,
                coalesce_key: None,
                event: SceneCommandEvent::SetCharacterMorph {
                    character_id: "missing".to_string(),
                    morph_id: "Smile".to_string(),
                    weight: 0.4,
                    topology_version: 3,
                },
            },
        );
        assert_eq!(rejected[0].status, SceneCommandAckStatus::Rejected);
        assert!(rejected[0]
            .error
            .as_deref()
            .is_some_and(|error| error.contains("Character not found")));
    }
}
