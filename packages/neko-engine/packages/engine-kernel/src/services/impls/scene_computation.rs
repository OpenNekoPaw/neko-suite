//! Live scene computation owner.
//!
//! This module owns the runtime-scene world and exposes typed creative/data
//! entry points. Rendering code receives extracted RenderWorld snapshots and
//! must not borrow the live world from here.

use std::sync::{Mutex, MutexGuard};

use crate::error::{Error, Result};
use crate::services::impls::scene_command_queue::SceneCommandQueue;
use neko_runtime_scene::access::{
    BeginModelingSession, CommitModelingSession, CreativeAccess, DataAccess,
};
use neko_runtime_scene::modeling_session::{
    BrushPatchApplyOutcome, ModelingSession, ModelingSessionStateDelta, TopologyChangeEvent,
    VertexBrushPatchMetadata,
};
use neko_runtime_scene::world::{BevySceneWorld, SceneDelta};
use neko_runtime_scene::{SceneCommandAck, SceneCommandAckStatus, SceneCommandEnvelope};

/// Owner of the live Bevy scene world and command queue.
pub struct SceneComputation {
    world: Mutex<BevySceneWorld>,
    command_queue: Mutex<SceneCommandQueue>,
}

impl SceneComputation {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
            command_queue: Mutex::new(SceneCommandQueue::default()),
        }
    }

    pub fn creative<R>(&self, f: impl FnOnce(&mut BevySceneWorld) -> R) -> Result<R> {
        let mut world = self.lock_world()?;
        Ok(f(&mut world))
    }

    pub fn data<R>(&self, f: impl FnOnce(&mut BevySceneWorld) -> R) -> Result<R> {
        let mut world = self.lock_world()?;
        Ok(f(&mut world))
    }

    pub fn current_revision(&self) -> Result<u64> {
        self.creative(CreativeAccess::current_revision)
    }

    pub fn apply_scene_command_with_delta(
        &self,
        envelope: SceneCommandEnvelope,
    ) -> Result<(Vec<SceneCommandAck>, Option<SceneDelta>)> {
        let mut world = self.lock_world()?;
        let mut queue = self
            .command_queue
            .lock()
            .map_err(|e| Error::Other(format!("Scene command queue lock poisoned: {}", e)))?;

        let acks = world.apply_scene_command_batch(&mut *queue, envelope);
        let applied_seq = acks
            .iter()
            .rev()
            .find(|ack| ack.status == SceneCommandAckStatus::Applied)
            .map(|ack| ack.applied_seq);
        let delta = applied_seq.map(|seq| world.extract_delta(Some(seq)));

        Ok((acks, delta))
    }

    pub fn begin_modeling_session(
        &self,
        request: BeginModelingSession,
    ) -> Result<(ModelingSession, Option<SceneDelta>)> {
        self.data(|world| world.begin_modeling_session(request))
            .and_then(|result| result.map_err(|error| Error::Other(error.to_string())))
            .map(|(session, delta)| (session, Some(delta)))
    }

    pub fn commit_modeling_session(
        &self,
        request: CommitModelingSession,
    ) -> Result<(TopologyChangeEvent, Option<SceneDelta>)> {
        self.data(|world| world.commit_modeling_session(request))
            .and_then(|result| result.map_err(|error| Error::Other(error.to_string())))
            .map(|(event, delta)| (event, Some(delta)))
    }

    pub fn cancel_modeling_session(
        &self,
        session_id: &str,
    ) -> Result<(ModelingSessionStateDelta, Option<SceneDelta>)> {
        self.data(|world| world.cancel_modeling_session(session_id))
            .and_then(|result| result.map_err(|error| Error::Other(error.to_string())))
            .map(|(session, delta)| (session, Some(delta)))
    }

    pub fn apply_vertex_brush_patch(
        &self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome> {
        self.data(|world| world.apply_vertex_brush_patch(patch))
            .and_then(|result| result.map_err(|error| Error::Other(error.to_string())))
    }

    fn lock_world(&self) -> Result<MutexGuard<'_, BevySceneWorld>> {
        self.world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))
    }
}

impl Default for SceneComputation {
    fn default() -> Self {
        Self::new()
    }
}
