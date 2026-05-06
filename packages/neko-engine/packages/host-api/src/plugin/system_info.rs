//! Coarse-grained system information exposed to plugin callers.

use serde::{Deserialize, Serialize};

/// Compatibility-oriented system information for plugins.
///
/// The shape intentionally avoids precise device IDs, serial numbers, MAC
/// addresses, hostnames, usernames, and other stable fingerprinting values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSystemInfo {
    pub os_family: String,
    pub arch_family: String,
    pub cpu_family: String,
    pub gpu_vendor: Option<String>,
}

pub fn coarse_system_info() -> PluginSystemInfo {
    PluginSystemInfo {
        os_family: os_family().to_string(),
        arch_family: arch_family().to_string(),
        cpu_family: cpu_family().to_string(),
        gpu_vendor: None,
    }
}

fn os_family() -> &'static str {
    match std::env::consts::OS {
        "macos" | "ios" => "apple",
        "windows" => "windows",
        "linux" | "android" => "linux",
        "freebsd" | "openbsd" | "netbsd" => "bsd",
        _ => "other",
    }
}

fn arch_family() -> &'static str {
    match std::env::consts::ARCH {
        "x86" | "x86_64" => "x86",
        "arm" | "aarch64" => "arm",
        "wasm32" | "wasm64" => "wasm",
        _ => "other",
    }
}

fn cpu_family() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "x86" => "x86",
        "aarch64" => "arm64",
        "arm" => "arm",
        _ => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coarse_system_info_has_no_precise_identifiers() {
        let info = coarse_system_info();
        let serialized = serde_json::to_string(&info).unwrap();

        assert!(!serialized.contains("hostname"));
        assert!(!serialized.contains("serial"));
        assert!(!serialized.contains("machineId"));
        assert!(!serialized.contains("macAddress"));
    }
}
