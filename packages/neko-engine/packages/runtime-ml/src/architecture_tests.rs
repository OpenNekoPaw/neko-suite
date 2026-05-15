//! Architecture dependency guardrails for runtime-ml.

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
fn runtime_ml_does_not_depend_on_kernel() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let manifest_path = manifest_dir.join("Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

    assert!(
        !manifest.contains("neko-engine-kernel"),
        "runtime-ml must not depend upward on engine-kernel"
    );
}

#[test]
fn runtime_ml_sources_do_not_import_kernel() {
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
        assert!(
            !source.contains("neko_engine_kernel"),
            "{} must not import engine-kernel",
            file.display()
        );
    }
}

#[test]
fn runtime_ml_service_instantiates_without_kernel_facade() {
    let service = crate::MlService::new(1, crate::DeviceSelection::Cpu);
    let models = crate::IMlService::list_models(&service);
    assert!(models.is_empty());
}
