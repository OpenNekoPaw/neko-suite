//! Signature verification boundary for native plugin load gates.

use super::manifest::{EnginePluginManifest, PluginSignatureInfo};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Explicit signature verification result consumed by native load gates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SignatureVerificationOutcome {
    Valid,
    Invalid(String),
    Missing(String),
    UnsupportedAlgorithm(String),
    Unavailable(String),
}

impl SignatureVerificationOutcome {
    pub fn is_valid(&self) -> bool {
        matches!(self, Self::Valid)
    }

    pub fn message(&self) -> Option<&str> {
        match self {
            Self::Valid => None,
            Self::Invalid(message)
            | Self::Missing(message)
            | Self::UnsupportedAlgorithm(message)
            | Self::Unavailable(message) => Some(message),
        }
    }
}

/// Verifier seam for Ed25519 or future marketplace signature providers.
pub trait PluginSignatureVerifier: Send + Sync {
    fn verify(
        &self,
        manifest: &EnginePluginManifest,
        install_path: &Path,
    ) -> SignatureVerificationOutcome;
}

/// Conservative verifier used until marketplace key material is configured.
#[derive(Debug, Default)]
pub struct DefaultPluginSignatureVerifier;

impl PluginSignatureVerifier for DefaultPluginSignatureVerifier {
    fn verify(
        &self,
        manifest: &EnginePluginManifest,
        _install_path: &Path,
    ) -> SignatureVerificationOutcome {
        let Some(signature) = &manifest.signature else {
            return SignatureVerificationOutcome::Missing(
                "native plugin requires engine-verifiable signature metadata".to_string(),
            );
        };

        validate_signature_shape(signature)
    }
}

fn validate_signature_shape(signature: &PluginSignatureInfo) -> SignatureVerificationOutcome {
    if signature.algorithm.trim().is_empty() || signature.value.trim().is_empty() {
        return SignatureVerificationOutcome::Invalid(
            "signature metadata is incomplete".to_string(),
        );
    }

    if !signature.algorithm.eq_ignore_ascii_case("ed25519") {
        return SignatureVerificationOutcome::UnsupportedAlgorithm(format!(
            "unsupported signature algorithm `{}`",
            signature.algorithm
        ));
    }

    SignatureVerificationOutcome::Unavailable(
        "ed25519 verification backend is not configured".to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::{PluginKind, PluginSourceKind};

    fn manifest(signature: Option<PluginSignatureInfo>) -> EnginePluginManifest {
        EnginePluginManifest {
            id: "plugin.test".to_string(),
            name: "Plugin Test".to_string(),
            version: "1.0.0".to_string(),
            kind: PluginKind::Connector,
            engine_version: "^0.1.0".to_string(),
            platforms: Vec::new(),
            capabilities: Vec::new(),
            permissions: Vec::new(),
            runtime_artifacts: Vec::new(),
            entry_point: None,
            api_version: None,
            target_triple: None,
            source: PluginSourceKind::Registry,
            trust_tier: Default::default(),
            signature,
            machine_binding: None,
            integrity: None,
            description: None,
            author: None,
            license: None,
        }
    }

    #[test]
    fn default_verifier_reports_missing_signature() {
        let outcome = DefaultPluginSignatureVerifier.verify(&manifest(None), Path::new("."));
        assert!(matches!(outcome, SignatureVerificationOutcome::Missing(_)));
    }

    #[test]
    fn default_verifier_reports_invalid_signature_shape() {
        let outcome = DefaultPluginSignatureVerifier.verify(
            &manifest(Some(PluginSignatureInfo {
                algorithm: "ed25519".to_string(),
                value: String::new(),
                signed_by: None,
                public_key_id: None,
            })),
            Path::new("."),
        );
        assert!(matches!(outcome, SignatureVerificationOutcome::Invalid(_)));
    }

    #[test]
    fn default_verifier_reports_unsupported_algorithm() {
        let outcome = DefaultPluginSignatureVerifier.verify(
            &manifest(Some(PluginSignatureInfo {
                algorithm: "rsa".to_string(),
                value: "sig".to_string(),
                signed_by: None,
                public_key_id: None,
            })),
            Path::new("."),
        );
        assert!(matches!(
            outcome,
            SignatureVerificationOutcome::UnsupportedAlgorithm(_)
        ));
    }

    #[test]
    fn default_verifier_reports_unavailable_backend_for_ed25519() {
        let outcome = DefaultPluginSignatureVerifier.verify(
            &manifest(Some(PluginSignatureInfo {
                algorithm: "ed25519".to_string(),
                value: "sig".to_string(),
                signed_by: None,
                public_key_id: None,
            })),
            Path::new("."),
        );
        assert!(matches!(
            outcome,
            SignatureVerificationOutcome::Unavailable(_)
        ));
    }

    struct AlwaysValidVerifier;

    impl PluginSignatureVerifier for AlwaysValidVerifier {
        fn verify(
            &self,
            _manifest: &EnginePluginManifest,
            _install_path: &Path,
        ) -> SignatureVerificationOutcome {
            SignatureVerificationOutcome::Valid
        }
    }

    #[test]
    fn injected_verifier_can_return_valid_result() {
        let outcome = AlwaysValidVerifier.verify(&manifest(None), Path::new("."));
        assert_eq!(outcome, SignatureVerificationOutcome::Valid);
        assert!(outcome.is_valid());
    }
}
