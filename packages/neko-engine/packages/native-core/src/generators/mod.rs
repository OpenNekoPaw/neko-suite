//! Procedural generators that depend on native-core infrastructure (fonts, etc.).
//!
//! Shape primitives live in `neko-native-scene::procedural`; generators here
//! require heavier deps such as `cosmic-text` and therefore stay in native-core.

pub mod text_mesh;

pub use text_mesh::{generate_text_mesh, TextMeshError, TextMeshParams};
