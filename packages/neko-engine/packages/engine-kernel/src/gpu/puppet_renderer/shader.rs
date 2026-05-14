//! WGSL source for puppet textured mesh rendering.

/// Textured puppet mesh shader.
pub const PUPPET_TEXTURED_MESH_WGSL: &str = r#"
struct ViewUniforms {
    viewport: vec2<f32>,
    _padding: vec2<f32>,
};

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> view: ViewUniforms;

@group(1) @binding(0)
var atlas_texture: texture_2d<f32>;

@group(1) @binding(1)
var atlas_sampler: sampler;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let ndc = vec2<f32>(
        (input.position.x / max(view.viewport.x, 1.0)) * 2.0 - 1.0,
        1.0 - (input.position.y / max(view.viewport.y, 1.0)) * 2.0,
    );
    output.position = vec4<f32>(ndc, 0.0, 1.0);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(atlas_texture, atlas_sampler, input.uv);
    return sampled * input.color;
}
"#;

/// Create the puppet shader module.
pub fn create_shader_module(device: &wgpu::Device) -> wgpu::ShaderModule {
    device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("puppet_textured_mesh_shader"),
        source: wgpu::ShaderSource::Wgsl(PUPPET_TEXTURED_MESH_WGSL.into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shader_contains_required_entry_points_and_bindings() {
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("@vertex"));
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("fn vs_main"));
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("@fragment"));
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("fn fs_main"));
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("atlas_texture"));
        assert!(PUPPET_TEXTURED_MESH_WGSL.contains("atlas_sampler"));
    }
}
