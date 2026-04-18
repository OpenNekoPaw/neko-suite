//! Plugin system — manifest schema, plugin manager, and controller.
//!
//! See [engine-plugin-rfc.md](../../../docs/architecture/engine-plugin-rfc.md)
//! for the full architecture design.

pub mod manager;
pub mod manifest;

pub use manager::{LoadedPlugin, PluginActivationHandler, PluginManager, PluginState};
pub use manifest::{EnginePluginManifest, PluginKind};
