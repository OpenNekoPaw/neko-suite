/**
 * Light Shader Sources
 *
 * GLSL ES 3.0 fragment shaders for the 2D lighting system.
 * All shaders use QUAD_VERT from shaders.ts as the vertex shader.
 */

// ─── P0: Flat Point Light (no normal map) ───

export const LIGHT_POINT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec2 fragPos = v_texCoord * u_resolution;

  float dist = length(fragPos - u_lightPos);
  float attenuation = 1.0 - smoothstep(0.0, u_radius, dist);
  attenuation *= attenuation; // quadratic falloff

  vec3 light = u_lightColor * u_intensity * attenuation;

  fragColor = vec4(scene.rgb * light, scene.a);
}
`;

// ─── Ambient Light Pass ───

export const LIGHT_AMBIENT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec3 u_ambientColor;
uniform float u_ambientIntensity;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  fragColor = vec4(scene.rgb * u_ambientColor * u_ambientIntensity, scene.a);
}
`;
