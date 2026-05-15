//! Architecture dependency guardrails.

use std::fs;
use std::path::{Path, PathBuf};

const APPROVED_KERNEL_PUBLIC_MODULES: &[&str] =
    &["contracts", "error", "facade", "telemetry", "prelude"];

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

fn assert_no_pattern(root: &str, forbidden: &[&str]) {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let root_path = manifest_dir.join(root);
    for file in rust_files(&root_path) {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must not contain forbidden dependency pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

fn packages_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .to_path_buf()
}

fn workspace_manifest() -> PathBuf {
    packages_dir()
        .parent()
        .expect("packages directory has a workspace root")
        .join("Cargo.toml")
}

fn relative_to_packages(path: &Path) -> String {
    path.strip_prefix(packages_dir())
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[test]
fn gpu_module_does_not_depend_on_services() {
    assert_no_pattern("src/gpu", &["crate::services", "use crate::services"]);
}

#[test]
fn engine_gpu_crate_exists_and_is_workspace_member() {
    let packages_dir = packages_dir();
    assert!(
        packages_dir.join("engine-gpu").exists(),
        "extract-engine-gpu-core must create packages/engine-gpu"
    );

    let manifest = fs::read_to_string(workspace_manifest())
        .unwrap_or_else(|err| panic!("failed to read workspace manifest: {}", err));
    assert!(
        manifest.contains("\"packages/engine-gpu\""),
        "workspace must list packages/engine-gpu"
    );
}

#[test]
fn engine_gpu_cargo_toml_avoids_forbidden_crates() {
    let gpu_manifest = packages_dir().join("engine-gpu/Cargo.toml");
    let manifest = fs::read_to_string(&gpu_manifest)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", gpu_manifest.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "neko-engine-codec",
        "neko-engine-audio",
        "services",
        "export",
        "preview",
        "domain",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on forbidden crate/module `{}`",
            gpu_manifest.display(),
            forbidden
        );
    }
}

#[test]
fn engine_gpu_sources_avoid_kernel_orchestration_and_renderer_companions() {
    let gpu_src = packages_dir().join("engine-gpu/src");
    let forbidden = [
        "neko_engine_kernel",
        "neko_engine_codec",
        "neko_engine_audio",
        "crate::services",
        "crate::export",
        "crate::preview",
        "crate::domain",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
        "scene_renderer",
        "puppet_renderer",
        "panoramic_renderer",
    ];

    for file in rust_files(&gpu_src) {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must not contain forbidden GPU boundary pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

#[test]
fn kernel_gpu_module_documents_temporary_reexports_and_companion_shims() {
    let gpu_mod = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/gpu/mod.rs");
    let source = fs::read_to_string(&gpu_mod)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", gpu_mod.display(), err));

    assert!(!source.contains("pub use neko_engine_gpu::*"));
    assert!(source.contains("pub use neko_engine_gpu::{"));
    assert!(source.contains("pub use neko_engine_scene_renderer::"));
    assert!(source.contains("pub use neko_engine_puppet_renderer::"));
    assert!(source.contains("pub use neko_engine_panoramic_renderer::"));
    assert!(source.contains("pub mod scene_renderer"));
    assert!(source.contains("Temporary GPU compatibility surface"));
}

#[test]
fn kernel_public_modules_are_allowlisted() {
    let lib_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs");
    let source = fs::read_to_string(&lib_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", lib_rs.display(), err));

    for line in source.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("pub mod ") {
            let module = rest.trim_end_matches(';').trim_end_matches(" {").trim();
            assert!(
                APPROVED_KERNEL_PUBLIC_MODULES.contains(&module),
                "engine-kernel public module `{}` must be reviewed and added to the facade allowlist",
                module
            );
        }
    }

    for forbidden in ["pub use neko_runtime_puppet::world::PuppetDelta;"] {
        assert!(
            !source.contains(forbidden),
            "engine-kernel root must keep domain shortcuts behind `contracts`, not `{}`",
            forbidden
        );
    }
}

#[test]
fn kernel_gpu_compatibility_exports_avoid_glob_reexports() {
    let gpu_mod = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/gpu/mod.rs");
    let source = fs::read_to_string(&gpu_mod)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", gpu_mod.display(), err));

    for forbidden in [
        "pub use neko_engine_gpu::*",
        "pub use neko_engine_scene_renderer::*;",
        "pub use neko_engine_puppet_renderer::*;",
        "pub use neko_engine_panoramic_renderer::*;",
    ] {
        assert!(
            !source.contains(forbidden),
            "{} must not contain broad compatibility export `{}`",
            gpu_mod.display(),
            forbidden
        );
    }
}

#[test]
fn host_crates_use_kernel_facade_or_contract_paths() {
    let packages_dir = packages_dir();
    let host_roots = [
        packages_dir.join("host-api/src"),
        packages_dir.join("host-http/src"),
        packages_dir.join("host-napi/src"),
    ];
    let forbidden = [
        "neko_engine_kernel::services::",
        "neko_engine_kernel::domain::",
        "neko_engine_kernel::media_service::",
        "neko_engine_kernel::gpu::",
        "neko_engine_kernel::encoder::",
        "neko_engine_kernel::decoder::",
        "neko_engine_kernel::audio::",
        "neko_engine_kernel::jvi::",
        "neko_engine_kernel::export::",
        "neko_engine_kernel::preview::",
        "neko_engine_kernel::PuppetDelta",
    ];

    for root in host_roots {
        for file in rust_files(&root) {
            let source = fs::read_to_string(&file)
                .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
            for pattern in forbidden {
                assert!(
                    !source.contains(pattern),
                    "{} must use `neko_engine_kernel::contracts` or `facade`, not `{}`",
                    relative_to_packages(&file),
                    pattern
                );
            }
        }
    }
}

#[test]
fn host_production_code_does_not_construct_kernel_services_directly() {
    let packages_dir = packages_dir();
    let host_roots = [
        packages_dir.join("host-api/src"),
        packages_dir.join("host-http/src"),
        packages_dir.join("host-napi/src"),
    ];
    let forbidden = [
        "TaskService::new(",
        "TimelineService::new(",
        "VideoService::new(",
        "AudioService::new(",
        "ImageService::new(",
        "NodeService::new(",
        "SceneService::new(",
        "PuppetService::new(",
        "ExportService::new(",
        "EffectsService::new(",
    ];

    for root in host_roots {
        for file in rust_files(&root) {
            let source = fs::read_to_string(&file)
                .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
            for pattern in forbidden {
                assert!(
                    !source.contains(pattern),
                    "{} must use `ServiceFactory`, facade helpers, or explicit fakes instead of `{}`",
                    relative_to_packages(&file),
                    pattern
                );
            }
        }
    }
}

#[test]
fn kernel_services_facade_exposes_trait_objects_for_service_handles() {
    let facade_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/facade.rs");
    let source = fs::read_to_string(&facade_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", facade_rs.display(), err));

    for required in [
        "pub task_service: Arc<dyn ITaskService>",
        "pub node_service: Arc<dyn INodeService>",
        "pub video_service: Arc<dyn IVideoService>",
        "pub audio_service: Arc<dyn IAudioService>",
        "pub image_service: Arc<dyn IImageService>",
        "pub timeline_service: Arc<dyn ITimelineService>",
        "pub export_service: Option<Arc<dyn IExportService>>",
        "pub effects_service: Option<Arc<dyn IEffectsService>>",
        "pub scene_service: Option<Arc<dyn ISceneService>>",
        "pub puppet_service: Option<Arc<dyn IPuppetService>>",
    ] {
        assert!(
            source.contains(required),
            "KernelServices must expose trait-object service handle `{}`",
            required
        );
    }

    for forbidden in [
        "pub task_service: Arc<TaskService>",
        "pub node_service: Arc<NodeService>",
        "pub video_service: Arc<VideoService>",
        "pub audio_service: Arc<AudioService>",
        "pub image_service: Arc<ImageService>",
        "pub timeline_service: Arc<TimelineService>",
        "pub export_service: Option<Arc<ExportService>>",
        "pub effects_service: Option<Arc<EffectsService>>",
        "pub scene_service: Option<Arc<SceneService>>",
        "pub puppet_service: Option<Arc<PuppetService>>",
    ] {
        assert!(
            !source.contains(forbidden),
            "KernelServices must not expose concrete service handle `{}`",
            forbidden
        );
    }
}

#[test]
fn host_controllers_store_trait_service_handles() {
    let controllers_dir = packages_dir().join("host-api/src/controllers");
    let forbidden = [
        "Arc<TaskService>",
        "Arc<NodeService>",
        "Arc<VideoService>",
        "Arc<AudioService>",
        "Arc<ImageService>",
        "Arc<TimelineService>",
        "Arc<ExportService>",
        "Arc<EffectsService>",
        "Arc<SceneService>",
        "Arc<PuppetService>",
        "Option<Arc<ExportService>>",
        "Option<Arc<EffectsService>>",
        "Option<Arc<SceneService>>",
        "Option<Arc<PuppetService>>",
    ];

    for file in rust_files(&controllers_dir) {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must store service traits from KernelServices, not concrete handle `{}`",
                relative_to_packages(&file),
                pattern
            );
        }
    }
}

#[test]
fn contracts_services_do_not_reexport_concrete_kernel_services() {
    let contracts_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/contracts.rs");
    let source = fs::read_to_string(&contracts_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", contracts_rs.display(), err));

    let service_section = source
        .split("pub mod services {")
        .nth(1)
        .and_then(|rest| rest.split("/// Runtime puppet contracts").next())
        .expect("contracts.rs must contain services contract module");

    let root_services_export = service_section
        .split("pub use crate::services::{")
        .nth(1)
        .and_then(|rest| rest.split("};").next())
        .expect("contracts::services must contain root service trait exports");
    let exported_idents: Vec<&str> = root_services_export
        .split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '_')
        .filter(|token| !token.is_empty())
        .collect();

    for forbidden in [
        "AudioService",
        "EffectsService",
        "ExportService",
        "ImageService",
        "NodeService",
        "PuppetService",
        "SceneService",
        "TaskService",
        "TimelineService",
        "VideoService",
    ] {
        assert!(
            !exported_idents.contains(&forbidden)
                && !service_section.contains(&format!("pub use crate::services::{};", forbidden)),
            "contracts::services must expose service traits, not concrete `{}`",
            forbidden
        );
    }

    for allowed_exception in ["EffectRegistry", "PipelineSink", "StreamSink"] {
        assert!(
            exported_idents.contains(&allowed_exception),
            "contracts::services should keep explicit non-service exception `{}`",
            allowed_exception
        );
    }
}

#[test]
fn renderer_companion_crates_exist_and_are_workspace_members() {
    let packages_dir = packages_dir();
    for crate_dir in [
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
        "engine-export-renderer",
    ] {
        assert!(
            packages_dir.join(crate_dir).exists(),
            "renderer companion crate `{}` must exist",
            crate_dir
        );
    }

    let manifest = fs::read_to_string(workspace_manifest())
        .unwrap_or_else(|err| panic!("failed to read workspace manifest: {}", err));
    for member in [
        "\"packages/engine-scene-renderer\"",
        "\"packages/engine-puppet-renderer\"",
        "\"packages/engine-panoramic-renderer\"",
        "\"packages/engine-export-renderer\"",
    ] {
        assert!(
            manifest.contains(member),
            "workspace must list renderer companion member {}",
            member
        );
    }
}

#[test]
fn renderer_companion_manifests_avoid_kernel_and_host_crates() {
    let packages_dir = packages_dir();
    for crate_dir in [
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
        "engine-export-renderer",
    ] {
        let manifest_path = packages_dir.join(crate_dir).join("Cargo.toml");
        let manifest = fs::read_to_string(&manifest_path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));
        for forbidden in [
            "neko-engine-kernel",
            "host-api",
            "host-http",
            "host-napi",
            "host-cli",
        ] {
            assert!(
                !manifest.contains(forbidden),
                "{} must not depend on `{}`",
                manifest_path.display(),
                forbidden
            );
        }
    }
}

#[test]
fn runtime_scene_and_puppet_remain_gpu_free() {
    let packages_dir = packages_dir();
    for crate_dir in ["runtime-scene", "runtime-puppet"] {
        let manifest_path = packages_dir.join(crate_dir).join("Cargo.toml");
        let manifest = fs::read_to_string(&manifest_path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));
        for forbidden in [
            "wgpu",
            "neko-engine-gpu",
            "engine-scene-renderer",
            "engine-puppet-renderer",
            "engine-panoramic-renderer",
            "neko-engine-kernel",
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
}

#[test]
fn domain_module_does_not_depend_on_gpu() {
    assert_no_pattern("src/domain", &["crate::gpu", "use crate::gpu"]);
}

#[test]
fn export_module_does_not_depend_on_service_impls() {
    assert_no_pattern(
        "src/export",
        &["crate::services::impls", "use crate::services::impls"],
    );
}

#[test]
fn export_service_uses_backend_adapters_for_concrete_construction() {
    assert_no_pattern(
        "src/export/service.rs",
        &[
            "GpuExportPipeline::new",
            "AudioMixer::new",
            "FfmpegAudioEncoder::new",
            "AsyncExportPipeline::start",
            "AsyncExportPipeline::start_encode_only",
            "MuxerSink::new",
        ],
    );
}

#[test]
fn preview_orchestration_uses_backend_adapters_for_stream_rendering() {
    assert_no_pattern(
        "src/services/impls/timeline.rs",
        &["PreviewPipeline::new", "GpuExportPipeline::new"],
    );
}

#[test]
fn preview_module_keeps_renderer_internals_behind_backend_adapters() {
    assert_no_pattern(
        "src/preview",
        &[
            "crate::gpu::scene_renderer",
            "crate::gpu::puppet_renderer",
            "SceneRenderer::new",
            "PuppetRenderer::new",
        ],
    );
}

#[test]
fn encoder_module_does_not_import_audio_encoder_config_from_audio() {
    assert_no_pattern(
        "src/encoder",
        &[
            "crate::audio::AudioEncoderConfig",
            "use crate::audio::{AudioEncoderConfig",
            "use crate::audio::{ AudioEncoderConfig",
        ],
    );
}

#[test]
fn gpu_compositor_does_not_expose_duplicate_blend_mode_enum() {
    assert_no_pattern("src/gpu", &["pub enum BlendMode"]);
}

#[test]
fn engine_types_does_not_gain_implementation_dependencies() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let types_manifest = manifest_dir
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .join("engine-types/Cargo.toml");
    let manifest = fs::read_to_string(&types_manifest)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", types_manifest.display(), err));

    for forbidden in [
        "wgpu",
        "ffmpeg",
        "tokio",
        "neko-engine-kernel",
        "neko-engine-audio",
        "host-api",
        "host-http",
        "host-napi",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on implementation crate `{}`",
            types_manifest.display(),
            forbidden
        );
    }
}

#[test]
fn engine_codec_does_not_depend_on_kernel_or_host_crates() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let codec_manifest = manifest_dir
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .join("engine-codec/Cargo.toml");
    let manifest = fs::read_to_string(&codec_manifest)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", codec_manifest.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "engine-gpu",
        "engine-audio",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on orchestration crate `{}`",
            codec_manifest.display(),
            forbidden
        );
    }
}

#[test]
fn engine_codec_sources_do_not_import_kernel_or_orchestration_modules() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let codec_src = manifest_dir
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .join("engine-codec/src");
    let forbidden = [
        "neko_engine_kernel",
        "crate::services",
        "crate::export",
        "crate::preview",
        "crate::domain",
        "crate::gpu",
        "GpuContext",
        "GpuCompositor",
        "GpuLayer",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
    ];

    for file in rust_files(&codec_src) {
        if file
            .file_name()
            .is_some_and(|name| name == "architecture_tests.rs")
        {
            continue;
        }
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must not contain forbidden dependency pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

#[test]
fn engine_audio_does_not_depend_on_kernel_or_host_crates() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let audio_manifest = manifest_dir
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .join("engine-audio/Cargo.toml");
    let manifest = fs::read_to_string(&audio_manifest)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", audio_manifest.display(), err));

    for forbidden in [
        "neko-engine-kernel",
        "host-api",
        "host-http",
        "host-napi",
        "host-cli",
        "engine-gpu",
        "services",
        "export",
        "preview",
    ] {
        assert!(
            !manifest.contains(forbidden),
            "{} must not depend on orchestration crate `{}`",
            audio_manifest.display(),
            forbidden
        );
    }
}

#[test]
fn engine_audio_sources_do_not_import_kernel_or_orchestration_modules() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let audio_src = manifest_dir
        .parent()
        .expect("engine-kernel has a parent packages directory")
        .join("engine-audio/src");
    let forbidden = [
        "neko_engine_kernel",
        "crate::services",
        "crate::export",
        "crate::preview",
        "crate::domain",
        "crate::gpu",
        "GpuContext",
        "GpuCompositor",
        "GpuLayer",
        "PanoramicRenderer",
        "PuppetRenderer",
        "host_api",
        "host_http",
        "host_napi",
        "host_cli",
    ];

    for file in rust_files(&audio_src) {
        if file
            .file_name()
            .is_some_and(|name| name == "architecture_tests.rs")
        {
            continue;
        }
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        for pattern in forbidden {
            assert!(
                !source.contains(pattern),
                "{} must not contain forbidden dependency pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

#[test]
fn encoder_pipeline_is_only_kernel_owned_mixed_gpu_codec_boundary() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let encoder_root = manifest_dir.join("src/encoder");
    let allowed = encoder_root.join("pipeline.rs");

    for file in rust_files(&encoder_root) {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        let imports_gpu = source.contains("crate::gpu")
            || source.contains("GpuContext")
            || source.contains("GpuCompositor")
            || source.contains("GpuLayer");
        assert!(
            !imports_gpu || file == allowed,
            "{} must not own mixed GPU/codec orchestration; keep that boundary in {}",
            file.display(),
            allowed.display()
        );
    }
}
