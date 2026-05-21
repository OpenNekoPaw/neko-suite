/**
 * Tool Names — Single source of truth for all registered tool name constants.
 *
 * Every tool registration and skill allowedTools reference MUST use these constants
 * instead of raw strings. This prevents naming drift between tool definitions and
 * skill configurations.
 *
 * Categories:
 * - TIMELINE: neko-cut timeline operations
 * - CANVAS: neko-canvas node/generation operations
 * - MEDIA: platform-level media generation (GenerateImage, etc.)
 * - PIPELINE: pipeline orchestration and diagnostics
 * - QUALITY: quality check and consistency tools
 * - EFFECTS: video effects and shader management
 * - STORY: neko-story script tools
 * - SKETCH: neko-sketch painting tools
 * - ASSETS: asset management tools
 * - TRANSCRIBE: speech-to-text tools
 * - SYSTEM: system/utility tools (file ops, skill discovery)
 */

// =============================================================================
// NekoCut — Timeline Operations
// =============================================================================

export const TOOL_NAMES_TIMELINE = {
  GET_TIMELINE_INFO: 'GetTimelineInfo',
  GET_ELEMENT_INFO: 'GetElementInfo',
  LIST_TIMELINE_ELEMENTS: 'ListTimelineElements',
  LIST_EFFECTS: 'ListEffects',
  LIST_TRANSITIONS: 'ListTransitions',
  ADD_TIMELINE_ELEMENT: 'AddTimelineElement',
  UPDATE_TIMELINE_ELEMENT: 'UpdateTimelineElement',
  DELETE_TIMELINE_ELEMENT: 'DeleteTimelineElement',
  TRIM_ELEMENT: 'TrimElement',
  SPLIT_ELEMENT: 'SplitElement',
  ADD_EFFECT: 'AddEffect',
  UPDATE_EFFECT: 'UpdateEffect',
  REMOVE_EFFECT: 'RemoveEffect',
  SET_TRANSITION: 'SetTransition',
  REMOVE_TRANSITION: 'RemoveTransition',
  ADD_TRACK: 'AddTrack',
  DELETE_TRACK: 'DeleteTrack',
  REORDER_TRACKS: 'ReorderTracks',
  SET_TRACK_PROPERTIES: 'SetTrackProperties',
  SET_COLOR_CORRECTION: 'SetColorCorrection',
  RESET_COLOR_CORRECTION: 'ResetColorCorrection',
  SET_AUDIO_PROPERTIES: 'SetAudioProperties',
  ADD_AUDIO_KEYFRAME: 'AddAudioKeyframe',
  SEPARATE_AUDIO: 'SeparateAudio',
  SET_PLAYBACK_SPEED: 'SetPlaybackSpeed',
} as const;

// =============================================================================
// NekoCanvas — Canvas Operations
// =============================================================================

export const TOOL_NAMES_CANVAS = {
  CREATE_CANVAS: 'CreateCanvas',
  ADD_CANVAS_SHAPE: 'AddCanvasShape',
  CANVAS_LIST_NODES: 'canvas_list_nodes',
  CANVAS_GET_NODE: 'canvas_get_node',
  CANVAS_UPDATE_NODE: 'canvas_update_node',
  CANVAS_CREATE_NODE: 'canvas_create_node',
  CANVAS_DERIVE_NODE: 'canvas_derive_node',
  CANVAS_CREATE_COMPOSITE: 'canvas_create_composite',
  CANVAS_UPDATE_BLOCK: 'canvas_update_block',
  CANVAS_EXTRACT_STRUCTURED_CONTENT: 'canvas_extract_structured_content',
  CANVAS_GET_ACTIVE_CONTEXT: 'canvas_get_active_context',
  CANVAS_APPLY_AGENT_CONTENT: 'canvas_apply_agent_content',
  CANVAS_NARRATIVE_TRAVERSE: 'canvas_narrative_traverse',
  CANVAS_GET_STORYBOARD_EXECUTION_SUMMARY: 'canvas_get_storyboard_execution_summary',
  CANVAS_GENERATE_IMAGE: 'canvas_generate_image',
  CANVAS_GENERATE_BATCH: 'canvas_generate_batch',
  CANVAS_GENERATE_VIDEO_WITH_KEYFRAMES: 'canvas_generate_video_with_keyframes',
  CANVAS_APPLY_STYLE_TRANSFER: 'canvas_apply_style_transfer',
  SET_PROJECT_GENERATION_CONFIG: 'set_project_generation_config',
  EXPORT_STORYBOARD: 'export_storyboard',
  IMPORT_SCRIPT_TO_CANVAS: 'import_script_to_canvas',
} as const;

// =============================================================================
// Platform Media — Generation Tools
// =============================================================================

export const TOOL_NAMES_MEDIA = {
  GENERATE_IMAGE: 'GenerateImage',
  GENERATE_VIDEO: 'GenerateVideo',
  GENERATE_MUSIC: 'GenerateMusic',
  GENERATE_TTS: 'GenerateTTS',
  GENERATE_VIDEO_FOR_CLIP: 'GenerateVideoForClip',
} as const;

// =============================================================================
// Quality — Check and Consistency
// =============================================================================

export const TOOL_NAMES_QUALITY = {
  QUALITY_CHECK: 'QualityCheck',
  QUALITY_REPAIR_CHECK: 'QualityRepairCheck',
  QUALITY_CHECK_CONSISTENCY: 'QualityCheckConsistency',
} as const;

// =============================================================================
// Effects — Video Effects and Shaders
// =============================================================================

export const TOOL_NAMES_EFFECTS = {
  LIST_VIDEO_EFFECTS: 'ListVideoEffects',
  GET_VIDEO_EFFECT_INFO: 'GetVideoEffectInfo',
  REGISTER_CUSTOM_SHADER: 'RegisterCustomShader',
} as const;

// =============================================================================
// NekoStory — Script Tools
// =============================================================================

export const TOOL_NAMES_STORY = {
  GET_SCRIPT_INDEX: 'GetScriptIndex',
  SEARCH_SCRIPT_INDEX: 'SearchScriptIndex',
  GENERATE_SCENE_PLAN: 'GenerateScenePlan',
  GENERATE_SHOT_PLAN: 'GenerateShotPlan',
  STORY_APPLY_SUGGESTION: 'story_apply_suggestion',
} as const;

// =============================================================================
// NekoSketch — Painting Tools
// =============================================================================

export const TOOL_NAMES_SKETCH = {
  SKETCH_GENERATE: 'SketchGenerate',
  SKETCH_SMART_SELECTION: 'SketchSmartSelection',
  SKETCH_INPAINT: 'SketchInpaint',
  SKETCH_STYLE_TRANSFER: 'SketchStyleTransfer',
  SKETCH_UPSCALE: 'SketchUpscale',
  SKETCH_AUTO_LAYER: 'SketchAutoLayer',
  SKETCH_LINEART_COLORIZE: 'SketchLineartColorize',
} as const;

// =============================================================================
// Assets — Asset Management
// =============================================================================

export const TOOL_NAMES_ASSETS = {
  LIST_ASSETS: 'ListAssets',
  GET_ASSET: 'GetAsset',
  IMPORT_ASSET: 'ImportAsset',
} as const;

// =============================================================================
// NekoModel — 3D Scene Operations
// =============================================================================

export const TOOL_NAMES_MODEL = {
  MODEL_SCENE_QUERY: 'model_scene_query',
  MODEL_NODE_MANIPULATE: 'model_node_manipulate',
  MODEL_ANIMATION_CONTROL: 'model_animation_control',
} as const;

// =============================================================================
// Transcribe — Speech-to-Text
// =============================================================================

export const TOOL_NAMES_TRANSCRIBE = {
  TRANSCRIBE_AUDIO: 'TranscribeAudio',
} as const;

// =============================================================================
// Audio — neko-audio DAW operations
// =============================================================================

export const TOOL_NAMES_AUDIO = {
  GET_AUDIO_PROJECT_INFO: 'GetAudioProjectInfo',
  LIST_AUDIO_TRACKS: 'ListAudioTracks',
  ADD_AUDIO_TRACK: 'AddAudioTrack',
  REMOVE_AUDIO_TRACK: 'RemoveAudioTrack',
  SET_TRACK_PROPERTIES: 'SetTrackProperties',
  IMPORT_AUDIO: 'ImportAudio',
  SET_TRACK_VOLUME: 'SetTrackVolume',
  SET_TRACK_PAN: 'SetTrackPan',
  SET_TRACK_AUTOMATION: 'SetTrackAutomation',
  APPLY_TRACK_EFFECT: 'ApplyTrackEffect',
  REMOVE_TRACK_EFFECT: 'RemoveTrackEffect',
  APPLY_MASTER_EFFECT: 'ApplyMasterEffect',
  MIX_EXPORT: 'MixExport',
  GENERATE_MUSIC: 'GenerateMusic',
  GENERATE_SFX: 'GenerateSFX',
  GENERATE_VOICE: 'GenerateVoice',
  STEM_SEPARATION: 'StemSeparation',
  AUDIO_DENOISE: 'AudioDenoise',
  ANALYZE_AUDIO_LOUDNESS: 'AnalyzeAudioLoudness',
} as const;

// =============================================================================
// Perception — Optional Evidence Tools
// =============================================================================

export const TOOL_NAMES_PERCEPTION = {
  PERCEIVE: 'perception.perceive',
  DESCRIBE_INPUT: 'perception.describeInput',
  AUDIO_TRANSCRIBE: 'perception.audio.transcribe',
  IMAGE_SIMILARITY: 'perception.image.similarity',
  IMAGE_CLASSIFY: 'perception.image.classify',
  VIDEO_DETECT_SHOTS: 'perception.video.detectShots',
} as const;

// =============================================================================
// System — Utility Tools
// =============================================================================

export const TOOL_NAMES_SYSTEM = {
  LIST_PLUGIN_SKILLS: 'ListPluginSkills',
  READ_DOCUMENT: 'ReadDocument',
  READ_IMAGE: 'ReadImage',
  READ_DOCUMENT_IMAGE: 'ReadDocumentImage',
  // Core file tools (registered by agent core, not extension)
  READ: 'Read',
  WRITE: 'Write',
  LIST_DIRECTORY: 'ListDirectory',
  GLOB: 'Glob',
} as const;

// =============================================================================
// Unified TOOL_NAMES — Flat export for convenience
// =============================================================================

// =============================================================================
// Dual-Flow — Creation ring tools (P2 W6)
// =============================================================================
// Outer-ring tools that operate at the business-semantic layer
// (Orchestration / Proposal / Review / Execution / Status).
//
// Slots are reserved for later sub-packages to fill. Empty is
// intentional — the namespace is a registration surface, not a
// pre-populated list.

export const TOOL_NAMES_CREATION = {
  // Slots reserved for business-layer tools — e.g. 'creation.proposal.compose',
  // 'creation.review.request', 'creation.status.narrate'. Fill in as
  // creation-flow persona skills are authored.
} as const;

// =============================================================================
// Dual-Flow — Execution ring tools (P2 W6)
// =============================================================================
// Inner-ring tools that operate at the technical-semantic layer
// (Plan / TODO / Approve / Apply / Step).

export const TOOL_NAMES_EXECUTION = {
  // Slots reserved — e.g. 'execution.plan.produce', 'execution.todo.update',
  // 'execution.apply.commit'. Fill in as execution-flow machinery comes
  // online (P3 autoheal, P4 approval, Q3 recovery guidance).
} as const;

/**
 * All registered tool names as a flat constant object.
 * Use individual category objects (TOOL_NAMES_TIMELINE, etc.) for category-scoped access.
 */
export const TOOL_NAMES = {
  ...TOOL_NAMES_TIMELINE,
  ...TOOL_NAMES_CANVAS,
  ...TOOL_NAMES_MEDIA,
  ...TOOL_NAMES_QUALITY,
  ...TOOL_NAMES_EFFECTS,
  ...TOOL_NAMES_STORY,
  ...TOOL_NAMES_SKETCH,
  ...TOOL_NAMES_ASSETS,
  ...TOOL_NAMES_MODEL,
  ...TOOL_NAMES_TRANSCRIBE,
  ...TOOL_NAMES_AUDIO,
  ...TOOL_NAMES_PERCEPTION,
  ...TOOL_NAMES_SYSTEM,
  ...TOOL_NAMES_CREATION,
  ...TOOL_NAMES_EXECUTION,
} as const;

/** Union type of all registered tool name strings */
export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
