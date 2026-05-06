//! Central registry of group and action names.
//!
//! This module is the **single source of truth** for all group/action string
//! constants used across neko-engine crates (host-api controllers, router,
//! host-cli args). Any rename or addition should happen here first; compile-
//! time tests in `host-cli` verify that the CLI layer stays in sync.

/// Group name constants — each maps to one API controller.
pub mod groups {
    pub const NODES: &str = "nodes";
    pub const TASKS: &str = "tasks";
    pub const VIDEOS: &str = "videos";
    pub const AUDIOS: &str = "audios";
    pub const IMAGES: &str = "images";
    pub const TIMELINES: &str = "timelines";
    pub const STREAMS: &str = "streams";
    pub const MODELS: &str = "models";
    pub const CANVAS: &str = "canvas";
    pub const SCENES: &str = "scenes";
    pub const PUPPETS: &str = "puppets";
    pub const EFFECTS: &str = "effects";

    pub const CAMERAS: &str = "cameras";
    pub const MIDI: &str = "midi";
    pub const GAMEPAD: &str = "gamepad";
    pub const COLOR_CORRECTION: &str = "color-correction";
    pub const DOCUMENTS: &str = "documents";
    pub const PLUGINS: &str = "plugins";

    pub const ALL: &[&str] = &[
        NODES,
        TASKS,
        VIDEOS,
        AUDIOS,
        IMAGES,
        TIMELINES,
        STREAMS,
        MODELS,
        CANVAS,
        SCENES,
        PUPPETS,
        EFFECTS,
        CAMERAS,
        MIDI,
        GAMEPAD,
        COLOR_CORRECTION,
        DOCUMENTS,
        PLUGINS,
    ];
}

/// Action name constants — one slice per group.
pub mod actions {
    pub const NODES: &[&str] = &["health", "metric", "gpu", "hw_capabilities"];

    pub const TASKS: &[&str] = &["probe", "pause", "resume", "cancel", "list"];

    pub const VIDEOS: &[&str] = &[
        "probe",
        "capture",
        "extract",
        "stream",
        "transcode",
        "keyframes",
        "waveform",
        "proxy",
        "diff",
        "stop",
        "pause",
        "resume",
        "speed",
        "seek",
        "loop",
    ];

    pub const AUDIOS: &[&str] = &[
        "probe",
        "transcode",
        "segment",
        "stream",
        "waveform",
        "diff",
        "stop",
        "pause",
        "resume",
        "speed",
        "seek",
        "loop",
        "analyze_loudness",
        "detect_silence",
        "list_input_devices",
        "record_start",
        "record_stop",
        "mixdown",
    ];

    pub const IMAGES: &[&str] = &["probe", "capture", "encode", "diff"];

    pub const TIMELINES: &[&str] = &[
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
    ];

    pub const STREAMS: &[&str] = &[
        "create",
        "activate",
        "pause",
        "resume",
        "destroy",
        "list",
        "stop",
        "seek",
        "speed",
        "loop",
        "stats",
        "update",
        "quality",
        "applyOperation",
    ];

    pub const MODELS: &[&str] = &[
        "probe",
        "capture",
        "stream",
        "diff",
        "register",
        "unregister",
        "list",
        "upscale",
        "denoise",
        "clip",
        "transcribe",
    ];

    pub const CANVAS: &[&str] = &["composite", "capture", "export", "diff"];

    pub const SCENES: &[&str] = &[
        "load",
        "graph",
        "transform",
        "animate",
        "tick",
        "snapshot",
        "composite",
        "capture",
        "stream",
        "latency_test",
        "create_shape",
        "create_text",
        "csg_boolean",
        "export_gltf",
        "save_project",
        "load_project",
        "keyframe_tracks",
        "keyframe_add",
        "keyframe_remove",
        "keyframe_update",
        "clip_create",
        "anim_crossfade",
        "blend_weight",
        "blend_state",
        "ik_create",
        "ik_remove",
        "ik_target",
        "ik_enable",
        "ik_list",
        "set_visible",
        "morph_weights",
        "update_material",
        "delete_node",
        "set_face_params",
        "get_face_params",
    ];

    pub const PUPPETS: &[&str] = &[
        "load",
        "snapshot",
        "param",
        "params",
        "tick",
        "meshes",
        "anims",
        "anim_play",
        "anim_stop",
        "anim_seek",
        "keyframe_tracks",
        "keyframe_add",
        "keyframe_remove",
        "keyframe_update",
        "clip_create",
        "anim_crossfade",
        "blend_weight",
        "blend_state",
        "set_opacity",
        "set_texture",
        "expressions",
        "set_expression",
        "load_auxiliary",
        "export_motion3",
        "export_expression3",
    ];

    pub const EFFECTS: &[&str] = &["apply", "list", "info", "register"];

    pub const CAMERAS: &[&str] = &["list_devices", "capture_start", "capture_stop", "snapshot"];

    pub const MIDI: &[&str] = &["list_ports", "connect", "disconnect"];

    pub const GAMEPAD: &[&str] = &["list", "connect", "disconnect"];

    pub const COLOR_CORRECTION: &[&str] = &["upload_lut", "remove_lut", "list_luts"];

    pub const DOCUMENTS: &[&str] = &["probe"];

    pub const PLUGINS: &[&str] = &[
        "list",
        "inspect",
        "enable",
        "disable",
        "reload",
        "system-info",
        "audit-events",
    ];
}
