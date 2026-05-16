//! Runtime-scene architecture dependency guardrails.

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(root: &Path) -> Vec<PathBuf> {
    if root.is_file() {
        return if root.extension().is_some_and(|ext| ext == "rs") {
            vec![root.to_path_buf()]
        } else {
            Vec::new()
        };
    }

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

fn packages_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("runtime-scene has a parent packages directory")
        .to_path_buf()
}

#[test]
fn runtime_scene_manifest_stays_below_kernel_and_gpu() {
    let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "neko-engine-gpu",
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
        "host-api",
        "host-http",
        "host-napi",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on `{}`",
            manifest_path.display(),
            forbidden
        );
    }
}

#[test]
fn text_mesh_generation_stays_runtime_scene_owned_and_gpu_free() {
    let text_mesh = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/text_mesh.rs");
    assert!(text_mesh.exists(), "runtime-scene must own text_mesh.rs");

    let source = fs::read_to_string(&text_mesh)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", text_mesh.display(), err));
    for forbidden in [
        "neko_engine_kernel",
        "neko_engine_gpu",
        "wgpu",
        "GpuContext",
        "crate::services",
    ] {
        assert!(
            !source.contains(forbidden),
            "{} must not contain forbidden text mesh dependency pattern `{}`",
            text_mesh.display(),
            forbidden
        );
    }
}

#[test]
fn runtime_scene_sources_do_not_import_kernel() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    for file in rust_files(&src_dir) {
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
fn engine_kernel_no_longer_owns_text_mesh_generator() {
    let kernel_generator = packages_dir().join("engine-kernel/src/generators");
    assert!(
        !kernel_generator.exists(),
        "{} must remain removed; text mesh belongs to runtime-scene",
        kernel_generator.display()
    );
}
