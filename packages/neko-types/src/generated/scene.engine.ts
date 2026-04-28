// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
//
// Source: packages/neko-proto/scene.proto
// Source hash: 96b5b5d25eacac05
// Command: node scripts/proto-gen-ts.mjs
// =============================================================================

// =============================================================================
// Enums
// =============================================================================

export type EngineCharacterDataBlockKind =
  | 'morph-sparse-delta'
  | 'skin-weight-atlas'
  | 'blend-shape'
  | 'auxiliary-geometry';

export type EngineCharacterOverrideOperation = 'set' | 'remove' | 'reset';

export type EngineCharacterCommandType =
  | 'morph-set'
  | 'material-layer-set'
  | 'expression-preset-apply'
  | 'ik-handle-set'
  | 'bone-pose-set'
  | 'skeleton-bind'
  | 'override-apply'
  | 'override-reset';

export type EngineSceneCommandType =
  | 'transform'
  | 'camera-set'
  | 'camera-switch'
  | 'animation-play'
  | 'animation-seek'
  | 'material-update'
  | 'visibility-set'
  | 'hierarchy-reparent'
  | 'hierarchy-reorder'
  | 'asset-bind'
  | 'node-add'
  | 'node-remove'
  | 'modeling-begin-session'
  | 'modeling-end-session'
  | 'modeling-cancel-session'
  | 'modeling-brush-stroke'
  | 'modeling-topology-op'
  | 'modeling-uv-unwrap'
  | 'light-update'
  | 'character';

export type EngineSceneCommandPhase = 'begin' | 'update' | 'end' | 'cancel';

export type EngineSceneCommandStatus = 'applied' | 'rejected' | 'superseded';

export type EngineTopologyOperation =
  | 'subdivide'
  | 'decimate'
  | 'boolean'
  | 'remesh'
  | 'dynamic-add'
  | 'dynamic-collapse'
  | 'uv-unwrap';

export type EngineTopologyMigrationStatus = 'preserved' | 'migrated' | 'invalidated' | 'blocked';

export type EngineModelingSessionLifecycle = 'begin' | 'active' | 'committed' | 'cancelled';

export type EngineMigrationKind = 'morph-retarget' | 'skin-retarget' | 'uv-reproject';

export type EngineVertexBrushPatchEncoding = 'f32-delta' | 'f16-delta' | 'quantized-i16-delta';

export type EngineCameraRefKind = 'sceneCamera' | 'editorCamera';

export type EngineViewportRenderMode =
  | 'pbr'
  | 'wireframe'
  | 'unlit'
  | 'normal'
  | 'depth'
  | 'lightComplexity'
  | 'shadowAtlas';

export type EngineViewportDebugView =
  | 'albedo'
  | 'roughness'
  | 'metallic'
  | 'ao'
  | 'uv'
  | 'overdraw';

export type EngineSceneColorSpace = 'srgb' | 'rec709' | 'p3';

export type EngineToneMapping = 'aces' | 'reinhard' | 'none';

export type EngineViewportWorkMode =
  | 'edit-parametric'
  | 'edit-free'
  | 'pose'
  | 'render-preview'
  | 'lookdev';

export type EngineH264Container = 'h264-annexb' | 'h264-avcc';

export type EngineH264FrameHeader = 'neko-h264-v1';

export type EngineH264InitDataFormat = 'avcc-record';

export type EngineAudioCodec = 'pcm-f32le';

export type EngineAudioFrameHeader = 'neko-pcm-v1';

// =============================================================================
// Messages
// =============================================================================

export interface EngineVec2 {
  x: number;
  y: number;
}

export interface EngineVec3 {
  x: number;
  y: number;
  z: number;
}

export interface EngineQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface EngineViewportResolution {
  width: number;
  height: number;
  pixelRatio: number;
}

export interface EngineTransform3d {
  position?: EngineVec3;
  rotation?: EngineQuat;
  scale?: EngineVec3;
}

export interface EngineTransformPatch {
  nodeId: string;
  position?: EngineVec3;
  rotation?: EngineQuat;
  scale?: EngineVec3;
}

export interface EngineAssetHandle {
  id: string;
  uri?: string;
  kind?: string;
}

export interface EngineCharacterDataBlockRef {
  blockId: string;
  kind: EngineCharacterDataBlockKind;
  uri: string;
  assetHandleId?: string;
  checksum?: string;
  encoding?: string;
  byteOffset?: number;
  byteLength?: number;
}

export interface EngineMaterialSlot {
  slotId: string;
  name: string;
  material?: EngineAssetHandle;
  role?: string;
  index?: number;
}

export interface EngineMorphDescriptor {
  morphId: string;
  displayName: string;
  targetPath: string;
  defaultWeight: number;
  min?: number;
  max?: number;
  sparseDelta?: EngineCharacterDataBlockRef;
  tags: string[];
}

export interface EngineSkinWeightAtlas {
  atlasId: string;
  data?: EngineCharacterDataBlockRef;
  jointCount: number;
  vertexCount: number;
  encoding?: string;
}

export interface EngineBlendShape {
  blendShapeId: string;
  name: string;
  data?: EngineCharacterDataBlockRef;
  defaultWeights: EngineMorphWeightEntry[];
}

export interface EngineSkeletonDescriptor {
  skeletonId: string;
  skeleton?: EngineAssetHandle;
  rootBone?: string;
  bindJoints: string[];
}

export interface EngineBehaviorDriver {
  driverId: string;
  kind: string;
  targetPath: string;
  paramsJson: string;
}

export interface EngineExpressionPreset {
  presetId: string;
  displayName: string;
  morphWeights: EngineMorphWeightEntry[];
  bonePoseIds: string[];
  materialOverrideIds: string[];
}

export interface EngineCharacterDescriptor {
  characterId: string;
  name: string;
  schemaVersion: number;
  featureFlags: string[];
  baseTemplate?: EngineAssetHandle;
  templateVersion?: string;
  checksum?: string;
}

export interface EngineCharacterDefinition {
  controls: EngineMorphDescriptor[];
  expressionPresets: EngineExpressionPreset[];
  behaviorDrivers: EngineBehaviorDriver[];
}

export interface EngineCharacterGeometry {
  baseMesh?: EngineAssetHandle;
  skeleton?: EngineSkeletonDescriptor;
  morphLibrary: EngineMorphDescriptor[];
  skinWeightAtlases: EngineSkinWeightAtlas[];
  blendShapes: EngineBlendShape[];
  dataBlocks: EngineCharacterDataBlockRef[];
}

export interface EngineCharacterOverrideEntry {
  path: string;
  valueType: string;
  valueJson: string;
  operation: EngineCharacterOverrideOperation;
  baseRevision?: number;
}

export interface EngineCharacterOverrideLayer {
  baseTemplate?: EngineAssetHandle;
  overrides: EngineCharacterOverrideEntry[];
}

export interface EngineLayeredCharacterDescription {
  descriptor?: EngineCharacterDescriptor;
  topologyVersion: number;
  definition?: EngineCharacterDefinition;
  geometry?: EngineCharacterGeometry;
  materialSlots: EngineMaterialSlot[];
  overrideLayer?: EngineCharacterOverrideLayer;
}

export interface EngineNkcCharacterFile {
  fileKind: string;
  schemaVersion: number;
  character?: EngineLayeredCharacterDescription;
  dataBlocks: EngineCharacterDataBlockRef[];
  featureFlags: string[];
  migrationManifestUri?: string;
  checksum?: string;
}

export interface EngineNkcDataBlockEntry {
  entryId: string;
  kind: EngineCharacterDataBlockKind;
  uri: string;
  checksum: string;
  byteOffset: number;
  byteLength: number;
}

export interface EngineNkcDataBlockManifest {
  fileKind: string;
  schemaVersion: number;
  blockId: string;
  encoding: string;
  byteLength: number;
  checksum: string;
  entries: EngineNkcDataBlockEntry[];
}

export interface EngineCharacterMigrationStep {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  migrationId: string;
  requiredFeatureFlags: string[];
}

export interface EngineCharacterMigrationManifest {
  currentSchemaVersion: number;
  steps: EngineCharacterMigrationStep[];
  supportedLegacyVersions: number[];
}

export interface EngineCharacterMorphSetCommand {
  morphId: string;
  weight: number;
}

export interface EngineCharacterMaterialLayerCommand {
  slotId: string;
  paramsJson: string;
}

export interface EngineCharacterExpressionPresetCommand {
  presetId: string;
  weight: number;
}

export interface EngineCharacterIkHandleCommand {
  handleId: string;
  target?: EngineVec3;
  space?: string;
}

export interface EngineCharacterBonePoseCommand {
  boneId: string;
  transform?: EngineTransform3d;
  space?: string;
}

export interface EngineCharacterSkeletonBindCommand {
  skeletonId: string;
  skeleton?: EngineAssetHandle;
}

export interface EngineCharacterOverrideCommand {
  operation: EngineCharacterOverrideOperation;
  entries: EngineCharacterOverrideEntry[];
}

export interface EngineCharacterCommand {
  type: EngineCharacterCommandType;
  characterId: string;
  nodeId?: string;
  topologyVersion?: number;
  morphSet?: EngineCharacterMorphSetCommand;
  materialLayer?: EngineCharacterMaterialLayerCommand;
  expressionPreset?: EngineCharacterExpressionPresetCommand;
  ikHandle?: EngineCharacterIkHandleCommand;
  bonePose?: EngineCharacterBonePoseCommand;
  skeletonBind?: EngineCharacterSkeletonBindCommand;
  overrideEdit?: EngineCharacterOverrideCommand;
}

export interface EngineSceneCommand {
  type: EngineSceneCommandType;
  payloadJson: string;
  topologyVersion?: number;
  modelingSessionId?: string;
  characterCommand?: EngineCharacterCommand;
}

export interface EngineSceneCommandEnvelope {
  seq: number;
  transactionId?: string;
  phase?: EngineSceneCommandPhase;
  baseRevision: number;
  coalesceKey?: string;
  command?: EngineSceneCommand;
}

export interface EngineSceneCommandAck {
  seq: number;
  appliedSeq: number;
  baseRevision: number;
  revision: number;
  status: EngineSceneCommandStatus;
  error?: string;
}

export interface EngineAnimationClipInfo {
  name: string;
  duration: number;
}

export interface EngineAnimationStatePatch {
  clip?: string;
  time?: number;
  playing?: boolean;
  looped?: boolean;
  weight?: number;
}

export interface EngineMorphWeightEntry {
  name: string;
  weight: number;
}

export interface EngineMorphWeightsPatch {
  nodeId: string;
  weights: EngineMorphWeightEntry[];
}

export interface EngineSceneNodeSnapshot {
  nodeId: string;
  parentId?: string;
  name: string;
  transform?: EngineTransform3d;
  children: string[];
  visible: boolean;
  layerMask?: number;
  mesh?: EngineAssetHandle;
  material?: EngineAssetHandle;
  kind?: string;
}

export interface EngineSceneSnapshot {
  sceneId: string;
  revision: number;
  nodes: EngineSceneNodeSnapshot[];
  animations: EngineAnimationClipInfo[];
  activeCamera?: EngineCameraState;
}

export interface EngineSceneNodePatch {
  nodeId: string;
  parentId?: string;
  name?: string;
  transform?: EngineTransform3d;
  visible?: boolean;
  children?: string[];
  mesh?: EngineAssetHandle;
  material?: EngineAssetHandle;
  kind?: string;
}

export interface EngineHierarchyPatch {
  nodeId: string;
  parentId?: string;
  children?: string[];
  order?: number;
}

export interface EngineVisibilityPatch {
  nodeId: string;
  visible: boolean;
  layerMask?: number;
}

export interface EngineLayerPatch {
  nodeId: string;
  layerMask: number;
}

export interface EngineMaterialPatch {
  materialId: string;
  nodeId?: string;
  slot?: string;
  paramsJson: string;
}

export interface EngineCharacterMorphWeightsPatch {
  characterId: string;
  weights: EngineMorphWeightEntry[];
  topologyVersion: number;
}

export interface EngineCharacterMaterialPatch {
  characterId: string;
  slotId: string;
  paramsJson: string;
  topologyVersion: number;
}

export interface EngineCharacterSkeletonPosePatch {
  characterId: string;
  boneId: string;
  transform?: EngineTransform3d;
  topologyVersion: number;
}

export interface EngineCharacterOverridePatch {
  characterId: string;
  overrides: EngineCharacterOverrideEntry[];
  topologyVersion: number;
}

export interface EngineAssetReferencePatch {
  nodeId: string;
  mesh?: EngineAssetHandle;
  material?: EngineAssetHandle;
  textures?: EngineAssetHandle[];
}

export interface EngineLightPatch {
  nodeId: string;
  kind: string;
  color?: EngineVec3;
  intensity: number;
  range?: number;
  innerConeAngle?: number;
  outerConeAngle?: number;
}

export interface EngineCameraPatch {
  cameraId: string;
  nodeId?: string;
  fov?: number;
  near?: number;
  far?: number;
  aspect?: number;
  transform?: EngineTransform3d;
}

export interface EngineCameraState {
  cameraId: string;
  position?: EngineVec3;
  target?: EngineVec3;
  up?: EngineVec3;
  fov: number;
  near?: number;
  far?: number;
}

export interface EngineProjectedBounds {
  nodeId: string;
  min?: EngineVec2;
  max?: EngineVec2;
}

export interface EngineGizmoAnchor {
  nodeId: string;
  worldPosition?: EngineVec3;
  screenPosition?: EngineVec2;
}

export interface EngineViewportOverlayPatch {
  viewportId: string;
  revision?: number;
  selectedNodeIds?: string[];
  projectedBounds?: EngineProjectedBounds[];
  gizmoAnchors?: EngineGizmoAnchor[];
  hoveredNodeId?: string;
}

export interface EngineTopologyMigrationResult {
  dataKind: string;
  status: EngineTopologyMigrationStatus;
  diagnostic?: string;
}

export interface EngineTopologyChangeEvent {
  meshId: string;
  fromVersion: number;
  toVersion: number;
  operation: EngineTopologyOperation;
  invalidatesMorphLibrary: boolean;
  invalidatesSkinWeights: boolean;
  invalidatesUv: boolean;
  vertexCountBefore: number;
  vertexCountAfter: number;
  operationSummary?: string;
  migrationResults?: EngineTopologyMigrationResult[];
  invalidatesTangents?: boolean;
  invalidatesBounds?: boolean;
  invalidatesAccelerationStructure?: boolean;
}

export interface EngineModelingOperationLogEntry {
  seq: number;
  operation: string;
  summary: string;
  topologyVersion: number;
}

export interface EngineModelingSession {
  sessionId: string;
  meshId: string;
  characterId?: string;
  topologyMutable: boolean;
  topologyVersion: number;
  beforeHash: string;
  affectedFlags: string[];
  opLog: EngineModelingOperationLogEntry[];
  state: EngineModelingSessionLifecycle;
}

export interface EngineVertexBrushPatch {
  sessionId: string;
  meshId: string;
  topologyVersion: number;
  strokeId: string;
  seq: number;
  encoding: EngineVertexBrushPatchEncoding;
  sparseIndices: number[];
  affectedStart?: number;
  affectedCount?: number;
  payload: Uint8Array;
}

export interface EngineModelingSessionState {
  sessionId: string;
  characterId?: string;
  topologyMutable: boolean;
  topologyVersion: number;
  state: EngineModelingSessionLifecycle;
  pendingMigrations: EngineMigrationKind[];
  meshId?: string;
  beforeHash?: string;
  opLog: EngineModelingOperationLogEntry[];
}

export interface EngineSceneDelta {
  revision: number;
  appliedSeq?: number;
  updatedTransforms?: EngineTransformPatch[];
  updatedMorphWeights?: EngineMorphWeightsPatch[];
  animationState?: EngineAnimationStatePatch;
  addedNodes?: EngineSceneNodePatch[];
  removedNodes?: string[];
  updatedHierarchy?: EngineHierarchyPatch[];
  updatedVisibility?: EngineVisibilityPatch[];
  updatedLayers?: EngineLayerPatch[];
  updatedMaterials?: EngineMaterialPatch[];
  updatedAssetReferences?: EngineAssetReferencePatch[];
  updatedLights?: EngineLightPatch[];
  activeCamera?: EngineCameraState;
  updatedCameras?: EngineCameraPatch[];
  topologyChanges?: EngineTopologyChangeEvent[];
  modelingSessions?: EngineModelingSessionState[];
  overlay?: EngineViewportOverlayPatch;
  updatedCharacterMorphWeights?: EngineCharacterMorphWeightsPatch[];
  updatedCharacterMaterials?: EngineCharacterMaterialPatch[];
  updatedSkeletonPose?: EngineCharacterSkeletonPosePatch[];
  characterOverrides?: EngineCharacterOverridePatch[];
}

export interface EngineEditorCameraRig {
  position?: EngineVec3;
  target?: EngineVec3;
  up?: EngineVec3;
  fov: number;
  mode?: string;
}

export interface EngineViewportCameraRef {
  kind: EngineCameraRefKind;
  cameraId?: string;
  rig?: EngineEditorCameraRig;
}

export interface EngineViewportPostProcess {
  bloom?: boolean;
  ssao?: boolean;
  taa?: boolean;
}

export interface EngineViewportDescriptor {
  viewportId: string;
  sceneId: string;
  cameraRef?: EngineViewportCameraRef;
  renderMode: EngineViewportRenderMode;
  debugView?: EngineViewportDebugView;
  resolution?: EngineViewportResolution;
  fps: number;
  colorSpace: EngineSceneColorSpace;
  toneMapping: EngineToneMapping;
  postProcess?: EngineViewportPostProcess;
  layerMask?: number;
  workMode: EngineViewportWorkMode;
}

export interface EngineH264InitData {
  format: EngineH264InitDataFormat;
  data: string;
}

export interface EngineAudioStreamDescriptor {
  streamId: string;
  codec: EngineAudioCodec;
  frameHeader: EngineAudioFrameHeader;
  sampleRate: number;
  channels: number;
  isMasterClock?: boolean;
}

export interface EngineRenderStreamDescriptor {
  streamId: string;
  viewportId: string;
  container: EngineH264Container;
  codecString: string;
  profile?: string;
  level?: string;
  frameHeader: EngineH264FrameHeader;
  initData?: EngineH264InitData;
  width: number;
  height: number;
  fps: number;
  colorSpace: EngineSceneColorSpace;
  bitDepth: number;
  toneMapping: EngineToneMapping;
  gopSize?: number;
  initialRevision: number;
  audioStream?: EngineAudioStreamDescriptor;
  qualityTier?: string;
  helperPassesEnabled?: boolean;
  postProcessEnabled?: boolean;
}

export interface EngineRenderFrameDiagnostics {
  gpuFrameTimeMs?: number;
  encodeTimeMs?: number;
  qualityTier?: string;
  droppedFramesSinceLast?: number;
  gpuUploadTimeMs?: number;
}

export interface EngineRenderFrameMeta {
  streamId: string;
  viewportId: string;
  frameId: number;
  ptsUs: number;
  durationUs: number;
  isKeyframe: boolean;
  sceneRevision: number;
  appliedSeq: number;
  diagnostics?: EngineRenderFrameDiagnostics;
}
