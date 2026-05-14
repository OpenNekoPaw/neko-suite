//! Plugin system — manifest schema, plugin manager, and controller.
//!
//! See [engine-plugin-rfc.md](../../../docs/architecture/engine-plugin-rfc.md)
//! for the full architecture design.

pub mod audit;
pub mod effect_registry_activator;
pub mod governance;
pub mod manager;
pub mod manifest;
pub mod system_info;

pub use audit::{
    PluginAuditContext, PluginAuditReporter, PluginAuditor, PluginPermissionAuditEvent,
};
pub use effect_registry_activator::EffectRegistryActivator;
pub use governance::{
    PluginLicenseDecision, PluginLoadAuthority, PluginLoadError, PluginLoadGate, PluginLoadRecord,
    PluginLoadResult, PluginTrustTier, WorkspaceTrustLevel, NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE,
};
pub use manager::{LoadedPlugin, PluginActivationHandler, PluginManager, PluginState};
pub use manifest::{
    EnginePluginManifest, PluginKind, PluginMachineBinding, PluginParam, PluginParamOption,
    PluginRuntimeArtifact, PluginSignatureInfo, PluginSourceKind,
};
pub use system_info::PluginSystemInfo;
