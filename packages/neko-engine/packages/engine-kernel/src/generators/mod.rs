//! Procedural generators that depend on engine-kernel infrastructure (fonts, etc.).
//!
//! Shape primitives live in `neko-runtime-scene::procedural`; generators here
//! require heavier deps such as `cosmic-text` and therefore stay in engine-kernel.

pub mod text_mesh;
