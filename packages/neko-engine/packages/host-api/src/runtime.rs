//! RuntimeDescriptor trait — enables dynamic runtime discovery.
//!
//! Each runtime crate implements this trait to declare its identity,
//! version, and capabilities. The host can query registered runtimes
//! without hardcoding knowledge of specific crate names.

use serde::Serialize;

/// Descriptor for a runtime module.
pub trait RuntimeDescriptor: Send + Sync {
    /// Unique runtime identifier (e.g. "scene", "puppet", "device", "ml", "media")
    fn name(&self) -> &str;

    /// Runtime version (SemVer)
    fn version(&self) -> &str;

    /// Capability tags this runtime provides
    fn capabilities(&self) -> &[&str];

    /// Action groups this runtime handles (maps to registry groups)
    fn groups(&self) -> &[&str] {
        &[]
    }
}

impl<T: RuntimeDescriptor + ?Sized> RuntimeDescriptor for Box<T> {
    fn name(&self) -> &str {
        (**self).name()
    }
    fn version(&self) -> &str {
        (**self).version()
    }
    fn capabilities(&self) -> &[&str] {
        (**self).capabilities()
    }
    fn groups(&self) -> &[&str] {
        (**self).groups()
    }
}

/// Runtime info for serialization (API responses)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub groups: Vec<String>,
}

impl<T: RuntimeDescriptor> From<&T> for RuntimeInfo {
    fn from(desc: &T) -> Self {
        RuntimeInfo {
            name: desc.name().to_string(),
            version: desc.version().to_string(),
            capabilities: desc.capabilities().iter().map(|s| s.to_string()).collect(),
            groups: desc.groups().iter().map(|s| s.to_string()).collect(),
        }
    }
}

/// Registry of all active runtimes.
pub struct RuntimeRegistry {
    runtimes: Vec<Box<dyn RuntimeDescriptor>>,
}

impl RuntimeRegistry {
    pub fn new() -> Self {
        Self {
            runtimes: Vec::new(),
        }
    }

    /// Register a runtime descriptor.
    pub fn register(&mut self, descriptor: Box<dyn RuntimeDescriptor>) {
        tracing::info!(name = descriptor.name(), "Runtime registered");
        self.runtimes.push(descriptor);
    }

    /// List all registered runtimes.
    pub fn list(&self) -> Vec<RuntimeInfo> {
        self.runtimes.iter().map(RuntimeInfo::from).collect()
    }

    /// Find a runtime by name.
    pub fn get(&self, name: &str) -> Option<&dyn RuntimeDescriptor> {
        self.runtimes
            .iter()
            .find(|r| r.name() == name)
            .map(|r| r.as_ref())
    }

    /// Get all capability tags across all runtimes.
    pub fn all_capabilities(&self) -> Vec<String> {
        let mut caps: Vec<String> = self
            .runtimes
            .iter()
            .flat_map(|r| r.capabilities().iter().map(|s| s.to_string()))
            .collect();
        caps.sort();
        caps.dedup();
        caps
    }
}

impl Default for RuntimeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestRuntime;

    impl RuntimeDescriptor for TestRuntime {
        fn name(&self) -> &str {
            "test"
        }
        fn version(&self) -> &str {
            "0.1.0"
        }
        fn capabilities(&self) -> &[&str] {
            &["video-diff", "audio-diff"]
        }
        fn groups(&self) -> &[&str] {
            &["videos", "audios"]
        }
    }

    #[test]
    fn test_register_and_list() {
        let mut registry = RuntimeRegistry::new();
        registry.register(Box::new(TestRuntime));
        let list = registry.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "test");
        assert_eq!(list[0].capabilities, vec!["video-diff", "audio-diff"]);
    }

    #[test]
    fn test_get_by_name() {
        let mut registry = RuntimeRegistry::new();
        registry.register(Box::new(TestRuntime));
        assert!(registry.get("test").is_some());
        assert!(registry.get("nonexistent").is_none());
    }

    #[test]
    fn test_all_capabilities() {
        let mut registry = RuntimeRegistry::new();
        registry.register(Box::new(TestRuntime));
        let caps = registry.all_capabilities();
        assert_eq!(caps, vec!["audio-diff", "video-diff"]);
    }

    #[test]
    fn test_runtime_info_serialization() {
        let info = RuntimeInfo {
            name: "media".into(),
            version: "0.1.0".into(),
            capabilities: vec!["probe".into(), "diff".into()],
            groups: vec!["videos".into()],
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"name\":\"media\""));
    }
}
