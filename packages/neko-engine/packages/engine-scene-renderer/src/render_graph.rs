//! Minimal RenderGraph for the 3D scene renderer.

use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RenderResourceId(pub String);

impl From<&str> for RenderResourceId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderResourceKind {
    Texture,
    Buffer,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderResourceDesc {
    pub id: RenderResourceId,
    pub kind: RenderResourceKind,
    pub transient: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RenderPassId(pub String);

impl From<&str> for RenderPassId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct RenderPassDesc {
    pub id: RenderPassId,
    pub reads: Vec<RenderResourceId>,
    pub writes: Vec<RenderResourceId>,
    pub side_effect: bool,
}

impl RenderPassDesc {
    pub fn new(id: impl Into<RenderPassId>) -> Self {
        Self {
            id: id.into(),
            reads: Vec::new(),
            writes: Vec::new(),
            side_effect: false,
        }
    }

    pub fn read(mut self, resource: impl Into<RenderResourceId>) -> Self {
        self.reads.push(resource.into());
        self
    }

    pub fn write(mut self, resource: impl Into<RenderResourceId>) -> Self {
        self.writes.push(resource.into());
        self
    }

    pub fn side_effect(mut self) -> Self {
        self.side_effect = true;
        self
    }
}

#[derive(Debug, Clone)]
pub struct CompiledRenderPass {
    pub id: RenderPassId,
    pub reads: Vec<RenderResourceId>,
    pub writes: Vec<RenderResourceId>,
}

#[derive(Debug, Clone, Default)]
pub struct CompiledRenderGraph {
    pub passes: Vec<CompiledRenderPass>,
}

#[derive(Debug, Clone, Default)]
pub struct RenderGraph {
    resources: HashMap<RenderResourceId, RenderResourceDesc>,
    passes: Vec<RenderPassDesc>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RenderGraphError {
    #[error("duplicate render resource: {0}")]
    DuplicateResource(String),
    #[error("duplicate render pass: {0}")]
    DuplicatePass(String),
    #[error("render pass '{pass}' references missing resource '{resource}'")]
    MissingResource { pass: String, resource: String },
    #[error("render graph contains a dependency cycle")]
    Cycle,
    #[error("render pass '{pass}' failed: {error}")]
    Execution { pass: String, error: String },
}

pub trait RenderGraphExecutor {
    fn execute_pass(
        &mut self,
        pass: &CompiledRenderPass,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderGraphError>;
}

impl RenderGraph {
    pub fn add_resource(&mut self, desc: RenderResourceDesc) -> Result<(), RenderGraphError> {
        if self.resources.contains_key(&desc.id) {
            return Err(RenderGraphError::DuplicateResource(desc.id.0));
        }
        self.resources.insert(desc.id.clone(), desc);
        Ok(())
    }

    pub fn add_pass(&mut self, pass: RenderPassDesc) -> Result<(), RenderGraphError> {
        if self.passes.iter().any(|existing| existing.id == pass.id) {
            return Err(RenderGraphError::DuplicatePass(pass.id.0));
        }
        self.passes.push(pass);
        Ok(())
    }

    pub fn compile(
        &self,
        live_outputs: &[RenderResourceId],
    ) -> Result<CompiledRenderGraph, RenderGraphError> {
        self.validate_resources()?;
        let live_passes = self.compute_live_passes(live_outputs);
        let ordered_indices = self.topological_order(&live_passes)?;

        Ok(CompiledRenderGraph {
            passes: ordered_indices
                .into_iter()
                .map(|index| {
                    let pass = &self.passes[index];
                    CompiledRenderPass {
                        id: pass.id.clone(),
                        reads: pass.reads.clone(),
                        writes: pass.writes.clone(),
                    }
                })
                .collect(),
        })
    }

    pub fn execute<E: RenderGraphExecutor>(
        &self,
        compiled: &CompiledRenderGraph,
        encoder: &mut wgpu::CommandEncoder,
        executor: &mut E,
    ) -> Result<(), RenderGraphError> {
        for pass in &compiled.passes {
            executor.execute_pass(pass, encoder)?;
        }
        Ok(())
    }

    fn validate_resources(&self) -> Result<(), RenderGraphError> {
        for pass in &self.passes {
            for resource in pass.reads.iter().chain(pass.writes.iter()) {
                if !self.resources.contains_key(resource) {
                    return Err(RenderGraphError::MissingResource {
                        pass: pass.id.0.clone(),
                        resource: resource.0.clone(),
                    });
                }
            }
        }
        Ok(())
    }

    fn compute_live_passes(&self, live_outputs: &[RenderResourceId]) -> HashSet<usize> {
        let mut live_resources: HashSet<RenderResourceId> = live_outputs.iter().cloned().collect();
        let mut live_passes = HashSet::new();
        let mut changed = true;

        while changed {
            changed = false;
            for (index, pass) in self.passes.iter().enumerate().rev() {
                if live_passes.contains(&index) {
                    continue;
                }
                let writes_live_resource = pass
                    .writes
                    .iter()
                    .any(|resource| live_resources.contains(resource));
                if pass.side_effect || writes_live_resource {
                    live_passes.insert(index);
                    changed = true;
                    for resource in &pass.reads {
                        live_resources.insert(resource.clone());
                    }
                }
            }
        }

        live_passes
    }

    fn topological_order(
        &self,
        live_passes: &HashSet<usize>,
    ) -> Result<Vec<usize>, RenderGraphError> {
        let mut incoming: HashMap<usize, usize> = HashMap::new();
        let mut outgoing: HashMap<usize, Vec<usize>> = HashMap::new();

        for &index in live_passes {
            incoming.entry(index).or_insert(0);
            outgoing.entry(index).or_default();
        }

        for &writer_index in live_passes {
            for &reader_index in live_passes {
                if writer_index == reader_index {
                    continue;
                }
                if writes_resource_read_by(&self.passes[writer_index], &self.passes[reader_index]) {
                    outgoing.entry(writer_index).or_default().push(reader_index);
                    *incoming.entry(reader_index).or_insert(0) += 1;
                }
            }
        }

        let mut ready: VecDeque<usize> = self
            .passes
            .iter()
            .enumerate()
            .filter_map(|(index, _)| {
                if live_passes.contains(&index)
                    && incoming.get(&index).copied().unwrap_or_default() == 0
                {
                    Some(index)
                } else {
                    None
                }
            })
            .collect();

        let mut ordered = Vec::with_capacity(live_passes.len());
        while let Some(index) = ready.pop_front() {
            ordered.push(index);
            for dependent in outgoing.get(&index).into_iter().flatten() {
                let count = incoming
                    .get_mut(dependent)
                    .expect("dependent pass should have incoming count");
                *count -= 1;
                if *count == 0 {
                    ready.push_back(*dependent);
                }
            }
        }

        if ordered.len() != live_passes.len() {
            return Err(RenderGraphError::Cycle);
        }

        Ok(ordered)
    }
}

fn writes_resource_read_by(writer: &RenderPassDesc, reader: &RenderPassDesc) -> bool {
    writer
        .writes
        .iter()
        .any(|resource| reader.reads.iter().any(|read| read == resource))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texture(id: &str) -> RenderResourceDesc {
        RenderResourceDesc {
            id: id.into(),
            kind: RenderResourceKind::Texture,
            transient: true,
        }
    }

    #[test]
    fn compile_orders_passes_by_resource_dependencies() {
        let mut graph = RenderGraph::default();
        graph.add_resource(texture("scene_color")).unwrap();
        graph.add_resource(texture("present")).unwrap();
        graph
            .add_pass(
                RenderPassDesc::new("post")
                    .read("scene_color")
                    .write("present"),
            )
            .unwrap();
        graph
            .add_pass(RenderPassDesc::new("pbr").write("scene_color"))
            .unwrap();

        let compiled = graph.compile(&["present".into()]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(ids, vec!["pbr", "post"]);
    }

    #[test]
    fn compile_prunes_dead_passes() {
        let mut graph = RenderGraph::default();
        graph.add_resource(texture("scene_color")).unwrap();
        graph.add_resource(texture("debug_normals")).unwrap();
        graph
            .add_pass(RenderPassDesc::new("pbr").write("scene_color"))
            .unwrap();
        graph
            .add_pass(RenderPassDesc::new("debug").write("debug_normals"))
            .unwrap();

        let compiled = graph.compile(&["scene_color".into()]).unwrap();
        let ids: Vec<&str> = compiled
            .passes
            .iter()
            .map(|pass| pass.id.0.as_str())
            .collect();

        assert_eq!(ids, vec!["pbr"]);
    }

    #[test]
    fn compile_rejects_missing_resources() {
        let mut graph = RenderGraph::default();
        graph
            .add_pass(RenderPassDesc::new("pbr").write("scene_color"))
            .unwrap();

        let error = graph.compile(&["scene_color".into()]).unwrap_err();
        assert_eq!(
            error,
            RenderGraphError::MissingResource {
                pass: "pbr".to_string(),
                resource: "scene_color".to_string()
            }
        );
    }
}
