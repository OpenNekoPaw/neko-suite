//! Dual access contracts for puppet runtime worlds.

use crate::animation::{AnimationClipInfo, ParameterCurveInfo};
use crate::moc3;
use crate::world::{DeformedMesh, PuppetDelta, PuppetSnapshot, PuppetWorld};
use serde::{Deserialize, Serialize};

/// User-intent access surface for puppet editor operations.
pub trait CreativeAccess: PuppetWorld {}

/// Data-oriented access surface for puppet render/export pipelines.
pub trait DataAccess: Send + Sync {
    fn serialize_puppet(&mut self, filter: PuppetEntityFilter) -> SerializedPuppetEntities;
    fn extract_deformed_meshes(&mut self) -> Vec<DeformedMesh>;
    fn tick_data(&mut self, delta_ms: f32) -> PuppetDelta;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PuppetEntityFilter {
    All,
    Render,
    Export,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedPuppetEntities {
    pub snapshot: PuppetSnapshot,
    pub animations: Vec<AnimationClipInfo>,
    pub expressions: Vec<moc3::expression::ExpressionInfo>,
    pub tracks: Vec<PuppetAnimationTracks>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuppetAnimationTracks {
    pub clip_name: String,
    pub tracks: Vec<ParameterCurveInfo>,
}
