//! Architecture dependency guardrails for export renderer support extraction.

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(root: &Path) -> Vec<PathBuf> {
    let mut pending = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(path) = pending.pop() {
        let entries = fs::read_dir(&path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", path.display(), err));
        for entry in entries {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                files.push(path);
            }
        }
    }

    files
}

#[test]
fn export_renderer_manifest_avoids_kernel_and_host_crates() {
    let manifest = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml"))
        .expect("read export renderer manifest");
    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "export renderer support must not depend on `{}`",
            forbidden
        );
    }
}

#[test]
fn export_renderer_sources_avoid_kernel_and_orchestration_modules() {
    let source_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    for file in rust_files(&source_root) {
        if file
            .file_name()
            .is_some_and(|name| name == "architecture_tests.rs")
        {
            continue;
        }
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for forbidden in [
            "neko_engine_kernel",
            "crate::services",
            "crate::export",
            "crate::preview",
            "crate::domain",
            "host_api",
            "host_http",
            "host_napi",
            "host_cli",
        ] {
            assert!(
                !source.contains(forbidden),
                "{} must not contain forbidden dependency pattern `{}`",
                file.display(),
                forbidden
            );
        }
    }
}
