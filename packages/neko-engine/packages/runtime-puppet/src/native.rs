//! Native Bone2D + BlendShape runtime components, loading, and CPU systems.

use crate::components::{
    BlendMode, DeformedVertices, GlobalTransform2D, MeshData, NodeName, Opacity, PuppetFormat,
    PuppetNodeId, PuppetNodeType, PuppetRoot, TextureRef, Transform2D, ZOrder,
};
use crate::hierarchy;
use bevy_ecs::prelude::*;
use bevy_tasks::{prelude::ParallelSlice, TaskPool};
use glam::{Mat3, Vec2, Vec3};
use neko_engine_types::animation::{
    AnimationDuration, AnimationLeafDomain, AnimationLeafSample, AnimationLeafTrackId,
    AnimationLeafTrackSample, AnimationLeafValueKind,
};
use neko_engine_types::puppet::{
    AnimationClip2D, NkpAxis2D, NkpBlendShapeDef, NkpControlDriver, NkpControlSource,
    NkpControlTarget, NkpDriverBlendMode, NkpDriverCurve, NkpIkSolver2D, NkpProjectData,
    NkpTransform2DEdit, NkpTransformEditMode,
};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};
use std::sync::LazyLock;

const WEIGHT_SUM_TOLERANCE: f32 = 0.01;
const EPSILON: f32 = 1e-6;
const PARALLEL_DEFORMATION_VERTEX_THRESHOLD: usize = usize::MAX;
const PARALLEL_DEFORMATION_CHUNK_SIZE: usize = 1024;

static NATIVE_CPU_DEFORMATION_TASK_POOL: LazyLock<TaskPool> = LazyLock::new(TaskPool::new);

// ─── Components ──────────────────────────────────────────────────────────────

/// Marker for native Bone2D + BlendShape puppets.
#[derive(Component, Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativePuppet;

/// Native Bone2D component, mounted on bone entities.
#[derive(Component, Debug, Clone)]
pub struct Bone2D {
    pub id: String,
    pub name: String,
    pub rest_transform: Transform2D,
    pub length: f32,
    pub local_transform: Transform2D,
    pub global_transform: Mat3,
}

/// Native skeleton index, mounted on the puppet root.
#[derive(Component, Debug, Clone)]
pub struct Skeleton2D {
    pub bone_entities: Vec<Entity>,
    pub bone_ids: Vec<String>,
    pub bone_names: Vec<String>,
    pub inverse_bind_transforms: Vec<Mat3>,
}

/// Mesh skin weights with at most four joints per vertex.
#[derive(Component, Debug, Clone)]
pub struct SkinWeights2D {
    pub mesh_id: String,
    pub joint_indices: Vec<[u16; 4]>,
    pub joint_weights: Vec<[f32; 4]>,
}

/// IK constraint data. The target references a bone transform for the first pass.
#[derive(Component, Debug, Clone)]
pub struct IkConstraint2D {
    pub id: String,
    pub target_entity: Entity,
    pub end_entity: Entity,
    pub chain_length: u8,
    pub solver: IkSolver2D,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IkSolver2D {
    TwoBone,
    Ccd { max_iterations: u32 },
}

/// Path constraint for lightweight bone path following.
#[derive(Component, Debug, Clone)]
pub struct PathConstraint2D {
    pub id: String,
    pub bone_entity: Entity,
    pub path: Vec<Vec2>,
    pub influence: f32,
}

/// Spring bone component.
#[derive(Component, Debug, Clone)]
pub struct SpringBone2D {
    pub id: String,
    pub bone_entity: Entity,
    pub stiffness: f32,
    pub damping: f32,
    pub gravity_scale: f32,
    pub wind_influence: f32,
}

/// Runtime state for a spring bone.
#[derive(Component, Debug, Clone, Default)]
pub struct SpringBoneState2D {
    pub velocity: Vec2,
}

/// BlendShape definitions attached to mesh entities.
#[derive(Component, Debug, Clone)]
pub struct BlendShapeSet {
    pub mesh_id: String,
    pub shapes: Vec<BlendShapeDef>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BlendShapeDef {
    pub name: String,
    pub vertex_deltas: Vec<Vec2>,
    pub post_skin: bool,
}

/// Current BlendShape weights attached to mesh entities.
#[derive(Component, Debug, Clone)]
pub struct BlendShapeWeights {
    pub weights: Vec<f32>,
}

/// Bind-pose vertices after pre-skin BlendShape application.
#[derive(Component, Debug, Clone)]
pub struct MorphedVertices(pub Vec<Vec2>);

/// Expression presets mounted on the puppet root.
#[derive(Component, Debug, Clone)]
pub struct ExpressionPresets {
    pub presets: Vec<ExpressionPreset>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExpressionPreset {
    pub name: String,
    pub weights: Vec<(String, f32)>,
}

/// Optional expression input weights used by ControlDrivers.
#[derive(Component, Debug, Clone, Default)]
pub struct NativeExpressionWeights {
    pub weights: BTreeMap<String, f32>,
}

/// Explicit driver set mounted on the puppet root.
#[derive(Component, Debug, Clone)]
pub struct ControlDriverSet {
    pub drivers: Vec<ControlDriver>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ControlDriver {
    pub id: String,
    pub source: ControlSource,
    pub target: ControlTarget,
    pub curve: DriverCurve,
    pub blend_mode: DriverBlendMode,
    pub priority: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ControlSource {
    BlendShapeWeight { name: String },
    ExpressionWeight { preset: String },
    TrackingParam { name: String },
    Live2dParam { name: String },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ControlTarget {
    BoneRotation { bone: String, axis: Axis2D },
    BonePosition { bone: String },
    BoneScale { bone: String },
    BlendShapeWeight { name: String },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DriverCurve {
    Linear { scale: f32, offset: f32 },
    Bezier { points: [f32; 4] },
    Step,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriverBlendMode {
    Add,
    Override,
    Max,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Axis2D {
    X,
    Y,
    Z,
}

/// Current tracking parameter inputs mounted on the puppet root.
#[derive(Component, Debug, Clone, Default)]
pub struct TrackingInputs2D {
    pub values: BTreeMap<String, f32>,
}

/// Native animation clips mounted on the puppet root.
#[derive(Component, Debug, Clone, Default)]
pub struct NativeAnimationClips {
    pub clips: Vec<AnimationClip2D>,
}

/// Native animation playback state mounted on the puppet root.
#[derive(Component, Debug, Clone)]
pub struct NativeAnimationPlayback {
    pub clip_name: String,
    pub elapsed_ms: f32,
    pub playing: bool,
    pub looping: bool,
}

/// CPU deformation execution mode for native puppet evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeCpuDeformationMode {
    Serial,
    Parallel,
    Auto,
}

/// Runtime policy for native CPU deformation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeCpuDeformationConfig {
    pub mode: NativeCpuDeformationMode,
    pub parallel_vertex_threshold: usize,
    pub chunk_size: usize,
}

impl NativeCpuDeformationConfig {
    pub const fn serial() -> Self {
        Self {
            mode: NativeCpuDeformationMode::Serial,
            parallel_vertex_threshold: usize::MAX,
            chunk_size: PARALLEL_DEFORMATION_CHUNK_SIZE,
        }
    }

    pub const fn parallel() -> Self {
        Self {
            mode: NativeCpuDeformationMode::Parallel,
            parallel_vertex_threshold: 0,
            chunk_size: PARALLEL_DEFORMATION_CHUNK_SIZE,
        }
    }
}

impl Default for NativeCpuDeformationConfig {
    fn default() -> Self {
        Self {
            mode: NativeCpuDeformationMode::Auto,
            parallel_vertex_threshold: PARALLEL_DEFORMATION_VERTEX_THRESHOLD,
            chunk_size: PARALLEL_DEFORMATION_CHUNK_SIZE,
        }
    }
}

/// Benchmark fixture sizes used to evaluate native CPU deformation policy.
pub const NATIVE_DEFORMATION_BENCHMARK_VERTEX_COUNTS: &[usize] = &[1_000, 10_000, 50_000];

/// Current conservative default threshold derived from scheduling-overhead policy.
pub const NATIVE_DEFORMATION_DEFAULT_PARALLEL_THRESHOLD: usize =
    PARALLEL_DEFORMATION_VERTEX_THRESHOLD;

// ─── Loading ────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct NativeLoadResult {
    pub root_entity: Entity,
    pub entity_count: usize,
}

pub fn load_native_project(
    world: &mut World,
    project: &NkpProjectData,
) -> Result<NativeLoadResult, String> {
    validate_native_project(project)?;

    let skeleton = project
        .skeleton
        .as_ref()
        .ok_or_else(|| "Native puppet is missing skeleton".to_string())?;
    let blend_shapes = project
        .blend_shapes
        .as_ref()
        .ok_or_else(|| "Native puppet is missing blendShapes".to_string())?;

    let root_entity = world
        .spawn((
            PuppetRoot,
            NativePuppet,
            PuppetNodeId("puppet_root".to_string()),
            NodeName(project.name.clone()),
            Transform2D::default(),
            GlobalTransform2D::default(),
            PuppetNodeType::Root,
            ZOrder(0.0),
            Opacity::default(),
            BlendMode::default(),
            ExpressionPresets {
                presets: project
                    .expressions
                    .iter()
                    .map(|(name, weights)| ExpressionPreset {
                        name: name.clone(),
                        weights: weights
                            .iter()
                            .map(|(shape, weight)| (shape.clone(), *weight))
                            .collect(),
                    })
                    .collect(),
            },
            NativeExpressionWeights::default(),
            TrackingInputs2D::default(),
            ControlDriverSet {
                drivers: project
                    .control_drivers
                    .iter()
                    .map(map_control_driver)
                    .collect(),
            },
            NativeAnimationClips {
                clips: project.animations.clone(),
            },
        ))
        .id();
    world.entity_mut(root_entity).insert(PuppetFormat::Native);

    let mut bone_entities = Vec::new();
    let mut bone_ids = Vec::new();
    let mut bone_names = Vec::new();
    let mut bone_entity_by_id = HashMap::new();

    for bone in &skeleton.bones {
        let transform = Transform2D {
            position: to_vec2(bone.position),
            rotation: bone.rotation.unwrap_or(0.0).to_radians(),
            scale: bone.scale.map(to_vec2).unwrap_or(Vec2::ONE),
        };
        let entity = world
            .spawn((
                PuppetNodeId(bone.id.clone()),
                NodeName(bone.name.clone()),
                PuppetNodeType::Group,
                transform.clone(),
                GlobalTransform2D::default(),
                ZOrder(0.0),
                Opacity::default(),
                BlendMode::default(),
                Bone2D {
                    id: bone.id.clone(),
                    name: bone.name.clone(),
                    rest_transform: transform.clone(),
                    length: bone.length.unwrap_or(0.0),
                    local_transform: transform,
                    global_transform: Mat3::IDENTITY,
                },
            ))
            .id();
        bone_entity_by_id.insert(bone.id.clone(), entity);
        bone_entities.push(entity);
        bone_ids.push(bone.id.clone());
        bone_names.push(bone.name.clone());
    }

    for bone in &skeleton.bones {
        let entity = bone_entity_by_id[&bone.id];
        if let Some(parent_id) = &bone.parent {
            let parent = bone_entity_by_id[parent_id];
            hierarchy::set_parent(world, entity, parent);
        } else {
            hierarchy::set_parent(world, entity, root_entity);
        }
    }

    propagate_bones(world, &bone_entities);
    let inverse_bind_transforms = bone_entities
        .iter()
        .map(|entity| {
            world
                .get::<Bone2D>(*entity)
                .map(|bone| bone.global_transform.inverse())
                .unwrap_or(Mat3::IDENTITY)
        })
        .collect();

    world.entity_mut(root_entity).insert(Skeleton2D {
        bone_entities: bone_entities.clone(),
        bone_ids: bone_ids.clone(),
        bone_names,
        inverse_bind_transforms,
    });

    for constraint in &skeleton.ik_constraints {
        let solver = match constraint.solver {
            NkpIkSolver2D::TwoBone => IkSolver2D::TwoBone,
            NkpIkSolver2D::Ccd { max_iterations } => IkSolver2D::Ccd {
                max_iterations: max_iterations.unwrap_or(8),
            },
        };
        let target_entity = bone_entity_by_id[&constraint.target_bone];
        let end_entity = bone_entity_by_id[&constraint.end_bone];
        world.spawn((
            IkConstraint2D {
                id: constraint.id.clone(),
                target_entity,
                end_entity,
                chain_length: constraint.chain_length,
                solver,
            },
            NativePuppet,
        ));
    }

    for constraint in &skeleton.path_constraints {
        world.spawn((
            PathConstraint2D {
                id: constraint.id.clone(),
                bone_entity: bone_entity_by_id[&constraint.bone],
                path: constraint
                    .path
                    .iter()
                    .map(|point| to_vec2(*point))
                    .collect(),
                influence: constraint.influence.unwrap_or(1.0).clamp(0.0, 1.0),
            },
            NativePuppet,
        ));
    }

    for spring in &skeleton.spring_bones {
        world.spawn((
            SpringBone2D {
                id: spring.id.clone(),
                bone_entity: bone_entity_by_id[&spring.bone],
                stiffness: spring.stiffness,
                damping: spring.damping,
                gravity_scale: spring.gravity_scale.unwrap_or(0.0),
                wind_influence: spring.wind_influence.unwrap_or(0.0),
            },
            SpringBoneState2D::default(),
            NativePuppet,
        ));
    }

    let shapes_by_mesh: HashMap<&str, Vec<&NkpBlendShapeDef>> = blend_shapes
        .shapes
        .iter()
        .chain(blend_shapes.custom.iter())
        .fold(HashMap::new(), |mut by_mesh, shape| {
            by_mesh
                .entry(shape.mesh_id.as_str())
                .or_default()
                .push(shape);
            by_mesh
        });

    let mesh_id_by_layer: BTreeMap<&str, &str> = project
        .layers
        .iter()
        .map(|layer| (layer.id.as_str(), layer.mesh.id.as_str()))
        .collect();

    for layer in &project.layers {
        let mesh = MeshData {
            vertices: layer
                .mesh
                .vertices
                .iter()
                .map(|vertex| to_vec2(*vertex))
                .collect(),
            uvs: layer.mesh.uvs.iter().map(|uv| to_vec2(*uv)).collect(),
            indices: layer
                .mesh
                .triangles
                .iter()
                .flat_map(|triangle| triangle.iter().map(|index| *index as u16))
                .collect(),
        };
        let shape_defs: Vec<BlendShapeDef> = shapes_by_mesh
            .get(layer.mesh.id.as_str())
            .map(|shapes| {
                shapes
                    .iter()
                    .map(|shape| BlendShapeDef {
                        name: shape.name.clone(),
                        vertex_deltas: shape
                            .vertex_deltas
                            .iter()
                            .map(|delta| to_vec2(*delta))
                            .collect(),
                        post_skin: shape.post_skin.unwrap_or(false),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let shape_count = shape_defs.len();
        let mut entity = world.spawn((
            PuppetNodeId(layer.id.clone()),
            NodeName(layer.name.clone().unwrap_or_else(|| layer.id.clone())),
            PuppetNodeType::Part,
            Transform2D::default(),
            GlobalTransform2D::default(),
            ZOrder(layer.z_order.unwrap_or(0.0)),
            Opacity(layer.opacity.unwrap_or(1.0)),
            BlendMode::default(),
            TextureRef { texture_index: 0 },
            mesh,
            BlendShapeSet {
                mesh_id: layer.mesh.id.clone(),
                shapes: shape_defs,
            },
            BlendShapeWeights {
                weights: vec![0.0; shape_count],
            },
            NativePuppet,
        ));
        if let Some(weights) = &layer.skin_weights {
            entity.insert(SkinWeights2D {
                mesh_id: weights.mesh_id.clone(),
                joint_indices: weights.joint_indices.clone(),
                joint_weights: weights.joint_weights.clone(),
            });
        }
        let layer_entity = entity.id();
        hierarchy::set_parent(world, layer_entity, root_entity);
    }

    let mut entity_count = 1 + bone_entities.len() + project.layers.len();
    entity_count += skeleton.ik_constraints.len();
    entity_count += skeleton.path_constraints.len();
    entity_count += skeleton.spring_bones.len();

    apply_expression_preset(world, "neutral").ok();
    control_driver_update(world);
    blendshape_apply(world);
    skinning_2d(world);

    debug_assert!(
        mesh_id_by_layer.len() == project.layers.len(),
        "layer ids are validated before load"
    );

    Ok(NativeLoadResult {
        root_entity,
        entity_count,
    })
}

pub fn validate_native_project(project: &NkpProjectData) -> Result<(), String> {
    if project.puppet.format != Some(neko_engine_types::puppet::PuppetFormat::Native) {
        return Err("Native puppet project must declare puppet.format = native".to_string());
    }
    if project.puppet.animation_model
        != Some(neko_engine_types::puppet::NkpAnimationModel::BoneBlendshape)
    {
        return Err(
            "Native puppet project must declare puppet.animationModel = bone-blendshape"
                .to_string(),
        );
    }
    let skeleton = project
        .skeleton
        .as_ref()
        .ok_or_else(|| "Native puppet is missing skeleton".to_string())?;
    let blend_shapes = project
        .blend_shapes
        .as_ref()
        .ok_or_else(|| "Native puppet is missing blendShapes".to_string())?;

    let mut bone_ids = BTreeSet::new();
    let mut bone_names = BTreeSet::new();
    for bone in &skeleton.bones {
        if !bone_ids.insert(bone.id.as_str()) {
            return Err(format!("Duplicate bone id: {}", bone.id));
        }
        if !bone_names.insert(bone.name.as_str()) {
            return Err(format!("Duplicate bone name: {}", bone.name));
        }
    }
    for bone in &skeleton.bones {
        if let Some(parent) = &bone.parent {
            ensure_known_bone(parent, &bone_ids, &bone_names)?;
        }
    }

    let mesh_vertex_counts: BTreeMap<&str, usize> = project
        .layers
        .iter()
        .map(|layer| (layer.mesh.id.as_str(), layer.mesh.vertices.len()))
        .collect();
    if mesh_vertex_counts.len() != project.layers.len() {
        return Err("Duplicate mesh id in native layers".to_string());
    }

    for layer in &project.layers {
        if let Some(weights) = &layer.skin_weights {
            if weights.mesh_id != layer.mesh.id {
                return Err(format!(
                    "Skin weights meshId '{}' does not match layer mesh '{}'",
                    weights.mesh_id, layer.mesh.id
                ));
            }
            if weights.joint_indices.len() != layer.mesh.vertices.len()
                || weights.joint_weights.len() != layer.mesh.vertices.len()
            {
                return Err(format!(
                    "Skin weights for mesh '{}' must match vertex count",
                    layer.mesh.id
                ));
            }
            for (vertex_index, (indices, weights)) in weights
                .joint_indices
                .iter()
                .zip(weights.joint_weights.iter())
                .enumerate()
            {
                let sum: f32 = weights.iter().sum();
                if (sum - 1.0).abs() > WEIGHT_SUM_TOLERANCE {
                    return Err(format!(
                        "Skin weights for mesh '{}' vertex {} are not normalized",
                        layer.mesh.id, vertex_index
                    ));
                }
                for (joint_index, joint_weight) in indices.iter().zip(weights.iter()) {
                    if *joint_weight > 0.0 && (*joint_index as usize) >= skeleton.bones.len() {
                        return Err(format!(
                            "Skin weight joint index {} for mesh '{}' does not resolve",
                            joint_index, layer.mesh.id
                        ));
                    }
                }
            }
        }
    }

    let mut shape_names = BTreeSet::new();
    for shape in blend_shapes.shapes.iter().chain(blend_shapes.custom.iter()) {
        let vertex_count = mesh_vertex_counts
            .get(shape.mesh_id.as_str())
            .ok_or_else(|| format!("BlendShape '{}' targets unknown mesh", shape.name))?;
        if shape.vertex_deltas.len() != *vertex_count {
            return Err(format!(
                "BlendShape '{}' delta count {} does not match mesh vertex count {}",
                shape.name,
                shape.vertex_deltas.len(),
                vertex_count
            ));
        }
        if !shape_names.insert(shape.name.as_str()) {
            return Err(format!("Duplicate BlendShape name: {}", shape.name));
        }
    }

    for shape in &blend_shapes.implemented {
        if !shape_names.contains(shape.as_str()) {
            return Err(format!(
                "Implemented BlendShape '{}' has no shape definition",
                shape
            ));
        }
    }
    for (preset, weights) in &project.expressions {
        for shape in weights.keys() {
            if !shape_names.contains(shape.as_str()) {
                return Err(format!(
                    "Expression preset '{}' references unknown BlendShape '{}'",
                    preset, shape
                ));
            }
        }
    }

    for constraint in &skeleton.ik_constraints {
        ensure_known_bone(&constraint.target_bone, &bone_ids, &bone_names)?;
        ensure_known_bone(&constraint.end_bone, &bone_ids, &bone_names)?;
    }
    for constraint in &skeleton.path_constraints {
        ensure_known_bone(&constraint.bone, &bone_ids, &bone_names)?;
        if constraint.path.is_empty() {
            return Err(format!(
                "Path constraint '{}' has an empty path",
                constraint.id
            ));
        }
    }
    for spring in &skeleton.spring_bones {
        ensure_known_bone(&spring.bone, &bone_ids, &bone_names)?;
    }
    for clip in &project.animations {
        for track in &clip.bone_tracks {
            ensure_known_bone(&track.bone, &bone_ids, &bone_names)?;
        }
        for track in &clip.blendshape_tracks {
            if !shape_names.contains(track.blendshape.as_str()) {
                return Err(format!(
                    "Animation clip '{}' references unknown BlendShape '{}'",
                    clip.name, track.blendshape
                ));
            }
        }
    }

    for driver in &project.control_drivers {
        validate_driver(
            driver,
            &bone_ids,
            &bone_names,
            &shape_names,
            &project.expressions,
        )?;
    }
    validate_driver_cycles(&project.control_drivers)?;

    Ok(())
}

fn ensure_known_bone(
    bone: &str,
    bone_ids: &BTreeSet<&str>,
    bone_names: &BTreeSet<&str>,
) -> Result<(), String> {
    if bone_ids.contains(bone) || bone_names.contains(bone) {
        Ok(())
    } else {
        Err(format!("Unknown bone reference: {}", bone))
    }
}

fn validate_driver(
    driver: &NkpControlDriver,
    bone_ids: &BTreeSet<&str>,
    bone_names: &BTreeSet<&str>,
    shape_names: &BTreeSet<&str>,
    expressions: &BTreeMap<String, BTreeMap<String, f32>>,
) -> Result<(), String> {
    match &driver.source {
        NkpControlSource::Blendshape { name } => {
            if !shape_names.contains(name.as_str()) {
                return Err(format!(
                    "ControlDriver '{}' references unknown BlendShape source '{}'",
                    driver.id, name
                ));
            }
        }
        NkpControlSource::Expression { preset } => {
            if !expressions.contains_key(preset) {
                return Err(format!(
                    "ControlDriver '{}' references unknown expression source '{}'",
                    driver.id, preset
                ));
            }
        }
        NkpControlSource::Tracking { .. } | NkpControlSource::Live2dParam { .. } => {}
    }

    match &driver.target {
        NkpControlTarget::BoneRotation { bone, .. }
        | NkpControlTarget::BonePosition { bone }
        | NkpControlTarget::BoneScale { bone } => ensure_known_bone(bone, bone_ids, bone_names),
        NkpControlTarget::BlendshapeWeight { name } => {
            if shape_names.contains(name.as_str()) {
                Ok(())
            } else {
                Err(format!(
                    "ControlDriver '{}' references unknown BlendShape target '{}'",
                    driver.id, name
                ))
            }
        }
    }
}

fn validate_driver_cycles(drivers: &[NkpControlDriver]) -> Result<(), String> {
    let mut edges: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for driver in drivers {
        if let (Some(source), Some(target)) = (
            blendshape_source_name(&driver.source),
            blendshape_target_name(&driver.target),
        ) {
            edges.entry(source).or_default().insert(target);
        }
    }

    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    for node in edges.keys() {
        if has_cycle(node, &edges, &mut visiting, &mut visited) {
            return Err("ControlDriver BlendShape dependency cycle detected".to_string());
        }
    }
    Ok(())
}

fn has_cycle(
    node: &str,
    edges: &BTreeMap<String, BTreeSet<String>>,
    visiting: &mut BTreeSet<String>,
    visited: &mut BTreeSet<String>,
) -> bool {
    if visited.contains(node) {
        return false;
    }
    if !visiting.insert(node.to_string()) {
        return true;
    }
    if let Some(targets) = edges.get(node) {
        for target in targets {
            if has_cycle(target, edges, visiting, visited) {
                return true;
            }
        }
    }
    visiting.remove(node);
    visited.insert(node.to_string());
    false
}

// ─── Systems ────────────────────────────────────────────────────────────────

pub fn apply_expression_preset(world: &mut World, name: &str) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    let preset = {
        let presets = world
            .get::<ExpressionPresets>(root)
            .ok_or_else(|| "No expression presets found".to_string())?;
        presets
            .presets
            .iter()
            .find(|preset| preset.name == name)
            .cloned()
    };
    let Some(preset) = preset else {
        if name == "neutral" {
            return Ok(());
        }
        return Err(format!("Expression preset '{}' not found", name));
    };

    set_all_blendshape_weights(world, 0.0);
    for (shape, weight) in &preset.weights {
        set_blendshape_weight(world, shape, *weight);
    }
    if let Some(mut active) = world.get_mut::<NativeExpressionWeights>(root) {
        active.weights.clear();
        active.weights.insert(name.to_string(), 1.0);
    }
    Ok(())
}

pub fn clear_expression_preset(world: &mut World) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    set_all_blendshape_weights(world, 0.0);
    if let Some(mut active) = world.get_mut::<NativeExpressionWeights>(root) {
        active.weights.clear();
    }
    Ok(())
}

pub fn set_bone_transform(
    world: &mut World,
    bone_ref: &str,
    transform: NkpTransform2DEdit,
    mode: NkpTransformEditMode,
) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    let skeleton = world
        .get::<Skeleton2D>(root)
        .cloned()
        .ok_or_else(|| "No native skeleton loaded".to_string())?;
    let entity = find_bone_entity(world, &skeleton, bone_ref)
        .ok_or_else(|| format!("Native bone '{}' not found", bone_ref))?;

    {
        let mut bone = world
            .get_mut::<Bone2D>(entity)
            .ok_or_else(|| format!("Native bone '{}' not found", bone_ref))?;
        if let Some(position) = transform.position {
            let position = to_vec2(position);
            bone.local_transform.position = match mode {
                NkpTransformEditMode::Set => position,
                NkpTransformEditMode::Offset => bone.local_transform.position + position,
            };
            bone.rest_transform.position = bone.local_transform.position;
        }
        if let Some(rotation) = transform.rotation {
            let radians = rotation.to_radians();
            bone.local_transform.rotation = match mode {
                NkpTransformEditMode::Set => radians,
                NkpTransformEditMode::Offset => bone.local_transform.rotation + radians,
            };
            bone.rest_transform.rotation = bone.local_transform.rotation;
        }
        if let Some(scale) = transform.scale {
            let scale = to_vec2(scale);
            bone.local_transform.scale = match mode {
                NkpTransformEditMode::Set => scale,
                NkpTransformEditMode::Offset => bone.local_transform.scale + scale,
            };
            bone.rest_transform.scale = bone.local_transform.scale;
        }
    }

    if let Some(bone) = world.get::<Bone2D>(entity) {
        let next = bone.local_transform.clone();
        if let Some(mut transform) = world.get_mut::<Transform2D>(entity) {
            *transform = next;
        }
    }

    propagate_bones(world, &skeleton.bone_entities);
    Ok(())
}

pub fn set_skin_weight(
    world: &mut World,
    mesh_id: &str,
    vertex_index: usize,
    joint_indices: [u16; 4],
    joint_weights: [f32; 4],
) -> Result<(), String> {
    ensure_normalized_weights(mesh_id, vertex_index, &joint_weights)?;
    let max_bones = find_native_root(world)
        .and_then(|root| world.get::<Skeleton2D>(root))
        .map(|skeleton| skeleton.bone_entities.len())
        .ok_or_else(|| "No native skeleton loaded".to_string())?;

    for (joint_index, joint_weight) in joint_indices.iter().zip(joint_weights.iter()) {
        if *joint_weight > 0.0 && (*joint_index as usize) >= max_bones {
            return Err(format!(
                "Skin weight joint index {} for mesh '{}' does not resolve",
                joint_index, mesh_id
            ));
        }
    }

    let mut query = world.query::<&mut SkinWeights2D>();
    for mut weights in query.iter_mut(world) {
        if weights.mesh_id != mesh_id {
            continue;
        }
        let Some(indices) = weights.joint_indices.get_mut(vertex_index) else {
            return Err(format!(
                "Skin weights for mesh '{}' vertex {} not found",
                mesh_id, vertex_index
            ));
        };
        *indices = joint_indices;
        let Some(row_weights) = weights.joint_weights.get_mut(vertex_index) else {
            return Err(format!(
                "Skin weights for mesh '{}' vertex {} not found",
                mesh_id, vertex_index
            ));
        };
        *row_weights = joint_weights;
        return Ok(());
    }

    Err(format!("Skin weights for mesh '{}' not found", mesh_id))
}

pub fn set_blendshape_delta(
    world: &mut World,
    name: &str,
    mesh_id: &str,
    vertex_index: usize,
    delta: [f32; 2],
) -> Result<(), String> {
    let mut query = world.query::<&mut BlendShapeSet>();
    for mut shapes in query.iter_mut(world) {
        if shapes.mesh_id != mesh_id {
            continue;
        }
        if let Some(shape) = shapes.shapes.iter_mut().find(|shape| shape.name == name) {
            let Some(vertex_delta) = shape.vertex_deltas.get_mut(vertex_index) else {
                return Err(format!(
                    "BlendShape '{}' vertex {} not found on mesh '{}'",
                    name, vertex_index, mesh_id
                ));
            };
            *vertex_delta = to_vec2(delta);
            return Ok(());
        }
        return Err(format!(
            "BlendShape '{}' not found on mesh '{}'",
            name, mesh_id
        ));
    }

    Err(format!("Native mesh '{}' not found", mesh_id))
}

pub fn upsert_control_driver(world: &mut World, driver: NkpControlDriver) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    validate_runtime_driver(world, root, &driver)?;
    let mapped = map_control_driver(&driver);
    let mut set = world
        .get_mut::<ControlDriverSet>(root)
        .ok_or_else(|| "No ControlDriverSet found".to_string())?;
    if let Some(existing) = set
        .drivers
        .iter_mut()
        .find(|existing| existing.id == mapped.id)
    {
        *existing = mapped;
    } else {
        set.drivers.push(mapped);
    }
    Ok(())
}

pub fn remove_control_driver(world: &mut World, id: &str) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    let mut set = world
        .get_mut::<ControlDriverSet>(root)
        .ok_or_else(|| "No ControlDriverSet found".to_string())?;
    let before = set.drivers.len();
    set.drivers.retain(|driver| driver.id != id);
    if set.drivers.len() == before {
        return Err(format!("ControlDriver '{}' not found", id));
    }
    Ok(())
}

pub fn set_tracking_input(world: &mut World, name: &str, value: f32) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    let mut tracking = world
        .get_mut::<TrackingInputs2D>(root)
        .ok_or_else(|| "No TrackingInputs2D found".to_string())?;
    tracking.values.insert(name.to_string(), value);
    Ok(())
}

pub fn play_animation(world: &mut World, name: &str, loop_anim: bool) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    let clips = world
        .get::<NativeAnimationClips>(root)
        .ok_or_else(|| "No native animation clips found".to_string())?;
    if !clips.clips.iter().any(|clip| clip.name == name) {
        return Err(format!("Native animation clip '{}' not found", name));
    }
    world.entity_mut(root).insert(NativeAnimationPlayback {
        clip_name: name.to_string(),
        elapsed_ms: 0.0,
        playing: true,
        looping: loop_anim,
    });
    Ok(())
}

pub fn stop_animation(world: &mut World) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    if let Some(mut playback) = world.get_mut::<NativeAnimationPlayback>(root) {
        playback.playing = false;
    }
    Ok(())
}

pub fn seek_animation(world: &mut World, time_ms: f32) -> Result<(), String> {
    let root = find_native_root(world).ok_or_else(|| "No native puppet loaded".to_string())?;
    if let Some(mut playback) = world.get_mut::<NativeAnimationPlayback>(root) {
        playback.elapsed_ms = time_ms.max(0.0);
        return Ok(());
    }
    Err("No native animation playback active".to_string())
}

/// Sample a native 2D clip as a future AnimationGraph leaf.
///
/// The returned sample is stateless: graph transitions, blend tree state, and
/// event cursors belong to a graph layer above the clip.
pub fn sample_animation_clip_2d_leaf(
    clip: &AnimationClip2D,
    time_ms: f32,
    looping: bool,
) -> AnimationLeafSample {
    let sample_time = clamp_or_wrap_clip_time(time_ms, clip.duration_ms, looping);
    let mut tracks = Vec::new();

    for track in &clip.bone_tracks {
        if let Some(position) = sample_vec2_keys(&track.position_keys, sample_time) {
            tracks.push(AnimationLeafTrackSample::new(
                AnimationLeafTrackId::new(&track.bone, "position"),
                AnimationLeafValueKind::Vec2,
                position.to_vec(),
            ));
        }
        if let Some(rotation) = sample_scalar_keys(&track.rotation_keys, sample_time) {
            tracks.push(AnimationLeafTrackSample::new(
                AnimationLeafTrackId::new(&track.bone, "rotationZ"),
                AnimationLeafValueKind::Scalar,
                vec![rotation],
            ));
        }
        if let Some(scale) = sample_vec2_keys(&track.scale_keys, sample_time) {
            tracks.push(AnimationLeafTrackSample::new(
                AnimationLeafTrackId::new(&track.bone, "scale"),
                AnimationLeafValueKind::Vec2,
                scale.to_vec(),
            ));
        }
    }
    for track in &clip.blendshape_tracks {
        if let Some(weight) = sample_scalar_keys(&track.weight_keys, sample_time) {
            tracks.push(AnimationLeafTrackSample::new(
                AnimationLeafTrackId::new(&track.blendshape, "blendShapeWeight"),
                AnimationLeafValueKind::Scalar,
                vec![weight],
            ));
        }
    }

    AnimationLeafSample::new(
        AnimationLeafDomain::Puppet2D,
        clip.name.clone(),
        AnimationDuration::from_millis(sample_time),
        AnimationDuration::from_millis(clip.duration_ms.max(0.0)),
        looping,
        tracks,
    )
}

pub fn control_driver_update(world: &mut World) {
    let Some(root) = find_native_root(world) else {
        return;
    };
    let drivers = world
        .get::<ControlDriverSet>(root)
        .map(|driver_set| driver_set.drivers.clone())
        .unwrap_or_default();
    if drivers.is_empty() {
        return;
    }
    let mut drivers = drivers;
    drivers.sort_by(|a, b| a.priority.cmp(&b.priority).then_with(|| a.id.cmp(&b.id)));

    let source_values = collect_driver_source_values(world, root);
    let mut bone_rotation_writes: BTreeMap<String, TargetAccumulator<f32>> = BTreeMap::new();
    let mut bone_position_writes: BTreeMap<String, TargetAccumulator<Vec2>> = BTreeMap::new();
    let mut bone_scale_writes: BTreeMap<String, TargetAccumulator<Vec2>> = BTreeMap::new();
    let mut blendshape_writes: BTreeMap<String, TargetAccumulator<f32>> = BTreeMap::new();

    for driver in &drivers {
        let source_value = match driver.source.source_key() {
            Some(key) => *source_values.get(&key).unwrap_or(&0.0),
            None => 0.0,
        };
        let driven = evaluate_curve(driver.curve, source_value);
        match &driver.target {
            ControlTarget::BoneRotation { bone, axis } => {
                let key = format!("{}:{:?}", bone, axis);
                bone_rotation_writes
                    .entry(key)
                    .or_default()
                    .apply_scalar(driven.to_radians(), driver.blend_mode);
            }
            ControlTarget::BonePosition { bone } => {
                bone_position_writes
                    .entry(bone.clone())
                    .or_default()
                    .apply_vec2(Vec2::splat(driven), driver.blend_mode);
            }
            ControlTarget::BoneScale { bone } => {
                bone_scale_writes
                    .entry(bone.clone())
                    .or_default()
                    .apply_vec2(Vec2::splat(driven), driver.blend_mode);
            }
            ControlTarget::BlendShapeWeight { name } => {
                blendshape_writes
                    .entry(name.clone())
                    .or_default()
                    .apply_scalar(driven, driver.blend_mode);
            }
        }
    }

    let bone_entities = world
        .get::<Skeleton2D>(root)
        .map(|skeleton| {
            skeleton
                .bone_entities
                .iter()
                .filter_map(|entity| {
                    world
                        .get::<Bone2D>(*entity)
                        .map(|bone| (bone.id.clone(), bone.name.clone(), *entity))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for (bone_id, bone_name, entity) in bone_entities {
        if let Some(mut bone) = world.get_mut::<Bone2D>(entity) {
            bone.local_transform = bone.rest_transform.clone();
            let rotation_z_key = format!("{}:{:?}", bone_id, Axis2D::Z);
            let rotation_z_name_key = format!("{}:{:?}", bone_name, Axis2D::Z);
            if let Some(rotation) = bone_rotation_writes
                .get(&rotation_z_key)
                .or_else(|| bone_rotation_writes.get(&rotation_z_name_key))
                .and_then(|acc| acc.value)
            {
                bone.local_transform.rotation = bone.rest_transform.rotation + rotation;
            }
            if let Some(position) = bone_position_writes
                .get(&bone_id)
                .or_else(|| bone_position_writes.get(&bone_name))
                .and_then(|acc| acc.value)
            {
                bone.local_transform.position = bone.rest_transform.position + position;
            }
            if let Some(scale) = bone_scale_writes
                .get(&bone_id)
                .or_else(|| bone_scale_writes.get(&bone_name))
                .and_then(|acc| acc.value)
            {
                bone.local_transform.scale = bone.rest_transform.scale + scale;
            }
        }
    }

    for (shape, accumulator) in blendshape_writes {
        if let Some(weight) = accumulator.value {
            set_blendshape_weight(world, &shape, weight);
        }
    }

    if let Some(skeleton) = world.get::<Skeleton2D>(root) {
        let bone_entities = skeleton.bone_entities.clone();
        propagate_bones(world, &bone_entities);
    }
}

pub fn blendshape_apply(world: &mut World) {
    blendshape_apply_with_config(world, NativeCpuDeformationConfig::default());
}

pub fn blendshape_apply_serial(world: &mut World) {
    blendshape_apply_with_config(world, NativeCpuDeformationConfig::serial());
}

pub fn blendshape_apply_parallel(world: &mut World) {
    blendshape_apply_with_config(world, NativeCpuDeformationConfig::parallel());
}

pub fn blendshape_apply_with_config(world: &mut World, config: NativeCpuDeformationConfig) {
    let updates: Vec<(Entity, Vec<Vec2>)> = {
        let mut query = world.query::<(Entity, &MeshData, &BlendShapeSet, &BlendShapeWeights)>();
        query
            .iter(world)
            .map(|(entity, mesh, shapes, weights)| {
                (
                    entity,
                    apply_pre_skin_blendshapes(&mesh.vertices, shapes, weights, config),
                )
            })
            .collect()
    };

    for (entity, vertices) in updates {
        if let Some(mut morphed) = world.get_mut::<MorphedVertices>(entity) {
            morphed.0 = vertices;
        } else {
            world.entity_mut(entity).insert(MorphedVertices(vertices));
        }
    }
}

pub fn skinning_2d(world: &mut World) {
    skinning_2d_with_config(world, NativeCpuDeformationConfig::default());
}

pub fn skinning_2d_serial(world: &mut World) {
    skinning_2d_with_config(world, NativeCpuDeformationConfig::serial());
}

pub fn skinning_2d_parallel(world: &mut World) {
    skinning_2d_with_config(world, NativeCpuDeformationConfig::parallel());
}

pub fn skinning_2d_with_config(world: &mut World, config: NativeCpuDeformationConfig) {
    let Some(root) = find_native_root(world) else {
        return;
    };
    let Some(skeleton) = world.get::<Skeleton2D>(root).cloned() else {
        return;
    };
    let bone_matrices: Vec<Mat3> = skeleton
        .bone_entities
        .iter()
        .zip(skeleton.inverse_bind_transforms.iter())
        .map(|(entity, inverse_bind)| {
            let global = world
                .get::<Bone2D>(*entity)
                .map(|bone| bone.global_transform)
                .unwrap_or(Mat3::IDENTITY);
            global * *inverse_bind
        })
        .collect();

    let updates: Vec<(Entity, Vec<Vec2>)> = {
        let mut query = world.query::<(
            Entity,
            &MeshData,
            Option<&MorphedVertices>,
            Option<&SkinWeights2D>,
            Option<&BlendShapeSet>,
            Option<&BlendShapeWeights>,
        )>();
        query
            .iter(world)
            .map(|(entity, mesh, morphed, skin_weights, shapes, weights)| {
                let bind_vertices = morphed
                    .map(|vertices| &vertices.0)
                    .unwrap_or(&mesh.vertices);
                let deformed = skin_and_apply_post_skin_blendshapes(
                    bind_vertices,
                    skin_weights,
                    shapes,
                    weights,
                    &bone_matrices,
                    config,
                );
                (entity, deformed)
            })
            .collect()
    };

    for (entity, deformed) in updates {
        if let Some(mut vertices) = world.get_mut::<DeformedVertices>(entity) {
            vertices.0 = deformed;
        } else {
            world.entity_mut(entity).insert(DeformedVertices(deformed));
        }
    }
}

pub fn ik_update(world: &mut World) {
    let constraints: Vec<IkConstraint2D> = {
        let mut query = world.query::<&IkConstraint2D>();
        query.iter(world).cloned().collect()
    };
    for constraint in constraints {
        let target_position = world
            .get::<Bone2D>(constraint.target_entity)
            .map(|bone| transform_point(bone.global_transform, Vec2::ZERO));
        let Some(target_position) = target_position else {
            continue;
        };
        let iterations = match constraint.solver {
            IkSolver2D::TwoBone => 1,
            IkSolver2D::Ccd { max_iterations } => max_iterations.max(1),
        };
        for _ in 0..iterations {
            let chain = collect_parent_chain(world, constraint.end_entity, constraint.chain_length);
            for bone_entity in chain {
                let end_position = world.get::<Bone2D>(constraint.end_entity).map(|bone| {
                    transform_point(bone.global_transform, Vec2::new(bone.length.max(0.0), 0.0))
                });
                let pivot_position = world
                    .get::<Bone2D>(bone_entity)
                    .map(|bone| transform_point(bone.global_transform, Vec2::ZERO));
                let (Some(end_position), Some(pivot_position)) = (end_position, pivot_position)
                else {
                    continue;
                };
                let current = end_position - pivot_position;
                let desired = target_position - pivot_position;
                if current.length_squared() <= EPSILON || desired.length_squared() <= EPSILON {
                    continue;
                }
                let angle_delta = current.perp_dot(desired).atan2(current.dot(desired));
                if let Some(mut bone) = world.get_mut::<Bone2D>(bone_entity) {
                    bone.local_transform.rotation += angle_delta;
                }
                if let Some(root) = find_native_root(world) {
                    if let Some(skeleton) = world.get::<Skeleton2D>(root) {
                        let bone_entities = skeleton.bone_entities.clone();
                        propagate_bones(world, &bone_entities);
                    }
                }
            }
        }
    }
}

pub fn path_constraint_update(world: &mut World) {
    let constraints: Vec<PathConstraint2D> = {
        let mut query = world.query::<&PathConstraint2D>();
        query.iter(world).cloned().collect()
    };
    for constraint in constraints {
        let Some(first_point) = constraint.path.first().copied() else {
            continue;
        };
        if let Some(mut bone) = world.get_mut::<Bone2D>(constraint.bone_entity) {
            let influence = constraint.influence.clamp(0.0, 1.0);
            bone.local_transform.position =
                bone.local_transform.position.lerp(first_point, influence);
        }
    }
    if let Some(root) = find_native_root(world) {
        if let Some(skeleton) = world.get::<Skeleton2D>(root) {
            let bone_entities = skeleton.bone_entities.clone();
            propagate_bones(world, &bone_entities);
        }
    }
}

pub fn spring_bone_update(world: &mut World, delta_ms: f32) {
    let dt = (delta_ms / 1000.0).clamp(0.0, 0.1);
    if dt <= 0.0 {
        return;
    }
    let springs: Vec<(Entity, SpringBone2D, SpringBoneState2D)> = {
        let mut query = world.query::<(Entity, &SpringBone2D, &SpringBoneState2D)>();
        query
            .iter(world)
            .map(|(entity, spring, state)| (entity, spring.clone(), state.clone()))
            .collect()
    };

    for (entity, spring, mut state) in springs {
        if let Some(mut bone) = world.get_mut::<Bone2D>(spring.bone_entity) {
            let rest_delta = bone.rest_transform.position - bone.local_transform.position;
            let force = rest_delta * spring.stiffness
                + Vec2::new(spring.wind_influence, spring.gravity_scale) * 9.81;
            state.velocity = (state.velocity + force * dt) * (1.0 - spring.damping * dt).max(0.0);
            bone.local_transform.position += state.velocity * dt;
        }
        if let Some(mut current_state) = world.get_mut::<SpringBoneState2D>(entity) {
            *current_state = state;
        }
    }

    if let Some(root) = find_native_root(world) {
        if let Some(skeleton) = world.get::<Skeleton2D>(root) {
            let bone_entities = skeleton.bone_entities.clone();
            propagate_bones(world, &bone_entities);
        }
    }
}

pub fn native_runtime_update(world: &mut World, delta_ms: f32) {
    native_animation_update(world, delta_ms);
    control_driver_update(world);
    path_constraint_update(world);
    ik_update(world);
    spring_bone_update(world, delta_ms);
    blendshape_apply(world);
    skinning_2d(world);
}

pub fn is_native_loaded(world: &mut World) -> bool {
    find_native_root(world).is_some()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
struct TargetAccumulator<T> {
    value: Option<T>,
}

impl<T> Default for TargetAccumulator<T> {
    fn default() -> Self {
        Self { value: None }
    }
}

impl TargetAccumulator<f32> {
    fn apply_scalar(&mut self, value: f32, mode: DriverBlendMode) {
        self.value = Some(match (self.value, mode) {
            (Some(current), DriverBlendMode::Add) => current + value,
            (Some(current), DriverBlendMode::Max) => current.max(value),
            (_, DriverBlendMode::Override)
            | (None, DriverBlendMode::Add | DriverBlendMode::Max) => value,
        });
    }
}

impl TargetAccumulator<Vec2> {
    fn apply_vec2(&mut self, value: Vec2, mode: DriverBlendMode) {
        self.value = Some(match (self.value, mode) {
            (Some(current), DriverBlendMode::Add) => current + value,
            (Some(current), DriverBlendMode::Max) => current.max(value),
            (_, DriverBlendMode::Override)
            | (None, DriverBlendMode::Add | DriverBlendMode::Max) => value,
        });
    }
}

impl ControlSource {
    fn source_key(&self) -> Option<String> {
        match self {
            ControlSource::BlendShapeWeight { name } => Some(format!("blendshape:{}", name)),
            ControlSource::ExpressionWeight { preset } => Some(format!("expression:{}", preset)),
            ControlSource::TrackingParam { name } => Some(format!("tracking:{}", name)),
            ControlSource::Live2dParam { name } => Some(format!("live2d:{}", name)),
        }
    }
}

fn find_native_root(world: &mut World) -> Option<Entity> {
    let mut query = world.query_filtered::<Entity, (With<PuppetRoot>, With<NativePuppet>)>();
    query.iter(world).next()
}

fn find_bone_entity(world: &World, skeleton: &Skeleton2D, bone_ref: &str) -> Option<Entity> {
    skeleton.bone_entities.iter().copied().find(|entity| {
        world
            .get::<Bone2D>(*entity)
            .map(|bone| bone.id == bone_ref || bone.name == bone_ref)
            .unwrap_or(false)
    })
}

fn collect_runtime_bone_refs(
    world: &World,
    skeleton: &Skeleton2D,
) -> (BTreeSet<String>, BTreeSet<String>) {
    let mut ids = BTreeSet::new();
    let mut names = BTreeSet::new();
    for entity in &skeleton.bone_entities {
        if let Some(bone) = world.get::<Bone2D>(*entity) {
            ids.insert(bone.id.clone());
            names.insert(bone.name.clone());
        }
    }
    (ids, names)
}

fn ensure_normalized_weights(
    mesh_id: &str,
    vertex_index: usize,
    weights: &[f32; 4],
) -> Result<(), String> {
    let sum: f32 = weights.iter().sum();
    if (sum - 1.0).abs() <= WEIGHT_SUM_TOLERANCE {
        Ok(())
    } else {
        Err(format!(
            "Skin weights for mesh '{}' vertex {} are not normalized",
            mesh_id, vertex_index
        ))
    }
}

fn collect_runtime_shape_names(world: &mut World) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let mut query = world.query::<&BlendShapeSet>();
    for shapes in query.iter(world) {
        for shape in &shapes.shapes {
            names.insert(shape.name.clone());
        }
    }
    names
}

fn collect_runtime_expressions(
    world: &World,
    root: Entity,
) -> BTreeMap<String, BTreeMap<String, f32>> {
    world
        .get::<ExpressionPresets>(root)
        .map(|presets| {
            presets
                .presets
                .iter()
                .map(|preset| {
                    (
                        preset.name.clone(),
                        preset.weights.iter().cloned().collect::<BTreeMap<_, _>>(),
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn validate_runtime_driver(
    world: &mut World,
    root: Entity,
    driver: &NkpControlDriver,
) -> Result<(), String> {
    let skeleton = world
        .get::<Skeleton2D>(root)
        .ok_or_else(|| "No native skeleton loaded".to_string())?;
    let (bone_ids, bone_names) = collect_runtime_bone_refs(world, skeleton);
    let bone_id_refs = bone_ids.iter().map(String::as_str).collect::<BTreeSet<_>>();
    let bone_name_refs = bone_names
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let shape_names = collect_runtime_shape_names(world);
    let shape_refs = shape_names
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();
    let expressions = collect_runtime_expressions(world, root);
    validate_driver(
        driver,
        &bone_id_refs,
        &bone_name_refs,
        &shape_refs,
        &expressions,
    )
}

fn collect_driver_source_values(world: &mut World, root: Entity) -> BTreeMap<String, f32> {
    let mut values = BTreeMap::new();
    let mut query = world.query::<(&BlendShapeSet, &BlendShapeWeights)>();
    for (shapes, weights) in query.iter(world) {
        for (index, shape) in shapes.shapes.iter().enumerate() {
            values.insert(
                format!("blendshape:{}", shape.name),
                weights.weights.get(index).copied().unwrap_or(0.0),
            );
        }
    }
    if let Some(expressions) = world.get::<NativeExpressionWeights>(root) {
        for (name, weight) in &expressions.weights {
            values.insert(format!("expression:{}", name), *weight);
        }
    }
    if let Some(tracking) = world.get::<TrackingInputs2D>(root) {
        for (name, value) in &tracking.values {
            values.insert(format!("tracking:{}", name), *value);
        }
    }
    values
}

fn set_all_blendshape_weights(world: &mut World, weight: f32) {
    let mut query = world.query::<&mut BlendShapeWeights>();
    for mut weights in query.iter_mut(world) {
        for item in &mut weights.weights {
            *item = weight;
        }
    }
}

pub fn set_blendshape_weight(world: &mut World, name: &str, weight: f32) -> bool {
    let mut found = false;
    let mut query = world.query::<(&BlendShapeSet, &mut BlendShapeWeights)>();
    for (shapes, mut weights) in query.iter_mut(world) {
        for (index, shape) in shapes.shapes.iter().enumerate() {
            if shape.name == name {
                if let Some(current) = weights.weights.get_mut(index) {
                    *current = weight.clamp(0.0, 1.0);
                    found = true;
                }
            }
        }
    }
    found
}

fn native_animation_update(world: &mut World, delta_ms: f32) {
    let Some(root) = find_native_root(world) else {
        return;
    };
    let Some(mut playback) = world.get::<NativeAnimationPlayback>(root).cloned() else {
        return;
    };
    let clip = world.get::<NativeAnimationClips>(root).and_then(|clips| {
        clips
            .clips
            .iter()
            .find(|clip| clip.name == playback.clip_name)
            .cloned()
    });
    let Some(clip) = clip else {
        return;
    };

    if playback.playing {
        playback.elapsed_ms = advance_clip_time(
            playback.elapsed_ms,
            delta_ms,
            clip.duration_ms,
            playback.looping,
        );
    }
    let sample_time = playback.elapsed_ms.min(clip.duration_ms.max(0.0));

    for track in &clip.bone_tracks {
        let transform = NkpTransform2DEdit {
            position: sample_vec2_keys(&track.position_keys, sample_time),
            rotation: sample_scalar_keys(&track.rotation_keys, sample_time),
            scale: sample_vec2_keys(&track.scale_keys, sample_time),
        };
        if transform.position.is_some() || transform.rotation.is_some() || transform.scale.is_some()
        {
            if let Err(error) =
                set_bone_transform(world, &track.bone, transform, NkpTransformEditMode::Set)
            {
                tracing::warn!(
                    bone = %track.bone,
                    clip = %clip.name,
                    "Failed to apply native animation bone track: {}",
                    error
                );
            }
        }
    }
    for track in &clip.blendshape_tracks {
        if let Some(weight) = sample_scalar_keys(&track.weight_keys, sample_time) {
            set_blendshape_weight(world, &track.blendshape, weight);
        }
    }
    if let Some(mut current) = world.get_mut::<NativeAnimationPlayback>(root) {
        *current = playback;
    }
}

fn clamp_or_wrap_clip_time(time_ms: f32, duration_ms: f32, looping: bool) -> f32 {
    let duration = duration_ms.max(0.0);
    let time = time_ms.max(0.0);
    if duration <= EPSILON {
        return 0.0;
    }
    if looping {
        time % duration
    } else {
        time.min(duration)
    }
}

fn advance_clip_time(elapsed_ms: f32, delta_ms: f32, duration_ms: f32, looping: bool) -> f32 {
    let duration = duration_ms.max(0.0);
    if duration <= EPSILON {
        return 0.0;
    }
    let next = (elapsed_ms + delta_ms).max(0.0);
    if looping {
        next % duration
    } else {
        next.min(duration)
    }
}

fn sample_scalar_keys(
    keys: &[neko_engine_types::puppet::NkpScalarKeyframe],
    time_ms: f32,
) -> Option<f32> {
    if keys.is_empty() {
        return None;
    }
    if time_ms <= keys[0].time_ms {
        return Some(keys[0].value);
    }
    for pair in keys.windows(2) {
        let left = &pair[0];
        let right = &pair[1];
        if time_ms <= right.time_ms {
            let span = (right.time_ms - left.time_ms).max(EPSILON);
            let t = ((time_ms - left.time_ms) / span).clamp(0.0, 1.0);
            return Some(left.value + (right.value - left.value) * t);
        }
    }
    keys.last().map(|key| key.value)
}

fn sample_vec2_keys(
    keys: &[neko_engine_types::puppet::NkpVec2Keyframe],
    time_ms: f32,
) -> Option<[f32; 2]> {
    if keys.is_empty() {
        return None;
    }
    if time_ms <= keys[0].time_ms {
        return Some(keys[0].value);
    }
    for pair in keys.windows(2) {
        let left = &pair[0];
        let right = &pair[1];
        if time_ms <= right.time_ms {
            let span = (right.time_ms - left.time_ms).max(EPSILON);
            let t = ((time_ms - left.time_ms) / span).clamp(0.0, 1.0);
            let value = to_vec2(left.value).lerp(to_vec2(right.value), t);
            return Some(value.to_array());
        }
    }
    keys.last().map(|key| key.value)
}

fn apply_pre_skin_blendshapes(
    base_vertices: &[Vec2],
    shapes: &BlendShapeSet,
    weights: &BlendShapeWeights,
    config: NativeCpuDeformationConfig,
) -> Vec<Vec2> {
    let active_shapes = active_blendshape_inputs(shapes, weights, false);
    if active_shapes.is_empty() {
        return base_vertices.to_vec();
    }
    if should_use_parallel(base_vertices.len(), config) {
        apply_blendshapes_parallel(base_vertices, &active_shapes, config.chunk_size)
    } else {
        apply_blendshapes_serial(base_vertices, &active_shapes)
    }
}

fn skin_and_apply_post_skin_blendshapes(
    bind_vertices: &[Vec2],
    skin_weights: Option<&SkinWeights2D>,
    shapes: Option<&BlendShapeSet>,
    weights: Option<&BlendShapeWeights>,
    bone_matrices: &[Mat3],
    config: NativeCpuDeformationConfig,
) -> Vec<Vec2> {
    let mut deformed = match skin_weights {
        Some(skin) if should_use_parallel(bind_vertices.len(), config) => {
            skin_vertices_parallel(bind_vertices, skin, bone_matrices, config.chunk_size)
        }
        Some(skin) => skin_vertices_serial(bind_vertices, skin, bone_matrices),
        None => bind_vertices.to_vec(),
    };

    if let (Some(shapes), Some(weights)) = (shapes, weights) {
        let active_shapes = active_blendshape_inputs(shapes, weights, true);
        if !active_shapes.is_empty() {
            deformed = if should_use_parallel(deformed.len(), config) {
                apply_blendshapes_parallel(&deformed, &active_shapes, config.chunk_size)
            } else {
                apply_blendshapes_serial(&deformed, &active_shapes)
            };
        }
    }
    deformed
}

fn active_blendshape_inputs<'a>(
    shapes: &'a BlendShapeSet,
    weights: &'a BlendShapeWeights,
    post_skin: bool,
) -> Vec<(&'a [Vec2], f32)> {
    shapes
        .shapes
        .iter()
        .enumerate()
        .filter_map(|(shape_index, shape)| {
            if shape.post_skin != post_skin {
                return None;
            }
            let weight = weights.weights.get(shape_index).copied().unwrap_or(0.0);
            if weight.abs() <= EPSILON {
                None
            } else {
                Some((shape.vertex_deltas.as_slice(), weight))
            }
        })
        .collect()
}

fn should_use_parallel(vertex_count: usize, config: NativeCpuDeformationConfig) -> bool {
    match config.mode {
        NativeCpuDeformationMode::Serial => false,
        NativeCpuDeformationMode::Parallel => vertex_count > 0,
        NativeCpuDeformationMode::Auto => {
            config.parallel_vertex_threshold != usize::MAX
                && vertex_count >= config.parallel_vertex_threshold
        }
    }
}

fn apply_blendshapes_serial(base_vertices: &[Vec2], active_shapes: &[(&[Vec2], f32)]) -> Vec<Vec2> {
    base_vertices
        .iter()
        .enumerate()
        .map(|(vertex_index, vertex)| {
            let mut output = *vertex;
            for (deltas, weight) in active_shapes {
                if let Some(delta) = deltas.get(vertex_index) {
                    output += *delta * *weight;
                }
            }
            output
        })
        .collect()
}

fn apply_blendshapes_parallel(
    base_vertices: &[Vec2],
    active_shapes: &[(&[Vec2], f32)],
    chunk_size: usize,
) -> Vec<Vec2> {
    let pool = native_cpu_deformation_task_pool();
    let chunk_size = chunk_size.max(1);
    base_vertices
        .par_chunk_map(pool, chunk_size, |chunk_index, chunk| {
            let offset = chunk_index * chunk_size;
            chunk
                .iter()
                .enumerate()
                .map(|(local_index, vertex)| {
                    let vertex_index = offset + local_index;
                    let mut output = *vertex;
                    for (deltas, weight) in active_shapes {
                        if let Some(delta) = deltas.get(vertex_index) {
                            output += *delta * *weight;
                        }
                    }
                    output
                })
                .collect::<Vec<_>>()
        })
        .into_iter()
        .flatten()
        .collect()
}

fn evaluate_curve(curve: DriverCurve, value: f32) -> f32 {
    match curve {
        DriverCurve::Linear { scale, offset } => value * scale + offset,
        DriverCurve::Bezier { points } => {
            let t = value.clamp(0.0, 1.0);
            let inv = 1.0 - t;
            inv.powi(3) * points[0]
                + 3.0 * inv.powi(2) * t * points[1]
                + 3.0 * inv * t.powi(2) * points[2]
                + t.powi(3) * points[3]
        }
        DriverCurve::Step => {
            if value > 0.0 {
                1.0
            } else {
                0.0
            }
        }
    }
}

fn skin_vertices_serial(
    vertices: &[Vec2],
    skin: &SkinWeights2D,
    bone_matrices: &[Mat3],
) -> Vec<Vec2> {
    vertices
        .iter()
        .enumerate()
        .map(|(vertex_index, vertex)| skin_vertex(vertex_index, *vertex, skin, bone_matrices))
        .collect()
}

fn skin_vertices_parallel(
    vertices: &[Vec2],
    skin: &SkinWeights2D,
    bone_matrices: &[Mat3],
    chunk_size: usize,
) -> Vec<Vec2> {
    let pool = native_cpu_deformation_task_pool();
    let chunk_size = chunk_size.max(1);
    vertices
        .par_chunk_map(pool, chunk_size, |chunk_index, chunk| {
            let offset = chunk_index * chunk_size;
            chunk
                .iter()
                .enumerate()
                .map(|(local_index, vertex)| {
                    skin_vertex(offset + local_index, *vertex, skin, bone_matrices)
                })
                .collect::<Vec<_>>()
        })
        .into_iter()
        .flatten()
        .collect()
}

fn native_cpu_deformation_task_pool() -> &'static TaskPool {
    &NATIVE_CPU_DEFORMATION_TASK_POOL
}

fn skin_vertex(
    vertex_index: usize,
    vertex: Vec2,
    skin: &SkinWeights2D,
    bone_matrices: &[Mat3],
) -> Vec2 {
    let Some(indices) = skin.joint_indices.get(vertex_index).copied() else {
        return vertex;
    };
    let Some(weights) = skin.joint_weights.get(vertex_index).copied() else {
        return vertex;
    };
    let mut skinned = Vec2::ZERO;
    for (joint_index, weight) in indices.iter().zip(weights.iter()) {
        if *weight <= EPSILON {
            continue;
        }
        let matrix = bone_matrices
            .get(*joint_index as usize)
            .copied()
            .unwrap_or(Mat3::IDENTITY);
        skinned += transform_point(matrix, vertex) * *weight;
    }
    skinned
}

fn propagate_bones(world: &mut World, bone_entities: &[Entity]) {
    let bone_set: BTreeSet<Entity> = bone_entities.iter().copied().collect();
    let mut children_by_parent: HashMap<Entity, Vec<Entity>> = HashMap::new();
    let mut roots = Vec::new();

    for entity in bone_entities {
        let parent = world
            .get::<hierarchy::Parent>(*entity)
            .map(|parent| parent.0);
        if let Some(parent) = parent {
            if bone_set.contains(&parent) {
                children_by_parent.entry(parent).or_default().push(*entity);
            } else {
                roots.push(*entity);
            }
        } else {
            roots.push(*entity);
        }
    }

    let mut queue: VecDeque<(Entity, Mat3)> = roots
        .into_iter()
        .map(|entity| (entity, Mat3::IDENTITY))
        .collect();
    while let Some((entity, parent_global)) = queue.pop_front() {
        let local = world
            .get::<Bone2D>(entity)
            .map(|bone| transform_matrix(&bone.local_transform))
            .unwrap_or(Mat3::IDENTITY);
        let global = parent_global * local;
        if let Some(mut bone) = world.get_mut::<Bone2D>(entity) {
            bone.global_transform = global;
        }
        if let Some(mut global_transform) = world.get_mut::<GlobalTransform2D>(entity) {
            global_transform.0 = global;
        }
        if let Some(children) = children_by_parent.get(&entity) {
            for child in children {
                queue.push_back((*child, global));
            }
        }
    }
}

fn collect_parent_chain(world: &World, end_entity: Entity, chain_length: u8) -> Vec<Entity> {
    let mut chain = Vec::new();
    let mut current = Some(end_entity);
    while let Some(entity) = current {
        chain.push(entity);
        if chain.len() >= chain_length as usize {
            break;
        }
        current = world
            .get::<hierarchy::Parent>(entity)
            .map(|parent| parent.0);
    }
    chain
}

fn transform_matrix(transform: &Transform2D) -> Mat3 {
    let cos = transform.rotation.cos();
    let sin = transform.rotation.sin();
    Mat3::from_cols(
        Vec3::new(cos * transform.scale.x, sin * transform.scale.x, 0.0),
        Vec3::new(-sin * transform.scale.y, cos * transform.scale.y, 0.0),
        Vec3::new(transform.position.x, transform.position.y, 1.0),
    )
}

fn transform_point(matrix: Mat3, point: Vec2) -> Vec2 {
    let point = matrix * Vec3::new(point.x, point.y, 1.0);
    Vec2::new(point.x, point.y)
}

fn map_control_driver(driver: &NkpControlDriver) -> ControlDriver {
    ControlDriver {
        id: driver.id.clone(),
        source: map_control_source(&driver.source),
        target: map_control_target(&driver.target),
        curve: map_driver_curve(driver.curve.clone()),
        blend_mode: map_driver_blend_mode(driver.blend_mode),
        priority: driver.priority,
    }
}

fn map_control_source(source: &NkpControlSource) -> ControlSource {
    match source {
        NkpControlSource::Blendshape { name } => {
            ControlSource::BlendShapeWeight { name: name.clone() }
        }
        NkpControlSource::Expression { preset } => ControlSource::ExpressionWeight {
            preset: preset.clone(),
        },
        NkpControlSource::Tracking { name } => ControlSource::TrackingParam { name: name.clone() },
        NkpControlSource::Live2dParam { name } => ControlSource::Live2dParam { name: name.clone() },
    }
}

fn map_control_target(target: &NkpControlTarget) -> ControlTarget {
    match target {
        NkpControlTarget::BoneRotation { bone, axis } => ControlTarget::BoneRotation {
            bone: bone.clone(),
            axis: map_axis(*axis),
        },
        NkpControlTarget::BonePosition { bone } => {
            ControlTarget::BonePosition { bone: bone.clone() }
        }
        NkpControlTarget::BoneScale { bone } => ControlTarget::BoneScale { bone: bone.clone() },
        NkpControlTarget::BlendshapeWeight { name } => {
            ControlTarget::BlendShapeWeight { name: name.clone() }
        }
    }
}

fn map_driver_curve(curve: NkpDriverCurve) -> DriverCurve {
    match curve {
        NkpDriverCurve::Linear { scale, offset } => DriverCurve::Linear {
            scale: scale.unwrap_or(1.0),
            offset: offset.unwrap_or(0.0),
        },
        NkpDriverCurve::Bezier { points } => DriverCurve::Bezier { points },
        NkpDriverCurve::Step => DriverCurve::Step,
    }
}

fn map_driver_blend_mode(mode: NkpDriverBlendMode) -> DriverBlendMode {
    match mode {
        NkpDriverBlendMode::Add => DriverBlendMode::Add,
        NkpDriverBlendMode::Override => DriverBlendMode::Override,
        NkpDriverBlendMode::Max => DriverBlendMode::Max,
    }
}

fn map_axis(axis: NkpAxis2D) -> Axis2D {
    match axis {
        NkpAxis2D::X => Axis2D::X,
        NkpAxis2D::Y => Axis2D::Y,
        NkpAxis2D::Z => Axis2D::Z,
    }
}

fn blendshape_source_name(source: &NkpControlSource) -> Option<String> {
    match source {
        NkpControlSource::Blendshape { name } => Some(name.clone()),
        _ => None,
    }
}

fn blendshape_target_name(target: &NkpControlTarget) -> Option<String> {
    match target {
        NkpControlTarget::BlendshapeWeight { name } => Some(name.clone()),
        _ => None,
    }
}

fn to_vec2(value: [f32; 2]) -> Vec2 {
    Vec2::new(value[0], value[1])
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::puppet::{
        NkpAnimationModel, NkpBlendShapeLibrary, NkpImportSourceKind, NkpLayer, NkpLayerMesh,
        NkpPuppetSource, NkpSkeleton2D,
    };

    #[test]
    fn native_project_loads_components_and_computes_vertices() {
        let mut project = fixture_project();
        project.control_drivers = vec![NkpControlDriver {
            id: "driver-jaw".to_string(),
            source: NkpControlSource::Blendshape {
                name: "jawOpen".to_string(),
            },
            target: NkpControlTarget::BoneRotation {
                bone: "bone-head".to_string(),
                axis: NkpAxis2D::Z,
            },
            curve: NkpDriverCurve::Linear {
                scale: Some(90.0),
                offset: None,
            },
            blend_mode: NkpDriverBlendMode::Add,
            priority: 0,
        }];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        set_blendshape_weight(&mut world, "jawOpen", 1.0);
        native_runtime_update(&mut world, 16.0);

        let mut query = world.query::<&DeformedVertices>();
        let vertices = query.iter(&world).next().unwrap();
        assert!(vertices.0[1].x < -0.9);
    }

    #[test]
    fn validation_rejects_unnormalized_skin_weights() {
        let mut project = fixture_project();
        let weights = project.layers[0].skin_weights.as_mut().unwrap();
        weights.joint_weights[0] = [0.5, 0.0, 0.0, 0.0];

        assert!(validate_native_project(&project)
            .unwrap_err()
            .contains("not normalized"));
    }

    #[test]
    fn control_driver_conflicts_are_priority_ordered() {
        let mut project = fixture_project();
        project.blend_shapes.as_mut().unwrap().implemented =
            vec!["jawOpen".to_string(), "smile".to_string()];
        project
            .blend_shapes
            .as_mut()
            .unwrap()
            .shapes
            .push(shape("smile", [[0.0, 0.0], [0.0, 0.0]]));
        project.control_drivers = vec![
            NkpControlDriver {
                id: "low".to_string(),
                source: NkpControlSource::Blendshape {
                    name: "jawOpen".to_string(),
                },
                target: NkpControlTarget::BlendshapeWeight {
                    name: "smile".to_string(),
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(0.25),
                    offset: None,
                },
                blend_mode: NkpDriverBlendMode::Override,
                priority: 0,
            },
            NkpControlDriver {
                id: "high".to_string(),
                source: NkpControlSource::Blendshape {
                    name: "jawOpen".to_string(),
                },
                target: NkpControlTarget::BlendshapeWeight {
                    name: "smile".to_string(),
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(0.75),
                    offset: None,
                },
                blend_mode: NkpDriverBlendMode::Override,
                priority: 10,
            },
        ];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        set_blendshape_weight(&mut world, "jawOpen", 1.0);
        control_driver_update(&mut world);

        let mut query = world.query::<(&BlendShapeSet, &BlendShapeWeights)>();
        let (shapes, weights) = query.iter(&world).next().unwrap();
        let smile_index = shapes
            .shapes
            .iter()
            .position(|shape| shape.name == "smile")
            .unwrap();
        assert!((weights.weights[smile_index] - 0.75).abs() < 1e-6);
    }

    #[test]
    fn blendshape_runs_before_skinning() {
        let mut world = World::new();
        load_native_project(&mut world, &fixture_project()).unwrap();
        rotate_bone(&mut world, "bone-head", std::f32::consts::FRAC_PI_2);
        set_blendshape_weight(&mut world, "jawOpen", 1.0);
        blendshape_apply(&mut world);
        skinning_2d(&mut world);

        let mut query = world.query::<&DeformedVertices>();
        let vertices = query.iter(&world).next().unwrap();
        assert!(vertices.0[1].x < -0.9);
        assert!(vertices.0[1].y > 0.9);
    }

    #[test]
    fn parallel_cpu_deformation_matches_serial_fixture() {
        let mut serial_world = World::new();
        let mut parallel_world = World::new();
        let project = fixture_project();
        load_native_project(&mut serial_world, &project).unwrap();
        load_native_project(&mut parallel_world, &project).unwrap();

        set_blendshape_weight(&mut serial_world, "jawOpen", 1.0);
        set_blendshape_weight(&mut parallel_world, "jawOpen", 1.0);
        blendshape_apply_serial(&mut serial_world);
        skinning_2d_serial(&mut serial_world);
        blendshape_apply_parallel(&mut parallel_world);
        skinning_2d_parallel(&mut parallel_world);

        let (max_error, diagnostic) =
            deformation_max_error(&mut serial_world, &mut parallel_world, 1)
                .expect("vertices comparable");
        assert!(
            max_error <= 1e-5,
            "parallel deformation mismatch: {diagnostic}"
        );
    }

    #[test]
    fn parallel_cpu_deformation_handles_many_shapes_large_delta_fixture() {
        let project = many_shapes_large_delta_project(64, 24);
        let mut serial_world = World::new();
        let mut parallel_world = World::new();
        load_native_project(&mut serial_world, &project).unwrap();
        load_native_project(&mut parallel_world, &project).unwrap();

        for shape_index in 0..24 {
            let weight = if shape_index % 2 == 0 { 1.0 } else { 0.125 };
            let shape_name = format!("shape_{shape_index}");
            set_blendshape_weight(&mut serial_world, &shape_name, weight);
            set_blendshape_weight(&mut parallel_world, &shape_name, weight);
        }
        blendshape_apply_serial(&mut serial_world);
        skinning_2d_serial(&mut serial_world);
        blendshape_apply_parallel(&mut parallel_world);
        skinning_2d_parallel(&mut parallel_world);

        let (max_error, diagnostic) =
            deformation_max_error(&mut serial_world, &mut parallel_world, 24)
                .expect("vertices comparable");
        assert!(
            max_error <= 1e-5,
            "many-shapes large-delta mismatch: {diagnostic}"
        );
    }

    #[test]
    fn auto_deformation_policy_keeps_small_workloads_serial() {
        assert!(!should_use_parallel(
            999,
            NativeCpuDeformationConfig::default()
        ));
        assert!(!should_use_parallel(
            50_000,
            NativeCpuDeformationConfig::default()
        ));
        assert!(should_use_parallel(
            10_000,
            NativeCpuDeformationConfig {
                mode: NativeCpuDeformationMode::Auto,
                parallel_vertex_threshold: 10_000,
                chunk_size: PARALLEL_DEFORMATION_CHUNK_SIZE,
            }
        ));
        assert!(should_use_parallel(
            1,
            NativeCpuDeformationConfig::parallel()
        ));
        assert!(!should_use_parallel(
            usize::MAX,
            NativeCpuDeformationConfig::serial()
        ));
    }

    #[test]
    fn parallel_cpu_deformation_reuses_task_pool() {
        let first = native_cpu_deformation_task_pool() as *const TaskPool;
        let second = native_cpu_deformation_task_pool() as *const TaskPool;

        assert_eq!(first, second);
        assert!(native_cpu_deformation_task_pool().thread_num() > 0);
    }

    #[test]
    fn benchmark_fixture_sizes_and_default_policy_are_explicit() {
        assert_eq!(
            NATIVE_DEFORMATION_BENCHMARK_VERTEX_COUNTS,
            &[1_000, 10_000, 50_000]
        );
        assert_eq!(
            NATIVE_DEFORMATION_DEFAULT_PARALLEL_THRESHOLD,
            PARALLEL_DEFORMATION_VERTEX_THRESHOLD
        );
        let decisions = NATIVE_DEFORMATION_BENCHMARK_VERTEX_COUNTS
            .iter()
            .map(|count| {
                (
                    *count,
                    should_use_parallel(*count, NativeCpuDeformationConfig::default()),
                )
            })
            .collect::<Vec<_>>();

        assert_eq!(
            decisions,
            vec![(1_000, false), (10_000, false), (50_000, false)]
        );
    }

    #[test]
    #[ignore = "prints local timing evidence; run with --ignored --nocapture"]
    fn bench_native_cpu_deformation_serial_vs_parallel() {
        let iterations = 3;
        for vertex_count in NATIVE_DEFORMATION_BENCHMARK_VERTEX_COUNTS {
            let project = many_shapes_large_delta_project(*vertex_count, 24);
            let mut serial_world = loaded_weighted_world(&project, 24);
            let mut parallel_world = loaded_weighted_world(&project, 24);

            let serial = measure_deformation_passes(&mut serial_world, false, iterations);
            let parallel = measure_deformation_passes(&mut parallel_world, true, iterations);
            let speedup = serial.as_secs_f64() / parallel.as_secs_f64().max(f64::EPSILON);
            println!(
                "native_cpu_deformation_benchmark vertices={} shapes=24 iterations={} serial_ms={:.3} parallel_ms={:.3} speedup={:.3}",
                vertex_count,
                iterations,
                serial.as_secs_f64() * 1000.0,
                parallel.as_secs_f64() * 1000.0,
                speedup
            );
        }
    }

    #[test]
    fn path_constraint_moves_bone_toward_path_point() {
        let mut project = fixture_project();
        project.skeleton.as_mut().unwrap().path_constraints =
            vec![neko_engine_types::puppet::NkpPathConstraint2D {
                id: "path-head".to_string(),
                bone: "bone-head".to_string(),
                path: vec![[4.0, 0.0]],
                influence: Some(0.5),
            }];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        path_constraint_update(&mut world);

        let head = find_bone(&mut world, "bone-head");
        assert!((head.local_transform.position.x - 2.0).abs() < 1e-6);
    }

    #[test]
    fn ik_constraint_rotates_chain_toward_target() {
        let mut project = fixture_project();
        let skeleton = project.skeleton.as_mut().unwrap();
        skeleton.bones[1].position = [1.0, 0.0];
        skeleton.bones.push(neko_engine_types::puppet::NkpBone2D {
            id: "bone-target".to_string(),
            name: "target".to_string(),
            parent: None,
            position: [0.0, 1.0],
            rotation: Some(0.0),
            scale: None,
            length: Some(0.0),
        });
        skeleton.ik_constraints = vec![neko_engine_types::puppet::NkpIkConstraint2D {
            id: "ik-head".to_string(),
            target_bone: "bone-target".to_string(),
            end_bone: "bone-head".to_string(),
            chain_length: 1,
            solver: neko_engine_types::puppet::NkpIkSolver2D::Ccd {
                max_iterations: Some(1),
            },
        }];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        ik_update(&mut world);

        let head = find_bone(&mut world, "bone-head");
        assert!(head.local_transform.rotation > 1.5);
    }

    #[test]
    fn spring_bone_updates_state_deterministically() {
        let mut project = fixture_project();
        project.skeleton.as_mut().unwrap().spring_bones =
            vec![neko_engine_types::puppet::NkpSpringBone2D {
                id: "spring-head".to_string(),
                bone: "bone-head".to_string(),
                stiffness: 0.5,
                damping: 0.0,
                gravity_scale: Some(1.0),
                wind_influence: Some(0.0),
            }];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        spring_bone_update(&mut world, 100.0);

        let head = find_bone(&mut world, "bone-head");
        assert!(head.local_transform.position.y > 0.0);
    }

    #[test]
    fn validation_rejects_bad_blendshape_delta_count() {
        let mut project = fixture_project();
        project.blend_shapes.as_mut().unwrap().shapes[0]
            .vertex_deltas
            .pop();

        assert!(validate_native_project(&project)
            .unwrap_err()
            .contains("delta count"));
    }

    #[test]
    fn validation_rejects_driver_cycles() {
        let mut project = fixture_project();
        project.blend_shapes.as_mut().unwrap().implemented = vec!["a".to_string(), "b".to_string()];
        project.blend_shapes.as_mut().unwrap().shapes = vec![
            shape("a", [[0.0, 0.0], [0.0, 0.0]]),
            shape("b", [[0.0, 0.0], [0.0, 0.0]]),
        ];
        project.control_drivers = vec![
            NkpControlDriver {
                id: "a-to-b".to_string(),
                source: NkpControlSource::Blendshape {
                    name: "a".to_string(),
                },
                target: NkpControlTarget::BlendshapeWeight {
                    name: "b".to_string(),
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(1.0),
                    offset: None,
                },
                blend_mode: NkpDriverBlendMode::Override,
                priority: 0,
            },
            NkpControlDriver {
                id: "b-to-a".to_string(),
                source: NkpControlSource::Blendshape {
                    name: "b".to_string(),
                },
                target: NkpControlTarget::BlendshapeWeight {
                    name: "a".to_string(),
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(1.0),
                    offset: None,
                },
                blend_mode: NkpDriverBlendMode::Override,
                priority: 1,
            },
        ];

        assert!(validate_native_project(&project)
            .unwrap_err()
            .contains("cycle"));
    }

    #[test]
    fn missing_standard_blendshape_weight_is_ignored() {
        let mut world = World::new();
        load_native_project(&mut world, &fixture_project()).unwrap();

        assert!(!set_blendshape_weight(&mut world, "eyeBlinkLeft", 1.0));
        native_runtime_update(&mut world, 16.0);
    }

    #[test]
    fn native_mutation_edits_bone_weight_shape_driver_and_expression() {
        let mut project = fixture_project();
        project.expressions = BTreeMap::from([(
            "happy".to_string(),
            BTreeMap::from([("jawOpen".to_string(), 0.4)]),
        )]);

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();

        set_bone_transform(
            &mut world,
            "bone-head",
            NkpTransform2DEdit {
                position: Some([2.0, 0.0]),
                rotation: Some(90.0),
                scale: None,
            },
            NkpTransformEditMode::Set,
        )
        .unwrap();
        assert!(
            (find_bone(&mut world, "bone-head").local_transform.rotation
                - std::f32::consts::FRAC_PI_2)
                .abs()
                < 1e-6
        );

        set_skin_weight(
            &mut world,
            "mesh-face",
            1,
            [1, 0, 0, 0],
            [1.0, 0.0, 0.0, 0.0],
        )
        .unwrap();
        set_blendshape_delta(&mut world, "jawOpen", "mesh-face", 1, [0.0, 2.0]).unwrap();
        apply_expression_preset(&mut world, "happy").unwrap();
        native_runtime_update(&mut world, 16.0);

        let mut skin_query = world.query::<&SkinWeights2D>();
        let skin = skin_query.iter(&world).next().unwrap();
        assert_eq!(skin.joint_indices[1], [1, 0, 0, 0]);

        let mut shape_query = world.query::<(&BlendShapeSet, &BlendShapeWeights)>();
        let (shapes, weights) = shape_query.iter(&world).next().unwrap();
        let jaw = shapes
            .shapes
            .iter()
            .position(|shape| shape.name == "jawOpen")
            .unwrap();
        assert!((weights.weights[jaw] - 0.4).abs() < 1e-6);

        let mut vertices = world.query::<&DeformedVertices>();
        let deformed = vertices.iter(&world).next().unwrap();
        assert!(deformed.0[1].x > 1.0);
        assert!(deformed.0[1].y > 0.9);
    }

    #[test]
    fn native_animation_tracks_drive_bone_and_blendshape() {
        let mut project = fixture_project();
        project.animations = vec![AnimationClip2D {
            name: "nod".to_string(),
            duration_ms: 100.0,
            bone_tracks: vec![neko_engine_types::puppet::NkpBoneTrack {
                bone: "bone-head".to_string(),
                position_keys: vec![],
                rotation_keys: vec![
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 0.0,
                        value: 0.0,
                        easing: None,
                    },
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 100.0,
                        value: 90.0,
                        easing: None,
                    },
                ],
                scale_keys: vec![],
            }],
            blendshape_tracks: vec![neko_engine_types::puppet::NkpBlendShapeTrack {
                blendshape: "jawOpen".to_string(),
                weight_keys: vec![
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 0.0,
                        value: 0.0,
                        easing: None,
                    },
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 100.0,
                        value: 1.0,
                        easing: None,
                    },
                ],
            }],
        }];

        let mut world = World::new();
        load_native_project(&mut world, &project).unwrap();
        play_animation(&mut world, "nod", false).unwrap();
        native_runtime_update(&mut world, 50.0);

        let head = find_bone(&mut world, "bone-head");
        assert!((head.local_transform.rotation - std::f32::consts::FRAC_PI_4).abs() < 1e-5);
        let mut query = world.query::<(&BlendShapeSet, &BlendShapeWeights)>();
        let (shapes, weights) = query.iter(&world).next().unwrap();
        let jaw = shapes
            .shapes
            .iter()
            .position(|shape| shape.name == "jawOpen")
            .unwrap();
        assert!((weights.weights[jaw] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn animation_clip_2d_samples_as_graph_leaf_without_graph_state() {
        let clip = AnimationClip2D {
            name: "leaf".to_string(),
            duration_ms: 1000.0,
            bone_tracks: vec![neko_engine_types::puppet::NkpBoneTrack {
                bone: "bone-head".to_string(),
                position_keys: vec![neko_engine_types::puppet::NkpVec2Keyframe {
                    time_ms: 0.0,
                    value: [0.0, 0.0],
                    easing: None,
                }],
                rotation_keys: vec![
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 0.0,
                        value: 0.0,
                        easing: None,
                    },
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 1000.0,
                        value: 90.0,
                        easing: None,
                    },
                ],
                scale_keys: vec![],
            }],
            blendshape_tracks: vec![neko_engine_types::puppet::NkpBlendShapeTrack {
                blendshape: "jawOpen".to_string(),
                weight_keys: vec![
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 0.0,
                        value: 0.0,
                        easing: None,
                    },
                    neko_engine_types::puppet::NkpScalarKeyframe {
                        time_ms: 1000.0,
                        value: 1.0,
                        easing: None,
                    },
                ],
            }],
        };

        let sample = sample_animation_clip_2d_leaf(&clip, 500.0, false);
        let json = serde_json::to_string(&sample).unwrap();
        let restored: AnimationLeafSample = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.domain, AnimationLeafDomain::Puppet2D);
        assert_eq!(restored.clip_name, "leaf");
        assert_eq!(restored.sample_time.as_millis(), 500.0);
        assert_eq!(restored.tracks.len(), 3);
        assert!(restored.tracks.iter().any(|track| {
            track.track_id.target == "bone-head"
                && track.track_id.property == "rotationZ"
                && track.values == vec![45.0]
        }));
        assert!(restored.tracks.iter().any(|track| {
            track.track_id.target == "jawOpen"
                && track.track_id.property == "blendShapeWeight"
                && track.values == vec![0.5]
        }));
    }

    fn fixture_project() -> NkpProjectData {
        NkpProjectData {
            version: "2.0".to_string(),
            name: "Native Fixture".to_string(),
            puppet: NkpPuppetSource {
                src: None,
                format: Some(neko_engine_types::puppet::PuppetFormat::Native),
                animation_model: Some(NkpAnimationModel::BoneBlendshape),
                import_source: Some(neko_engine_types::puppet::NkpImportSource {
                    kind: NkpImportSourceKind::Generated,
                    path: None,
                    content_hash: None,
                    metadata: None,
                }),
                bundle: None,
            },
            layers: vec![NkpLayer {
                id: "layer-face".to_string(),
                name: Some("Face".to_string()),
                texture_ref: "textures/face.png".to_string(),
                mesh: NkpLayerMesh {
                    id: "mesh-face".to_string(),
                    vertices: vec![[0.0, 0.0], [1.0, 0.0]],
                    uvs: vec![],
                    triangles: vec![],
                },
                blend_mode: None,
                opacity: None,
                z_order: None,
                skin_weights: Some(neko_engine_types::puppet::NkpSkinWeights2D {
                    mesh_id: "mesh-face".to_string(),
                    joint_indices: vec![[0, 0, 0, 0], [1, 0, 0, 0]],
                    joint_weights: vec![[1.0, 0.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]],
                }),
            }],
            skeleton: Some(NkpSkeleton2D {
                bones: vec![
                    neko_engine_types::puppet::NkpBone2D {
                        id: "bone-root".to_string(),
                        name: "root".to_string(),
                        parent: None,
                        position: [0.0, 0.0],
                        rotation: Some(0.0),
                        scale: None,
                        length: Some(1.0),
                    },
                    neko_engine_types::puppet::NkpBone2D {
                        id: "bone-head".to_string(),
                        name: "head".to_string(),
                        parent: Some("bone-root".to_string()),
                        position: [0.0, 0.0],
                        rotation: Some(0.0),
                        scale: None,
                        length: Some(1.0),
                    },
                ],
                ik_constraints: vec![],
                path_constraints: vec![],
                spring_bones: vec![],
            }),
            blend_shapes: Some(NkpBlendShapeLibrary {
                standard: None,
                implemented: vec!["jawOpen".to_string()],
                shapes: vec![shape("jawOpen", [[0.0, 0.0], [0.0, 1.0]])],
                custom: vec![],
                aliases: BTreeMap::new(),
            }),
            control_drivers: vec![],
            expressions: BTreeMap::new(),
            animations: vec![],
            auto_rig: None,
            parameters: BTreeMap::new(),
            face_parameters: BTreeMap::new(),
            viewport: neko_engine_types::puppet::NkpViewportState { zoom: 1.0 },
        }
    }

    fn many_shapes_large_delta_project(vertex_count: usize, shape_count: usize) -> NkpProjectData {
        let mut project = fixture_project();
        let vertices = (0..vertex_count)
            .map(|index| [index as f32, (index % 7) as f32])
            .collect::<Vec<_>>();
        project.layers[0].mesh.vertices = vertices;
        project.layers[0].skin_weights = Some(neko_engine_types::puppet::NkpSkinWeights2D {
            mesh_id: "mesh-face".to_string(),
            joint_indices: vec![[0, 0, 0, 0]; vertex_count],
            joint_weights: vec![[1.0, 0.0, 0.0, 0.0]; vertex_count],
        });
        let shapes = (0..shape_count)
            .map(|shape_index| {
                let deltas = (0..vertex_count)
                    .map(|vertex_index| {
                        [
                            shape_index as f32 * 100.0 + vertex_index as f32 * 0.5,
                            -(shape_index as f32) * 75.0 + vertex_index as f32 * 0.25,
                        ]
                    })
                    .collect::<Vec<_>>();
                shape_for_mesh(&format!("shape_{shape_index}"), deltas)
            })
            .collect::<Vec<_>>();
        project.blend_shapes = Some(NkpBlendShapeLibrary {
            standard: None,
            implemented: (0..shape_count)
                .map(|shape_index| format!("shape_{shape_index}"))
                .collect(),
            shapes,
            custom: vec![],
            aliases: BTreeMap::new(),
        });
        project
    }

    fn loaded_weighted_world(project: &NkpProjectData, shape_count: usize) -> World {
        let mut world = World::new();
        load_native_project(&mut world, project).unwrap();
        for shape_index in 0..shape_count {
            let weight = if shape_index % 2 == 0 { 1.0 } else { 0.125 };
            let shape_name = format!("shape_{shape_index}");
            set_blendshape_weight(&mut world, &shape_name, weight);
        }
        world
    }

    fn measure_deformation_passes(
        world: &mut World,
        parallel: bool,
        iterations: usize,
    ) -> std::time::Duration {
        let started = std::time::Instant::now();
        for _ in 0..iterations {
            if parallel {
                blendshape_apply_parallel(world);
                skinning_2d_parallel(world);
            } else {
                blendshape_apply_serial(world);
                skinning_2d_serial(world);
            }
        }
        started.elapsed()
    }

    fn deformation_max_error(
        left_world: &mut World,
        right_world: &mut World,
        active_shape_count: usize,
    ) -> Result<(f32, String), String> {
        let mut left_query = left_world.query::<(&PuppetNodeId, &DeformedVertices)>();
        let mut right_query = right_world.query::<(&PuppetNodeId, &DeformedVertices)>();
        let left_vertices = left_query
            .iter(&left_world)
            .map(|(id, vertices)| (id.0.clone(), vertices.0.clone()))
            .collect::<BTreeMap<_, _>>();
        let right_vertices = right_query
            .iter(&right_world)
            .map(|(id, vertices)| (id.0.clone(), vertices.0.clone()))
            .collect::<BTreeMap<_, _>>();

        let mut max_error = 0.0;
        let mut diagnostic =
            format!("mesh=<none> vertex=<none> activeShapes={active_shape_count} stage=cpu-parity");
        for (mesh_id, left_mesh) in &left_vertices {
            let right_mesh = right_vertices
                .get(mesh_id)
                .ok_or_else(|| format!("missing right mesh {mesh_id}"))?;
            if left_mesh.len() != right_mesh.len() {
                return Err(format!(
                    "mesh {mesh_id} vertex count mismatch: {} vs {}",
                    left_mesh.len(),
                    right_mesh.len()
                ));
            }
            for (vertex_index, (left_vertex, right_vertex)) in
                left_mesh.iter().zip(right_mesh.iter()).enumerate()
            {
                let error = (left_vertex.x - right_vertex.x)
                    .abs()
                    .max((left_vertex.y - right_vertex.y).abs());
                if error > max_error {
                    max_error = error;
                    diagnostic = format!(
                        "mesh={mesh_id} vertex={vertex_index} activeShapes={active_shape_count} maxError={error} stage=cpu-parity"
                    );
                }
            }
        }
        Ok((max_error, diagnostic))
    }

    fn shape(name: &str, deltas: [[f32; 2]; 2]) -> NkpBlendShapeDef {
        shape_for_mesh(name, deltas.to_vec())
    }

    fn shape_for_mesh(name: &str, deltas: Vec<[f32; 2]>) -> NkpBlendShapeDef {
        NkpBlendShapeDef {
            id: Some(format!("shape-{}", name)),
            name: name.to_string(),
            mesh_id: "mesh-face".to_string(),
            vertex_deltas: deltas,
            post_skin: None,
        }
    }

    fn find_bone(world: &mut World, id: &str) -> Bone2D {
        let mut query = world.query::<&Bone2D>();
        query
            .iter(world)
            .find(|bone| bone.id == id)
            .cloned()
            .unwrap()
    }

    fn rotate_bone(world: &mut World, id: &str, radians: f32) {
        let (entity, bone_entities) = {
            let mut bone_query = world.query::<(Entity, &Bone2D)>();
            let entity = bone_query
                .iter(world)
                .find(|(_, bone)| bone.id == id)
                .map(|(entity, _)| entity)
                .unwrap();
            let root = find_native_root(world).unwrap();
            let bone_entities = world.get::<Skeleton2D>(root).unwrap().bone_entities.clone();
            (entity, bone_entities)
        };
        world
            .get_mut::<Bone2D>(entity)
            .unwrap()
            .local_transform
            .rotation = radians;
        propagate_bones(world, &bone_entities);
    }
}
