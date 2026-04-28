//! Frame scheduling budgets for scene viewport rendering.

use crate::gpu::scene_renderer::{ViewportDescriptor, ViewportWorkMode};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameBudget {
    pub frame_interval_ms: f32,
    pub simulation_ms: f32,
    pub extract_ms: f32,
    pub render_ms: f32,
    pub encode_ms: f32,
    pub metadata_ms: f32,
}

impl FrameBudget {
    pub fn total_work_ms(self) -> f32 {
        self.simulation_ms + self.extract_ms + self.render_ms + self.encode_ms + self.metadata_ms
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FrameScheduleDecision {
    pub viewport_id: String,
    pub work_mode: ViewportWorkMode,
    pub target_fps: u32,
    pub budget: FrameBudget,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct FrameLoadSample {
    pub gpu_frame_ms: f32,
    pub encode_ms: f32,
    pub dropped_frames: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ControlAckHealthSample {
    pub ack_p95_ms: f32,
    pub pending_command_acks: u32,
    pub render_backlog_frames: u32,
}

impl Default for ControlAckHealthSample {
    fn default() -> Self {
        Self {
            ack_p95_ms: 0.0,
            pending_command_acks: 0,
            render_backlog_frames: 0,
        }
    }
}

impl ControlAckHealthSample {
    pub const ACK_P95_BUDGET_MS: f32 = 16.0;
    pub const PENDING_ACK_BUDGET: u32 = 16;
    pub const RENDER_BACKLOG_BUDGET: u32 = 2;

    pub fn ack_path_is_healthy(self) -> bool {
        self.ack_p95_ms <= Self::ACK_P95_BUDGET_MS
            && self.pending_command_acks <= Self::PENDING_ACK_BUDGET
    }

    pub fn render_backlog_is_healthy(self) -> bool {
        self.render_backlog_frames <= Self::RENDER_BACKLOG_BUDGET
    }

    pub fn is_healthy(self) -> bool {
        self.ack_path_is_healthy() && self.render_backlog_is_healthy()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DegradationStep {
    AuxiliaryHelperPasses,
    AuxiliaryViewportFpsResolution,
    MainViewportPostProcessQuality,
    MainViewportFps,
    MainViewportResolution,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DegradationDecision {
    pub steps: Vec<DegradationStep>,
    pub preserve_control_ack: bool,
}

#[derive(Debug, Clone, Default)]
pub struct FrameScheduler;

impl FrameScheduler {
    pub fn schedule_viewport(&self, descriptor: &ViewportDescriptor) -> FrameScheduleDecision {
        let target_fps = descriptor.fps.clamp(1, 240);
        let frame_interval_ms = 1000.0 / target_fps as f32;
        let weights = BudgetWeights::for_work_mode(descriptor.work_mode);

        FrameScheduleDecision {
            viewport_id: descriptor.viewport_id.clone(),
            work_mode: descriptor.work_mode,
            target_fps,
            budget: FrameBudget {
                frame_interval_ms,
                simulation_ms: frame_interval_ms * weights.simulation,
                extract_ms: frame_interval_ms * weights.extract,
                render_ms: frame_interval_ms * weights.render,
                encode_ms: frame_interval_ms * weights.encode,
                metadata_ms: frame_interval_ms * weights.metadata,
            },
        }
    }

    pub fn degradation_plan(
        &self,
        main_viewport: &FrameScheduleDecision,
        auxiliary_viewport_count: usize,
        load: FrameLoadSample,
        control_ack: ControlAckHealthSample,
    ) -> DegradationDecision {
        let consumed_ms = load.gpu_frame_ms + load.encode_ms;
        let overload_ratio = if main_viewport.budget.frame_interval_ms > 0.0 {
            consumed_ms / main_viewport.budget.frame_interval_ms
        } else {
            0.0
        };
        let mut steps = Vec::new();
        let control_unhealthy = !control_ack.is_healthy();

        if overload_ratio > 1.0 || load.dropped_frames > 0 || control_unhealthy {
            if auxiliary_viewport_count > 0 {
                steps.push(DegradationStep::AuxiliaryHelperPasses);
            }
        }
        if (overload_ratio > 1.10 || load.dropped_frames > 1 || control_unhealthy)
            && auxiliary_viewport_count > 0
        {
            steps.push(DegradationStep::AuxiliaryViewportFpsResolution);
        }
        if overload_ratio > 1.25 || load.dropped_frames > 2 || control_unhealthy {
            steps.push(DegradationStep::MainViewportPostProcessQuality);
        }
        if overload_ratio > 1.50 || load.dropped_frames > 4 || control_ack.render_backlog_frames > 4
        {
            steps.push(DegradationStep::MainViewportFps);
        }
        if overload_ratio > 1.80 || load.dropped_frames > 8 || control_ack.render_backlog_frames > 8
        {
            steps.push(DegradationStep::MainViewportResolution);
        }

        DegradationDecision {
            steps,
            preserve_control_ack: control_ack.ack_path_is_healthy(),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct BudgetWeights {
    simulation: f32,
    extract: f32,
    render: f32,
    encode: f32,
    metadata: f32,
}

impl BudgetWeights {
    fn for_work_mode(work_mode: ViewportWorkMode) -> Self {
        match work_mode {
            ViewportWorkMode::EditParametric => Self {
                simulation: 0.12,
                extract: 0.08,
                render: 0.48,
                encode: 0.24,
                metadata: 0.03,
            },
            ViewportWorkMode::EditFree => Self {
                simulation: 0.16,
                extract: 0.09,
                render: 0.45,
                encode: 0.22,
                metadata: 0.03,
            },
            ViewportWorkMode::Pose => Self {
                simulation: 0.18,
                extract: 0.08,
                render: 0.46,
                encode: 0.20,
                metadata: 0.03,
            },
            ViewportWorkMode::RenderPreview => Self {
                simulation: 0.08,
                extract: 0.07,
                render: 0.60,
                encode: 0.18,
                metadata: 0.02,
            },
            ViewportWorkMode::Lookdev => Self {
                simulation: 0.08,
                extract: 0.08,
                render: 0.56,
                encode: 0.20,
                metadata: 0.03,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gpu::scene_renderer::{SceneToneMapping, ViewportPostProcess, ViewportRenderMode};

    fn descriptor(work_mode: ViewportWorkMode, fps: u32) -> ViewportDescriptor {
        ViewportDescriptor {
            viewport_id: "main".to_string(),
            scene_id: "scene".to_string(),
            render_mode: ViewportRenderMode::Pbr,
            debug_view: None,
            fps,
            tone_mapping: SceneToneMapping::Aces,
            post_process: ViewportPostProcess::default(),
            layer_mask: None,
            work_mode,
            helper_passes: true,
        }
    }

    #[test]
    fn scheduler_derives_budget_from_fps() {
        let scheduler = FrameScheduler;
        let decision =
            scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));

        assert_eq!(decision.target_fps, 60);
        assert!((decision.budget.frame_interval_ms - 16.666).abs() < 0.01);
        assert!(decision.budget.render_ms > decision.budget.simulation_ms);
        assert!(decision.budget.total_work_ms() <= decision.budget.frame_interval_ms);
    }

    #[test]
    fn render_preview_prioritizes_render_budget() {
        let scheduler = FrameScheduler;
        let edit = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 30));
        let preview = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::RenderPreview, 30));

        assert!(preview.budget.render_ms > edit.budget.render_ms);
        assert!(preview.budget.simulation_ms < edit.budget.simulation_ms);
    }

    #[test]
    fn scheduler_has_distinct_profiles_for_authoring_work_modes() {
        let scheduler = FrameScheduler;
        let parametric =
            scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));
        let free = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditFree, 60));
        let pose = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::Pose, 60));
        let preview = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::RenderPreview, 60));

        assert!(free.budget.simulation_ms > parametric.budget.simulation_ms);
        assert!(pose.budget.simulation_ms > parametric.budget.simulation_ms);
        assert!(preview.budget.render_ms > pose.budget.render_ms);
        assert!(free.budget.total_work_ms() <= free.budget.frame_interval_ms);
    }

    #[test]
    fn degradation_reduces_auxiliary_viewports_before_main_viewport() {
        let scheduler = FrameScheduler;
        let main = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));
        let decision = scheduler.degradation_plan(
            &main,
            1,
            FrameLoadSample {
                gpu_frame_ms: 18.0,
                encode_ms: 2.0,
                dropped_frames: 1,
            },
            ControlAckHealthSample::default(),
        );

        assert_eq!(
            decision.steps.first(),
            Some(&DegradationStep::AuxiliaryHelperPasses)
        );
        assert!(decision.preserve_control_ack);
    }

    #[test]
    fn degradation_escalates_without_blocking_control_ack() {
        let scheduler = FrameScheduler;
        let main = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));
        let decision = scheduler.degradation_plan(
            &main,
            0,
            FrameLoadSample {
                gpu_frame_ms: 34.0,
                encode_ms: 4.0,
                dropped_frames: 9,
            },
            ControlAckHealthSample::default(),
        );

        assert_eq!(
            decision.steps,
            vec![
                DegradationStep::MainViewportPostProcessQuality,
                DegradationStep::MainViewportFps,
                DegradationStep::MainViewportResolution,
            ]
        );
        assert!(decision.preserve_control_ack);
    }

    #[test]
    fn degradation_uses_control_ack_health_instead_of_constant() {
        let scheduler = FrameScheduler;
        let main = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));
        let decision = scheduler.degradation_plan(
            &main,
            0,
            FrameLoadSample {
                gpu_frame_ms: 2.0,
                encode_ms: 1.0,
                dropped_frames: 0,
            },
            ControlAckHealthSample {
                ack_p95_ms: 24.0,
                pending_command_acks: 4,
                render_backlog_frames: 0,
            },
        );

        assert!(!decision.preserve_control_ack);
        assert_eq!(
            decision.steps,
            vec![DegradationStep::MainViewportPostProcessQuality]
        );
    }

    #[test]
    fn render_backlog_degrades_without_marking_ack_path_blocked() {
        let scheduler = FrameScheduler;
        let main = scheduler.schedule_viewport(&descriptor(ViewportWorkMode::EditParametric, 60));
        let decision = scheduler.degradation_plan(
            &main,
            0,
            FrameLoadSample {
                gpu_frame_ms: 6.0,
                encode_ms: 1.0,
                dropped_frames: 0,
            },
            ControlAckHealthSample {
                ack_p95_ms: 2.0,
                pending_command_acks: 0,
                render_backlog_frames: 9,
            },
        );

        assert!(decision.preserve_control_ack);
        assert_eq!(
            decision.steps,
            vec![
                DegradationStep::MainViewportPostProcessQuality,
                DegradationStep::MainViewportFps,
                DegradationStep::MainViewportResolution,
            ]
        );
    }
}
