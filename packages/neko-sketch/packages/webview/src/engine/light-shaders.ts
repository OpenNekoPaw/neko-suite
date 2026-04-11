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

// ─── P1: Normal-Mapped Point Light (N·L diffuse + Blinn-Phong specular) ───

export const LIGHT_NORMAL_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_normalMap;
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;
uniform float u_height;
uniform float u_specularPower;
uniform float u_specularIntensity;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 normal = normalize(texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0);

  vec2 fragPos = v_texCoord * u_resolution;
  vec3 lightDir = normalize(vec3(u_lightPos - fragPos, u_height));

  // Distance attenuation (same as flat point light)
  float attenuation = 1.0 - smoothstep(0.0, u_radius, length(u_lightPos - fragPos));
  attenuation *= attenuation;

  // Diffuse (N·L)
  float diffuse = max(dot(normal, lightDir), 0.0);

  // Specular (Blinn-Phong, view from above: viewDir = (0,0,1))
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), u_specularPower) * u_specularIntensity;

  vec3 light = u_lightColor * u_intensity * attenuation * (diffuse + specular);
  fragColor = vec4(scene.rgb * light, scene.a);
}
`;

// ─── Grayscale-to-Normal Sobel Inference ───

export const NORMAL_FROM_HEIGHT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_heightMap;
uniform vec2 u_resolution;
uniform float u_strength;

void main() {
  vec2 texel = 1.0 / u_resolution;

  float left  = texture(u_heightMap, v_texCoord - vec2(texel.x, 0.0)).r;
  float right = texture(u_heightMap, v_texCoord + vec2(texel.x, 0.0)).r;
  float up    = texture(u_heightMap, v_texCoord - vec2(0.0, texel.y)).r;
  float down  = texture(u_heightMap, v_texCoord + vec2(0.0, texel.y)).r;

  vec3 normal = normalize(vec3(
    (left - right) * u_strength,
    (up - down) * u_strength,
    1.0
  ));

  fragColor = vec4(normal * 0.5 + 0.5, 1.0);
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
