//! Central registry of group and action names.
//!
//! This module is the **single source of truth** for all group/action string
//! constants used across neko-engine crates (native-api controllers, router,
//! native-cli args). Any rename or addition should happen here first; compile-
//! time tests in `native-cli` verify that the CLI layer stays in sync.

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
    pub const EFFECTS: &str = "effects";

    pub const ALL: &[&str] = &[
        NODES, TASKS, VIDEOS, AUDIOS, IMAGES, TIMELINES, STREAMS, MODELS, CANVAS, SCENES, EFFECTS,
    ];
}

/// Action name constants — one slice per group.
pub mod actions {
    pub const NODES: &[&str] = &["health", "metric", "gpu"];

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

    pub const MODELS: &[&str] = &["probe", "capture", "stream", "diff"];

    pub const CANVAS: &[&str] = &["composite", "capture", "export", "diff"];

    pub const SCENES: &[&str] = &["composite", "capture", "stream"];

    pub const EFFECTS: &[&str] = &["apply", "list", "info", "register"];
}
