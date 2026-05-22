//! Command-line argument definitions
//!
//! Each engine controller group is exposed as a top-level subcommand.
//! Actions within each group are listed as sub-subcommands with shared options.
//!
//! Special handling:
//! - `timelines export` supports rich CLI flags (--jvi-file, --output, --codec, etc.)
//!   with progress bar display, in addition to the generic JSON mode.

use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// Neko Engine - Media Processing CLI
///
/// Dispatch actions to engine controller groups.
///
/// Examples:
///   neko-engine nodes health
///   neko-engine videos probe --options '{"source":"/path/to/video.mp4"}'
///   neko-engine timelines export -i project.nkv -o output.mp4
///   neko-engine serve -p 8765
#[derive(Parser, Debug)]
#[command(name = "neko-engine")]
#[command(version, about, long_about = None)]
pub struct Args {
    #[command(subcommand)]
    pub command: Command,
}

// ---------------------------------------------------------------------------
// Shared action options (--id, --options, --body, -f)
// ---------------------------------------------------------------------------

/// Common options shared by all generic actions
#[derive(Debug, Clone, clap::Args)]
pub struct ActionOpts {
    /// Resource ID (optional)
    #[arg(long)]
    pub id: Option<String>,

    /// Source file path
    #[arg(short = 'i', long)]
    pub source: Option<String>,

    /// Session ID for multi-window isolation
    #[arg(long)]
    pub session: Option<String>,

    /// Stream ID for stream control actions
    #[arg(long)]
    pub stream: Option<String>,

    /// Options as JSON string
    #[arg(long)]
    pub options: Option<String>,

    /// Body as JSON string (for complex payloads)
    #[arg(long)]
    pub body: Option<String>,

    /// Output format (json, pretty)
    #[arg(short, long, default_value = "pretty")]
    pub format: String,
}

// ---------------------------------------------------------------------------
// Macro: define action enum for a controller group
// ---------------------------------------------------------------------------

/// Generate a typed action enum where each variant carries `ActionOpts`.
macro_rules! define_actions {
    (
        $enum_name:ident {
            $( $(#[$meta:meta])* $variant:ident => $action_str:literal ),+ $(,)?
        }
    ) => {
        #[derive(Subcommand, Debug)]
        pub enum $enum_name {
            $(
                $(#[$meta])*
                $variant {
                    #[command(flatten)]
                    opts: ActionOpts,
                },
            )+
        }

        impl $enum_name {
            /// Return the engine action name string
            pub fn action_name(&self) -> &'static str {
                match self {
                    $( $enum_name::$variant { .. } => $action_str, )+
                }
            }

            /// Return the shared action options
            pub fn opts(&self) -> &ActionOpts {
                match self {
                    $( $enum_name::$variant { opts, .. } => opts, )+
                }
            }

            /// Return all action name strings (for registry alignment tests)
            #[allow(dead_code)]
            pub fn all_action_names() -> &'static [&'static str] {
                &[$( $action_str, )+]
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Top-level commands
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start as WebSocket server
    Serve {
        /// Server port (default: 8765)
        #[arg(short, long, default_value = "8765")]
        port: u16,

        /// Config file path (optional)
        #[arg(short, long)]
        config: Option<PathBuf>,

        /// Enable verbose logging
        #[arg(short, long)]
        verbose: bool,
    },

    /// Node management: health, metric, gpu
    Nodes {
        #[command(subcommand)]
        action: NodeAction,
    },

    /// Task management: probe, pause, resume, cancel, list
    Tasks {
        #[command(subcommand)]
        action: TaskAction,
    },

    /// Video processing: probe, capture, extract, stream, transcode, keyframes, waveform, proxy, stop, pause, resume, speed, seek, loop
    Videos {
        #[command(subcommand)]
        action: VideoAction,
    },

    /// Audio processing: probe, transcode, stream, waveform, diff, stop, pause, resume, speed, seek
    Audios {
        #[command(subcommand)]
        action: AudioAction,
    },

    /// Image processing: probe, capture, encode, diff
    Images {
        #[command(subcommand)]
        action: ImageAction,
    },

    /// Timeline editing & export: probe, composite, stream, stop, pause, resume, speed, loop, seek, diff, export, export_progress, export_cancel
    Timelines {
        #[command(subcommand)]
        action: TimelineAction,
    },

    /// Stream lifecycle: create, activate, pause, resume, destroy, list
    Streams {
        #[command(subcommand)]
        action: StreamAction,
    },

    /// 3D model operations (planned)
    Models {
        #[command(subcommand)]
        action: ModelAction,
    },

    /// Canvas operations (planned)
    Canvas {
        #[command(subcommand)]
        action: CanvasAction,
    },

    /// Scene operations (planned)
    Scenes {
        #[command(subcommand)]
        action: SceneAction,
    },

    /// Live compositor scene operations
    LiveCompositor {
        #[command(subcommand)]
        action: LiveCompositorAction,
    },

    /// File access: register, unregister, stat, resolve
    Files {
        #[command(subcommand)]
        action: FileAction,
    },
}

// ---------------------------------------------------------------------------
// Per-group action enums
// ---------------------------------------------------------------------------

define_actions!(NodeAction {
    /// Check node health status
    Health => "health",
    /// Get node performance metrics
    Metric => "metric",
    /// Get GPU information
    Gpu => "gpu",
    /// Get hardware capabilities
    HwCapabilities => "hw_capabilities",
});

define_actions!(TaskAction {
    /// Query task progress by ID
    Probe => "probe",
    /// Pause a running task
    Pause => "pause",
    /// Resume a paused task
    Resume => "resume",
    /// Cancel a task
    Cancel => "cancel",
    /// List all tasks
    List => "list",
});

define_actions!(VideoAction {
    /// Probe video file metadata
    Probe => "probe",
    /// Capture a single frame as JPEG
    Capture => "capture",
    /// Extract subtitles, frames, or frame sequences
    Extract => "extract",
    /// Start video streaming
    Stream => "stream",
    /// Transcode video file
    Transcode => "transcode",
    /// Extract keyframes
    Keyframes => "keyframes",
    /// Generate audio waveform
    Waveform => "waveform",
    /// Generate proxy file
    Proxy => "proxy",
    /// Compare two video files (metadata + content SSIM/PSNR)
    Diff => "diff",
    /// Stop video stream
    Stop => "stop",
    /// Pause video stream
    Pause => "pause",
    /// Resume video stream
    Resume => "resume",
    /// Set playback speed
    Speed => "speed",
    /// Seek to time position
    Seek => "seek",
    /// Set loop region
    Loop => "loop",
    /// Query or update panoramic view state
    ViewState => "view-state",
});

define_actions!(AudioAction {
    /// Probe audio file metadata
    Probe => "probe",
    /// Transcode audio file
    Transcode => "transcode",
    /// Return an encoded audio segment as base64
    Segment => "segment",
    /// Start audio streaming
    Stream => "stream",
    /// Generate audio waveform
    Waveform => "waveform",
    /// Compare two audio files (metadata + content)
    Diff => "diff",
    /// Stop audio stream
    Stop => "stop",
    /// Pause audio stream
    Pause => "pause",
    /// Resume audio stream
    Resume => "resume",
    /// Set playback speed
    Speed => "speed",
    /// Seek to time position
    Seek => "seek",
    /// Set loop region for audio stream
    Loop => "loop",
    /// Analyze audio loudness (ITU-R BS.1770-4 / EBU R128)
    AnalyzeLoudness => "analyze_loudness",
    /// Detect silence regions in audio
    DetectSilence => "detect_silence",
    /// List available audio input devices
    ListInputDevices => "list_input_devices",
    /// Start recording from an input device
    RecordStart => "record_start",
    /// Stop an active recording
    RecordStop => "record_stop",
    /// Mix down multi-track audio into a single output
    Mixdown => "mixdown",
    /// Start or update a multi-track audio mix stream
    MixStream => "mix_stream",
    /// Export a .nka project file by mapping it to MixdownConfig
    MixExport => "mix_export",
});

define_actions!(ImageAction {
    /// Probe image file metadata
    Probe => "probe",
    /// Capture/convert image
    Capture => "capture",
    /// Encode RGBA data to image format
    Encode => "encode",
    /// Compare two image files (metadata + content)
    Diff => "diff",
});

define_actions!(StreamAction {
    /// Create a new stream
    Create => "create",
    /// Activate a stream
    Activate => "activate",
    /// Pause a stream
    Pause => "pause",
    /// Resume a stream
    Resume => "resume",
    /// Destroy a stream
    Destroy => "destroy",
    /// List all streams
    List => "list",
    /// Stop a stream
    Stop => "stop",
    /// Seek within a stream
    Seek => "seek",
    /// Set stream playback speed
    Speed => "speed",
    /// Set stream loop region
    Loop => "loop",
    /// Get stream statistics
    Stats => "stats",
    /// Update stream configuration
    Update => "update",
    /// Set stream quality
    Quality => "quality",
    /// Apply an operation to a stream
    ApplyOperation => "applyOperation",
});

define_actions!(ModelAction {
    /// Probe 3D model metadata
    Probe => "probe",
    /// Capture model snapshot
    Capture => "capture",
    /// Stream model rendering
    Stream => "stream",
    /// Compare two 3D model files (metadata + content)
    Diff => "diff",
    /// Register a model asset or backend
    Register => "register",
    /// Unregister a model asset or backend
    Unregister => "unregister",
    /// List available models
    List => "list",
    /// Upscale model-related output
    Upscale => "upscale",
    /// Denoise model-related output
    Denoise => "denoise",
    /// Run CLIP embedding or matching
    Clip => "clip",
    /// Run transcription against model pipeline
    Transcribe => "transcribe",
    /// Preprocess model input (e.g. segmentation, depth)
    Preprocess => "preprocess",
});

define_actions!(CanvasAction {
    /// Composite canvas layers
    Composite => "composite",
    /// Capture canvas snapshot
    Capture => "capture",
    /// Export canvas
    Export => "export",
    /// Compare two canvas outputs (metadata + content)
    Diff => "diff",
});

define_actions!(SceneAction {
    /// Load a 3D model (glTF/glb/VRM) into the scene
    Load => "load",
    /// Get scene graph hierarchy
    Graph => "graph",
    /// Update node transform
    Transform => "transform",
    /// List/control animation clips
    Animate => "animate",
    /// Advance animation by one frame
    Tick => "tick",
    /// Get full scene snapshot
    Snapshot => "snapshot",
    /// Composite scene (GPU render)
    Composite => "composite",
    /// Capture scene frame
    Capture => "capture",
    /// Stream scene rendering
    Stream => "stream",
    /// Latency test (echo)
    LatencyTest => "latency_test",
    /// Create a parametric shape (cube, sphere, cylinder, etc.)
    CreateShape => "create_shape",
    /// Create extruded 3D text mesh
    CreateText => "create_text",
    /// Perform CSG boolean operation on two entities
    CsgBoolean => "csg_boolean",
    /// Export scene to GLB format
    ExportGltf => "export_gltf",
    /// Save scene as .nkm project file
    SaveProject => "save_project",
    /// Load .nkm project file
    LoadProject => "load_project",
    /// List keyframe tracks for a node
    KeyframeTracks => "keyframe_tracks",
    /// Add a keyframe to a track
    KeyframeAdd => "keyframe_add",
    /// Remove a keyframe from a track
    KeyframeRemove => "keyframe_remove",
    /// Update a keyframe on a track
    KeyframeUpdate => "keyframe_update",
    /// Create an animation clip
    ClipCreate => "clip_create",
    /// Crossfade between animation clips
    AnimCrossfade => "anim_crossfade",
    /// Set animation blend weight
    BlendWeight => "blend_weight",
    /// Query animation blend state
    BlendState => "blend_state",
    /// Create an IK chain
    IkCreate => "ik_create",
    /// Remove an IK chain
    IkRemove => "ik_remove",
    /// Set an IK target
    IkTarget => "ik_target",
    /// Enable or disable IK
    IkEnable => "ik_enable",
    /// List IK chains
    IkList => "ik_list",
    /// Set node visibility
    SetVisible => "set_visible",
    /// Update morph target weights
    MorphWeights => "morph_weights",
    /// Update material properties
    UpdateMaterial => "update_material",
    /// Delete a scene node
    DeleteNode => "delete_node",
    /// Update VRM face parameter presets
    SetFaceParams => "set_face_params",
    /// Get VRM face parameter presets
    GetFaceParams => "get_face_params",
    /// Update scene camera settings
    UpdateCamera => "update_camera",
});

define_actions!(LiveCompositorAction {
    /// Create a live compositor scene
    Create => "create",
    /// Replace a live compositor scene
    Update => "update",
    /// Get a live compositor scene
    Get => "get",
    /// Reset a live compositor scene
    Reset => "reset",
    /// List live compositor scenes
    List => "list",
    /// Dispatch a scene:live:* viewport command envelope
    Command => "command",
    /// Start a live compositor monitor stream
    Stream => "stream",
    /// Stop a live compositor monitor stream
    Stop => "stop",
});

define_actions!(FileAction {
    /// Register a local file and receive an engine token
    Register => "register",
    /// Release a registered file token
    Unregister => "unregister",
    /// Get metadata for a registered file token
    Stat => "stat",
    /// Resolve and authorize a local file path
    Resolve => "resolve",
});

// ---------------------------------------------------------------------------
// Timeline actions (special: export has rich CLI flags)
// ---------------------------------------------------------------------------

#[derive(Subcommand, Debug)]
pub enum TimelineAction {
    /// Probe timeline (.nkv) file metadata
    Probe {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Composite a single frame from timeline
    Composite {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Start timeline streaming
    Stream {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Get stream performance stats
    StreamStats {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Stop timeline stream
    Stop {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Pause timeline stream
    Pause {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Resume timeline stream
    Resume {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Set timeline playback speed
    Speed {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Set timeline loop region
    Loop {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Seek timeline to time position
    Seek {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Compare two timeline files (metadata + content)
    Diff {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Export a .nkv project file with progress display
    Export {
        /// Path to .nkv project file
        #[arg(short = 'i', long)]
        jvi_file: PathBuf,

        /// Output video file path
        #[arg(short, long)]
        output: PathBuf,

        /// Video codec (h264, h265, vp9, prores)
        #[arg(long, default_value = "h264")]
        codec: String,

        /// Video bitrate in bps (default: 5000000)
        #[arg(long, default_value = "5000000")]
        bitrate: u64,

        /// Encoder preset (ultrafast, fast, medium, slow, veryslow)
        #[arg(long, default_value = "medium")]
        preset: String,

        /// Hardware encoder (auto, videotoolbox, nvenc, vaapi, qsv, none)
        #[arg(long, default_value = "auto")]
        hw_encoder: String,

        /// Enable zero-copy GPU encoding (macOS only)
        #[arg(long, default_value = "false")]
        zero_copy: bool,
    },

    /// Query export job progress
    ExportProgress {
        #[command(flatten)]
        opts: ActionOpts,
    },

    /// Cancel an export job
    ExportCancel {
        #[command(flatten)]
        opts: ActionOpts,
    },
}

impl TimelineAction {
    /// Return all action name strings (for registry alignment tests)
    #[allow(dead_code)]
    pub fn all_action_names() -> &'static [&'static str] {
        &[
            "probe",
            "composite",
            "stream",
            "stream_stats",
            "stop",
            "pause",
            "resume",
            "speed",
            "loop",
            "seek",
            "diff",
            "export",
            "export_progress",
            "export_cancel",
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::registry;

    #[test]
    fn test_node_actions_align_with_registry() {
        assert_eq!(
            NodeAction::all_action_names(),
            registry::actions::NODES,
            "NodeAction variants do not match registry::actions::NODES"
        );
    }

    #[test]
    fn test_task_actions_align_with_registry() {
        assert_eq!(
            TaskAction::all_action_names(),
            registry::actions::TASKS,
            "TaskAction variants do not match registry::actions::TASKS"
        );
    }

    #[test]
    fn test_video_actions_align_with_registry() {
        assert_eq!(
            VideoAction::all_action_names(),
            registry::actions::VIDEOS,
            "VideoAction variants do not match registry::actions::VIDEOS"
        );
    }

    #[test]
    fn test_audio_actions_align_with_registry() {
        assert_eq!(
            AudioAction::all_action_names(),
            registry::actions::AUDIOS,
            "AudioAction variants do not match registry::actions::AUDIOS"
        );
    }

    #[test]
    fn test_image_actions_align_with_registry() {
        assert_eq!(
            ImageAction::all_action_names(),
            registry::actions::IMAGES,
            "ImageAction variants do not match registry::actions::IMAGES"
        );
    }

    #[test]
    fn test_timeline_actions_align_with_registry() {
        assert_eq!(
            TimelineAction::all_action_names(),
            registry::actions::TIMELINES,
            "TimelineAction variants do not match registry::actions::TIMELINES"
        );
    }

    #[test]
    fn test_stream_actions_align_with_registry() {
        assert_eq!(
            StreamAction::all_action_names(),
            registry::actions::STREAMS,
            "StreamAction variants do not match registry::actions::STREAMS"
        );
    }

    #[test]
    fn test_model_actions_align_with_registry() {
        assert_eq!(
            ModelAction::all_action_names(),
            registry::actions::MODELS,
            "ModelAction variants do not match registry::actions::MODELS"
        );
    }

    #[test]
    fn test_canvas_actions_align_with_registry() {
        assert_eq!(
            CanvasAction::all_action_names(),
            registry::actions::CANVAS,
            "CanvasAction variants do not match registry::actions::CANVAS"
        );
    }

    #[test]
    fn test_scene_actions_align_with_registry() {
        assert_eq!(
            SceneAction::all_action_names(),
            registry::actions::SCENES,
            "SceneAction variants do not match registry::actions::SCENES"
        );
    }

    #[test]
    fn test_live_compositor_actions_align_with_registry() {
        assert_eq!(
            LiveCompositorAction::all_action_names(),
            registry::actions::LIVE_COMPOSITOR,
            "LiveCompositorAction variants do not match registry::actions::LIVE_COMPOSITOR"
        );
    }

    #[test]
    fn test_file_actions_align_with_registry() {
        assert_eq!(
            FileAction::all_action_names(),
            registry::actions::FILES,
            "FileAction variants do not match registry::actions::FILES"
        );
    }
}
