//! Architecture dependency guardrails.

use std::fs;
use std::path::{Path, PathBuf};

const APPROVED_KERNEL_PUBLIC_MODULES: &[&str] = &[
    "contracts",
    "error",
    "facade",
    "live_compositor",
    "telemetry",
    "prelude",
];

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

fn engine_root() -> PathBuf {
    packages_dir()
        .parent()
        .expect("packages directory has an engine root")
        .to_path_buf()
}

fn relative_to_packages(path: &Path) -> String {
    path.strip_prefix(packages_dir())
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
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
        "neko_runtime_scene",
        "neko_runtime_puppet",
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
        "Live2D",
        "MOC3",
        "moc3",
    ];

    for file in rust_files(&gpu_src) {
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
                "{} must not contain forbidden GPU boundary pattern `{}`",
                file.display(),
                pattern
            );
        }
    }
}

#[test]
fn engine_gpu_morph_compute_is_domain_neutral() {
    let morph_compute = packages_dir().join("engine-gpu/src/morph_compute.rs");
    let source = fs::read_to_string(&morph_compute)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", morph_compute.display(), err));

    for forbidden in [
        "neko_runtime_scene",
        "neko_runtime_puppet",
        "neko_engine_scene_renderer",
        "neko_engine_puppet_renderer",
        "SceneNode",
        "Bone2D",
        "BlendShapeSet",
        "AnimationClip2D",
        "Live2D",
        "MOC3",
        "moc3",
        "bevy_ecs",
    ] {
        assert!(
            !source.contains(forbidden),
            "{} must keep shared morph compute domain-neutral; found `{}`",
            relative_to_packages(&morph_compute),
            forbidden
        );
    }
}

#[test]
fn bevy_reuse_policy_documents_current_allowlist_and_glam_gate() {
    let policy_path = engine_root().join("BEVY_REUSE_POLICY.md");
    let policy = fs::read_to_string(&policy_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", policy_path.display(), err));

    for required in [
        "bevy_ecs = 0.15",
        "bevy_tasks = 0.15",
        "bevy_math",
        "TODO(P1)",
        "glam = 0.29",
        "bevy_app",
        "bevy_render",
        "bevy_window",
        "bevy_asset",
    ] {
        assert!(
            policy.contains(required),
            "{} must document Bevy reuse policy item `{}`",
            policy_path.display(),
            required
        );
    }
}

#[test]
fn runtime_and_renderer_manifests_only_use_approved_bevy_crates() {
    let packages_dir = packages_dir();
    let crate_dirs = [
        "engine-gpu",
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "runtime-scene",
        "runtime-puppet",
    ];
    let forbidden = [
        "bevy_app",
        "bevy_render",
        "bevy_window",
        "bevy_asset",
        "bevy_pbr",
        "bevy_winit",
        "bevy_sprite",
        "bevy_scene",
        "bevy_core_pipeline",
        "bevy_animation",
        "bevy_math",
    ];

    for crate_dir in crate_dirs {
        let manifest_path = packages_dir.join(crate_dir).join("Cargo.toml");
        let manifest = fs::read_to_string(&manifest_path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));
        for forbidden_crate in forbidden {
            assert!(
                !manifest.contains(forbidden_crate),
                "{} must not depend on disallowed Bevy crate `{}`",
                manifest_path.display(),
                forbidden_crate
            );
        }
    }
}

#[test]
fn runtime_and_renderer_sources_do_not_adopt_full_bevy_runtime() {
    let packages_dir = packages_dir();
    let source_roots = [
        packages_dir.join("engine-gpu/src"),
        packages_dir.join("engine-scene-renderer/src"),
        packages_dir.join("engine-puppet-renderer/src"),
        packages_dir.join("runtime-scene/src"),
        packages_dir.join("runtime-puppet/src"),
    ];
    let forbidden = [
        "bevy_app",
        "bevy_render",
        "bevy_window",
        "bevy_asset",
        "bevy_pbr",
        "bevy_winit",
        "bevy_sprite",
        "bevy_scene::",
        "bevy_core_pipeline",
        "bevy_animation::",
        "bevy_math::",
        "App::new(",
        "Schedule::default(",
        "Schedule::new(",
        "AssetServer",
        "WindowPlugin",
    ];

    for root in source_roots {
        for file in rust_files(&root) {
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
                    "{} must not contain full Bevy runtime pattern `{}`",
                    relative_to_packages(&file),
                    pattern
                );
            }
        }
    }
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
fn host_http_uses_kernel_scene_contracts_instead_of_runtime_scene_dependency() {
    let packages_dir = packages_dir();
    let manifest_path = packages_dir.join("host-http/Cargo.toml");
    let manifest = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));
    assert!(
        !manifest.contains("neko-runtime-scene"),
        "{} must consume scene DTOs through engine-kernel contracts",
        manifest_path.display()
    );

    let host_http_src = packages_dir.join("host-http/src");
    for file in rust_files(&host_http_src) {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", file.display(), err));
        assert!(
            !source.contains("neko_runtime_scene"),
            "{} must import scene DTOs from `neko_engine_kernel::contracts::scene`",
            relative_to_packages(&file)
        );
    }

    let contracts_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/contracts.rs");
    let contracts = fs::read_to_string(&contracts_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", contracts_rs.display(), err));
    let scene_section = contracts
        .split("pub mod scene {")
        .nth(1)
        .expect("contracts.rs must expose a scene contract module");
    for required in [
        "SceneDelta",
        "TransformUpdate",
        "SceneCommandAck",
        "SceneCommandAckStatus",
        "SceneCommandEnvelope",
        "SceneCommandEvent",
        "SceneCommandPhase",
        "TopologyOperation",
        "VertexBrushPatchMetadata",
    ] {
        assert!(
            scene_section.contains(required),
            "contracts::scene must explicitly re-export `{}` for host-http",
            required
        );
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
    ] {
        assert!(
            manifest.contains(member),
            "workspace must list renderer companion member {}",
            member
        );
    }

    assert!(
        !packages_dir.join("engine-export-renderer").exists(),
        "thin export renderer support belongs in engine-gpu::export_support"
    );
    assert!(
        !manifest.contains("\"packages/engine-export-renderer\""),
        "workspace must not list removed thin export renderer crate"
    );
}

#[test]
fn renderer_companion_manifests_avoid_kernel_and_host_crates() {
    let packages_dir = packages_dir();
    for crate_dir in [
        "engine-scene-renderer",
        "engine-puppet-renderer",
        "engine-panoramic-renderer",
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
fn gpu_export_pipeline_receives_domain_render_ports() {
    let pipeline_rs =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src/export/gpu_export_pipeline.rs");
    let source = fs::read_to_string(&pipeline_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", pipeline_rs.display(), err));

    for required in [
        "pub trait SceneRenderPort",
        "pub trait PuppetRenderPort",
        "render_ports: RenderServicePorts",
        "collect_visible_puppet",
        "render_puppet_to_gpu_layer",
    ] {
        assert!(
            source.contains(required),
            "GpuExportPipeline must keep injected render-port contract `{}`",
            required
        );
    }

    for forbidden in [
        "SceneService::new(",
        "SceneService::with_gpu(",
        "PuppetService::new(",
        "PuppetService::with_gpu(",
        "Arc<SceneService>",
        "Arc<PuppetService>",
    ] {
        assert!(
            !source.contains(forbidden),
            "GpuExportPipeline must not construct or store concrete service `{}`",
            forbidden
        );
    }
}

#[test]
fn export_backend_adapts_trait_services_to_render_ports_only() {
    let backend_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/export/backend.rs");
    let source = fs::read_to_string(&backend_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", backend_rs.display(), err));

    for required in [
        "ExportRenderServicePorts",
        "SceneServiceRenderPort",
        "PuppetServiceRenderPort",
        "impl SceneRenderPort for SceneServiceRenderPort",
        "impl PuppetRenderPort for PuppetServiceRenderPort",
    ] {
        assert!(
            source.contains(required),
            "export backend must keep documented render-port adapter `{}`",
            required
        );
    }

    for forbidden in [
        "SceneService::new(",
        "SceneService::with_gpu(",
        "PuppetService::new(",
        "PuppetService::with_gpu(",
    ] {
        assert!(
            !source.contains(forbidden),
            "export backend must receive service ports rather than constructing `{}`",
            forbidden
        );
    }
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
            "neko_engine_gpu::scene_renderer",
            "neko_engine_gpu::puppet_renderer",
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
            "neko_engine_audio::AudioEncoderConfig",
            "use neko_engine_audio::{AudioEncoderConfig",
            "use neko_engine_audio::{ AudioEncoderConfig",
        ],
    );
}

#[test]
fn kernel_helper_shell_directories_are_removed() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    for forbidden_dir in [
        "src/media_service",
        "src/jvi",
        "src/generators",
        "src/animation",
        "src/audio",
        "src/decoder",
        "src/gpu",
    ] {
        let path = manifest_dir.join(forbidden_dir);
        assert!(
            !path.exists(),
            "{} must not reappear in engine-kernel; move implementation to the owning runtime/infrastructure crate or add an explicit ADR allowlist",
            path.display()
        );
    }
}

#[test]
fn kernel_contract_media_exports_are_runtime_media_reexports() {
    let contracts_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/contracts.rs");
    let source = fs::read_to_string(&contracts_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", contracts_rs.display(), err));

    let media_section = source
        .split("pub mod media {")
        .nth(1)
        .and_then(|rest| rest.split("/// Preview contracts").next())
        .expect("contracts.rs must contain media contract module");

    assert!(media_section.contains("pub use neko_runtime_media::{"));
    assert!(!media_section.contains("crate::media_service"));
}

#[test]
fn kernel_contract_gpu_exports_are_explicit_lower_crate_reexports() {
    let contracts_rs = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/contracts.rs");
    let source = fs::read_to_string(&contracts_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", contracts_rs.display(), err));

    let gpu_section = source
        .split("pub mod gpu {")
        .nth(1)
        .and_then(|rest| rest.split("/// JVI project").next())
        .expect("contracts.rs must contain gpu contract module");

    assert!(gpu_section.contains("neko_engine_gpu"));
    assert!(gpu_section.contains("neko_engine_scene_renderer"));
    assert!(!gpu_section.contains("crate::gpu"));
    assert!(!gpu_section.contains("pub use neko_engine_gpu::*"));
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
        "bevy",
        "bevy_ecs",
        "wgpu",
        "ffmpeg",
        "tokio",
        "neko-engine-kernel",
        "neko-runtime-scene",
        "neko-runtime-puppet",
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
fn engine_types_animation_sources_remain_runtime_and_ecs_free() {
    let animation_rs = packages_dir().join("engine-types/src/animation.rs");
    let source = fs::read_to_string(&animation_rs)
        .unwrap_or_else(|err| panic!("failed to read {}: {}", animation_rs.display(), err));

    for forbidden in [
        "bevy",
        "bevy_ecs",
        "bevy_app",
        "bevy_render",
        "bevy_math",
        "neko_runtime_scene",
        "neko_runtime_puppet",
        "neko_engine_scene_renderer",
        "neko_engine_puppet_renderer",
        "neko_engine_gpu",
        "host_api",
        "host_http",
        "host_napi",
        "vscode",
        "webview",
        "neko-runtime-scene",
        "neko-runtime-puppet",
        "SceneBlendLayer",
        "BlendLayerInfoSerde",
    ] {
        assert!(
            !source.contains(forbidden),
            "{} must keep animation DTOs runtime/ECS-free; found `{}`",
            relative_to_packages(&animation_rs),
            forbidden
        );
    }
}

#[test]
fn runtime_device_and_ml_do_not_depend_on_kernel() {
    let packages_dir = packages_dir();
    for crate_dir in ["runtime-device", "runtime-ml"] {
        let manifest_path = packages_dir.join(crate_dir).join("Cargo.toml");
        let manifest = fs::read_to_string(&manifest_path)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", manifest_path.display(), err));

        assert!(
            !manifest.contains("neko-engine-kernel"),
            "{} must not depend upward on engine-kernel",
            manifest_path.display()
        );
    }
}

#[test]
fn runtime_device_and_ml_sources_do_not_import_kernel() {
    let packages_dir = packages_dir();
    for crate_dir in ["runtime-device", "runtime-ml"] {
        let source_root = packages_dir.join(crate_dir).join("src");
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
                "{} must not import engine-kernel; keep runtime contracts below kernel",
                relative_to_packages(&file)
            );
        }
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
        let imports_gpu = source.contains("GpuContext")
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
