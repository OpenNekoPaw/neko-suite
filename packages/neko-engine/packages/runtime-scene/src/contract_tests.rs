use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneContractFixture {
    snapshot: SceneSnapshotFixture,
    delta: SceneDeltaFixture,
    delta_with_omitted_fields: SceneDeltaFixture,
    render_frame_meta: RenderFrameMetaFixture,
    character: LayeredCharacterDescriptionFixture,
    character_command_envelope: SceneCommandEnvelopeFixture,
    node_remove_envelope: SceneCommandEnvelopeFixture,
    viewport_descriptor: ViewportDescriptorFixture,
    render_stream_descriptor: RenderStreamDescriptorFixture,
    selection_query: SelectionQueryFixture,
    selection_query_result: SelectionQueryResultFixture,
    modeling_session: ModelingSessionContractFixture,
    vertex_brush_patch: VertexBrushPatchFixture,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneSnapshotFixture {
    revision: u64,
    nodes: Vec<SceneNodeFixture>,
    environment: Option<EnvironmentPatchFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneNodeFixture {
    node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneDeltaFixture {
    revision: u64,
    applied_seq: Option<u64>,
    updated_transforms: Option<Vec<TransformPatchFixture>>,
    updated_morph_weights: Option<Vec<MorphWeightsPatchFixture>>,
    updated_materials: Option<Vec<MaterialPatchFixture>>,
    updated_asset_references: Option<Vec<AssetReferencePatchFixture>>,
    updated_lights: Option<Vec<LightPatchFixture>>,
    updated_cameras: Option<Vec<CameraPatchFixture>>,
    topology_changes: Option<Vec<TopologyChangeFixture>>,
    modeling_sessions: Option<Vec<ModelingSessionFixture>>,
    overlay: Option<ViewportOverlayFixture>,
    updated_character_morph_weights: Option<Vec<CharacterMorphWeightsPatchFixture>>,
    updated_character_materials: Option<Vec<CharacterMaterialPatchFixture>>,
    updated_skeleton_pose: Option<Vec<CharacterSkeletonPosePatchFixture>>,
    character_overrides: Option<Vec<CharacterOverridePatchFixture>>,
    environment: Option<EnvironmentPatchFixture>,
    selected_targets: Option<Vec<SelectionTargetFixture>>,
    environment_diagnostics: Option<Vec<EnvironmentDiagnosticFixture>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransformPatchFixture {
    node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MorphWeightsPatchFixture {
    node_id: String,
    weights: Vec<MorphWeightEntryFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MorphWeightEntryFixture {
    name: String,
    weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaterialPatchFixture {
    material_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetReferencePatchFixture {
    node_id: String,
    textures: Option<Vec<AssetHandleFixture>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetHandleFixture {
    id: String,
    uri: Option<String>,
    kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LightPatchFixture {
    node_id: Option<String>,
    kind: String,
    shadow: Option<LightShadowPatchFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LightShadowPatchFixture {
    enabled: bool,
    resolution: Option<u32>,
    bias: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentPatchFixture {
    environment_id: String,
    source: Option<AssetHandleFixture>,
    mode: String,
    rotation_deg: f32,
    intensity: f32,
    exposure: f32,
    visible_as_background: bool,
    background_color: Option<Vec4Fixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentDiagnosticFixture {
    code: String,
    severity: String,
    message: String,
    retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Vec4Fixture {
    x: f32,
    y: f32,
    z: f32,
    w: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectionHitFixture {
    world_position: Vec3Fixture,
    world_normal: Option<Vec3Fixture>,
    depth: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectionTargetFixture {
    kind: String,
    node_id: Option<String>,
    character_id: Option<String>,
    material_slot_id: Option<String>,
    submesh_id: Option<String>,
    region_id: Option<String>,
    hit: Option<SelectionHitFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Vec3Fixture {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CameraPatchFixture {
    camera_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopologyChangeFixture {
    operation: String,
    migration_results: Option<Vec<TopologyMigrationResultFixture>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopologyMigrationResultFixture {
    data_kind: String,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingSessionFixture {
    session_id: String,
    pending_migrations: Vec<String>,
    mesh_id: Option<String>,
    op_log: Option<Vec<ModelingOperationLogEntryFixture>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingOperationLogEntryFixture {
    seq: u64,
    operation: String,
    topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportOverlayFixture {
    viewport_id: String,
    selected_targets: Option<Vec<SelectionTargetFixture>>,
    hovered_target: Option<SelectionTargetFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameMetaFixture {
    stream_id: String,
    #[serde(default)]
    scene_id: Option<String>,
    viewport_id: String,
    frame_id: u64,
    duration_us: u64,
    scene_revision: u64,
    applied_seq: u64,
    frame_timestamp: f64,
    view_transform: [f64; 6],
    #[serde(default)]
    projection_json: Option<String>,
    #[serde(default)]
    active_preview_mode: Option<String>,
    #[serde(default)]
    preview_playback_clock_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayeredCharacterDescriptionFixture {
    descriptor: CharacterDescriptorFixture,
    topology_version: u64,
    definition: CharacterDefinitionFixture,
    geometry: CharacterGeometryFixture,
    material_slots: Vec<MaterialSlotFixture>,
    override_layer: CharacterOverrideLayerFixture,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterDefinitionFixture {
    region_descriptors: Option<CharacterRegionDescriptorSetFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterRegionDescriptorSetFixture {
    schema_version: u32,
    regions: Vec<CharacterRegionDescriptorFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterRegionDescriptorFixture {
    region_id: String,
    display_name: String,
    schema_version: u32,
    bindings: Vec<CharacterRegionBindingFixture>,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterRegionBindingFixture {
    kind: String,
    target_id: String,
    weight: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterDescriptorFixture {
    character_id: String,
    schema_version: u32,
    feature_flags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterGeometryFixture {
    data_blocks: Vec<CharacterDataBlockRefFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterDataBlockRefFixture {
    block_id: String,
    kind: String,
    uri: String,
    checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaterialSlotFixture {
    slot_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterOverrideLayerFixture {
    overrides: Vec<CharacterOverrideEntryFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterOverrideEntryFixture {
    path: String,
    value_type: String,
    value_json: String,
    operation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterMorphWeightsPatchFixture {
    character_id: String,
    weights: Vec<MorphWeightEntryFixture>,
    topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterMaterialPatchFixture {
    character_id: String,
    slot_id: String,
    params_json: String,
    topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterSkeletonPosePatchFixture {
    character_id: String,
    bone_id: String,
    topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterOverridePatchFixture {
    character_id: String,
    overrides: Vec<CharacterOverrideEntryFixture>,
    topology_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneCommandEnvelopeFixture {
    seq: u64,
    base_revision: u64,
    coalesce_key: Option<String>,
    command: SceneCommandFixture,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneCommandFixture {
    #[serde(rename = "type")]
    command_type: String,
    payload_json: Option<String>,
    character_command: Option<CharacterCommandFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportDescriptorFixture {
    viewport_id: String,
    scene_id: String,
    render_mode: String,
    debug_view: Option<String>,
    lookdev: Option<ViewportLookDevSettingsFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderStreamDescriptorFixture {
    stream_id: String,
    viewport_id: String,
    render_mode: Option<String>,
    debug_view: Option<String>,
    lookdev: Option<ViewportLookDevSettingsFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportLookDevSettingsFixture {
    render_mode: String,
    material_override: Option<ViewportMaterialOverrideFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportMaterialOverrideFixture {
    kind: String,
    roughness: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectionQueryFixture {
    viewport_id: String,
    mask: Vec<String>,
    mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectionQueryResultFixture {
    viewport_id: String,
    revision: u64,
    candidates: Vec<SelectionTargetFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCommandFixture {
    #[serde(rename = "type")]
    command_type: String,
    character_id: String,
    topology_version: Option<u64>,
    morph_set: Option<CharacterMorphSetCommandFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterMorphSetCommandFixture {
    morph_id: String,
    weight: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingSessionContractFixture {
    session_id: String,
    mesh_id: String,
    topology_mutable: bool,
    topology_version: u64,
    before_hash: String,
    affected_flags: Vec<String>,
    op_log: Vec<ModelingOperationLogEntryFixture>,
    state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VertexBrushPatchFixture {
    session_id: String,
    mesh_id: String,
    topology_version: u64,
    stroke_id: String,
    seq: u64,
    encoding: String,
    sparse_indices: Vec<u32>,
    payload: Vec<u8>,
}

fn fixture() -> SceneContractFixture {
    let json =
        include_str!("../../../../neko-types/src/generated/__fixtures__/scene-contract-v1.json");
    serde_json::from_str(json).expect("scene contract fixture should deserialize")
}

#[test]
fn scene_contract_fixture_roundtrips_snapshot_and_delta() {
    let fixture = fixture();
    let encoded = serde_json::to_string(&fixture.delta).expect("delta should serialize");
    let roundtripped: SceneDeltaFixture =
        serde_json::from_str(&encoded).expect("delta should deserialize");

    assert_eq!(fixture.snapshot.revision, 40);
    assert_eq!(fixture.snapshot.nodes[0].node_id, "node-root");
    assert_eq!(roundtripped.revision, 41);
    assert_eq!(roundtripped.applied_seq, Some(7));
    assert_eq!(
        roundtripped.updated_transforms.unwrap()[0].node_id,
        "node-mesh"
    );
    assert_eq!(
        roundtripped.updated_morph_weights.unwrap()[0].weights[0].name,
        "Smile"
    );
    assert_eq!(
        roundtripped.updated_materials.unwrap()[0].material_id,
        "mat-main"
    );
    assert!(roundtripped.updated_asset_references.unwrap()[0]
        .textures
        .is_none());
    let updated_lights = roundtripped.updated_lights.as_ref().unwrap();
    assert_eq!(updated_lights[0].kind, "directional");
    assert_eq!(
        updated_lights[0].shadow.as_ref().unwrap().resolution,
        Some(2048)
    );
    assert_eq!(
        roundtripped.updated_cameras.unwrap()[0].camera_id,
        "camera-editor"
    );
    let topology_changes = roundtripped.topology_changes.as_ref().unwrap();
    assert_eq!(topology_changes[0].operation, "subdivide");
    assert_eq!(
        topology_changes[0].migration_results.as_ref().unwrap()[1].status,
        "invalidated"
    );
    assert_eq!(
        roundtripped.modeling_sessions.unwrap()[0].pending_migrations,
        vec!["morph-retarget".to_string(), "skin-retarget".to_string()]
    );
    assert_eq!(
        roundtripped.updated_character_morph_weights.unwrap()[0].character_id,
        "character-a"
    );
    assert_eq!(
        roundtripped.updated_character_materials.unwrap()[0].slot_id,
        "skin"
    );
    assert_eq!(
        roundtripped.updated_skeleton_pose.unwrap()[0].bone_id,
        "head"
    );
    assert_eq!(
        roundtripped.character_overrides.unwrap()[0].overrides[0].operation,
        "set"
    );
    let overlay = roundtripped.overlay.as_ref().unwrap();
    assert_eq!(overlay.viewport_id, "viewport-main");
    assert_eq!(
        overlay.selected_targets.as_ref().unwrap()[0].kind,
        "materialSlot"
    );
    assert_eq!(overlay.hovered_target.as_ref().unwrap().kind, "submesh");
    assert_eq!(
        roundtripped.environment.as_ref().unwrap().mode,
        "background-and-ibl"
    );
    assert_eq!(
        roundtripped.selected_targets.as_ref().unwrap()[0].kind,
        "characterRegion"
    );
    assert_eq!(
        roundtripped.environment_diagnostics.as_ref().unwrap()[0].code,
        "environment.loadPending"
    );
}

#[test]
fn scene_contract_fixture_preserves_omitted_patch_fields() {
    let fixture = fixture();

    assert_eq!(fixture.delta_with_omitted_fields.revision, 42);
    assert!(fixture
        .delta_with_omitted_fields
        .updated_transforms
        .is_none());
    assert!(fixture
        .delta_with_omitted_fields
        .updated_materials
        .is_none());
    assert!(fixture.delta_with_omitted_fields.overlay.is_none());
}

#[test]
fn scene_contract_fixture_roundtrips_render_frame_meta() {
    let fixture = fixture();
    let encoded =
        serde_json::to_string(&fixture.render_frame_meta).expect("frame meta should serialize");
    let roundtripped: RenderFrameMetaFixture =
        serde_json::from_str(&encoded).expect("frame meta should deserialize");

    assert_eq!(roundtripped.stream_id, "stream-main");
    assert_eq!(roundtripped.viewport_id, "viewport-main");
    assert_eq!(roundtripped.frame_id, 1001);
    assert_eq!(roundtripped.duration_us, 16666);
    assert_eq!(roundtripped.scene_revision, 41);
    assert_eq!(roundtripped.applied_seq, 7);
    assert_eq!(roundtripped.scene_id.as_deref(), Some("scene-main"));
    assert_eq!(roundtripped.frame_timestamp, 1770000000048.0);
    assert_eq!(roundtripped.view_transform, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    assert!(roundtripped
        .projection_json
        .as_deref()
        .unwrap_or_default()
        .contains("perspective"));
    assert_eq!(roundtripped.active_preview_mode.as_deref(), Some("motion"));
    assert_eq!(roundtripped.preview_playback_clock_ms, Some(1234.0));
}

#[test]
fn scene_contract_fixture_roundtrips_lookdev_and_selection_contracts() {
    let fixture = fixture();

    assert_eq!(fixture.viewport_descriptor.render_mode, "clay");
    assert_eq!(
        fixture
            .viewport_descriptor
            .lookdev
            .as_ref()
            .unwrap()
            .material_override
            .as_ref()
            .unwrap()
            .kind,
        "clay"
    );
    assert_eq!(
        fixture.render_stream_descriptor.render_mode.as_deref(),
        Some("clay")
    );
    assert_eq!(
        fixture
            .render_stream_descriptor
            .lookdev
            .as_ref()
            .unwrap()
            .material_override
            .as_ref()
            .unwrap()
            .kind,
        "clay"
    );
    assert!(fixture
        .selection_query
        .mask
        .contains(&"characterRegion".to_string()));
    assert_eq!(fixture.selection_query.mode.as_deref(), Some("replace"));
    assert_eq!(fixture.selection_query_result.revision, 41);
    assert_eq!(
        fixture.selection_query_result.candidates[0].kind,
        "materialSlot"
    );
    assert_eq!(
        fixture.selection_query_result.candidates[1].kind,
        "characterRegion"
    );
}

#[test]
fn scene_contract_fixture_roundtrips_character_authoring_contracts() {
    let fixture = fixture();
    let encoded = serde_json::to_string(&fixture.character).expect("character should serialize");
    let roundtripped: LayeredCharacterDescriptionFixture =
        serde_json::from_str(&encoded).expect("character should deserialize");

    assert_eq!(roundtripped.descriptor.character_id, "character-a");
    assert_eq!(roundtripped.descriptor.schema_version, 1);
    assert_eq!(roundtripped.topology_version, 3);
    assert_eq!(
        roundtripped.geometry.data_blocks[0].uri,
        "characters/ava.nkcdata"
    );
    assert_eq!(roundtripped.material_slots[0].slot_id, "skin");
    assert_eq!(roundtripped.override_layer.overrides[0].operation, "set");
    let region = &roundtripped
        .definition
        .region_descriptors
        .as_ref()
        .unwrap()
        .regions[0];
    assert_eq!(region.region_id, "face.mouth");
    assert_eq!(region.bindings[0].kind, "morphControl");
}

#[test]
fn scene_contract_fixture_roundtrips_character_command_and_modeling_patch() {
    let fixture = fixture();
    let encoded = serde_json::to_string(&fixture.character_command_envelope)
        .expect("character command envelope should serialize");
    let command: SceneCommandEnvelopeFixture =
        serde_json::from_str(&encoded).expect("character command envelope should deserialize");
    let character_command = command.command.character_command.unwrap();

    assert_eq!(command.seq, 9);
    assert_eq!(command.base_revision, 41);
    assert_eq!(command.command.command_type, "character");
    assert_eq!(character_command.command_type, "morph-set");
    assert_eq!(character_command.character_id, "character-a");
    assert_eq!(character_command.morph_set.unwrap().morph_id, "Smile");

    let remove_command = fixture.node_remove_envelope.command;
    assert_eq!(remove_command.command_type, "node-remove");
    assert!(remove_command
        .payload_json
        .as_deref()
        .unwrap_or_default()
        .contains("\"cascade\":false"));

    let session: ModelingSessionContractFixture =
        serde_json::from_value(serde_json::to_value(&fixture.modeling_session).unwrap())
            .expect("modeling session should roundtrip");
    assert_eq!(session.session_id, "session-sculpt");
    assert_eq!(session.op_log[0].operation, "brush");

    let patch: VertexBrushPatchFixture =
        serde_json::from_value(serde_json::to_value(&fixture.vertex_brush_patch).unwrap())
            .expect("vertex brush patch should roundtrip");
    assert_eq!(patch.stroke_id, "stroke-1");
    assert_eq!(patch.encoding, "f32-delta");
    assert_eq!(patch.payload, vec![0, 1, 2, 3]);
}
