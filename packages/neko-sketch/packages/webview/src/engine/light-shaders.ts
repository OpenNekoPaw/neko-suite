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

// ─── P2: Flat Directional Light ───

export const LIGHT_DIRECTIONAL_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec3 u_lightColor;
uniform float u_intensity;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 light = u_lightColor * u_intensity;
  fragColor = vec4(scene.rgb * light, scene.a);
}
`;

// ─── P2: Normal-Mapped Directional Light ───

export const LIGHT_DIRECTIONAL_NORMAL_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_normalMap;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_direction;
uniform float u_height;
uniform float u_specularPower;
uniform float u_specularIntensity;

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 normal = normalize(texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0);

  float z = max(0.05, u_height / 200.0);
  vec3 lightDir = normalize(vec3(cos(u_direction), sin(u_direction), z));
  float diffuse = max(dot(normal, lightDir), 0.0);

  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), u_specularPower) * u_specularIntensity;

  vec3 light = u_lightColor * u_intensity * (diffuse + specular);
  fragColor = vec4(scene.rgb * light, scene.a);
}
`;

// ─── P2: Flat Spot Light ───

export const LIGHT_SPOT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform vec2 u_lightPos;
uniform vec3 u_lightColor;
uniform float u_intensity;
uniform float u_radius;
uniform float u_direction;
uniform float u_coneAngle;
uniform float u_coneSoftness;

float spotMask(vec2 toFrag) {
  if (length(toFrag) < 0.001) return 1.0;
  vec2 dir = vec2(cos(u_direction), sin(u_direction));
  float angleCos = dot(normalize(toFrag), dir);
  float halfCone = max(0.01, u_coneAngle * 0.5);
  float softness = max(0.001, u_coneSoftness);
  float outer = cos(halfCone);
  float inner = cos(halfCone * (1.0 - softness));
  return smoothstep(outer, inner, angleCos);
}

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec2 fragPos = v_texCoord * u_resolution;
  vec2 toFrag = fragPos - u_lightPos;

  float dist = length(toFrag);
  float attenuation = 1.0 - smoothstep(0.0, u_radius, dist);
  attenuation *= attenuation;

  vec3 light = u_lightColor * u_intensity * attenuation * spotMask(toFrag);
  fragColor = vec4(scene.rgb * light, scene.a);
}
`;

// ─── P2: Normal-Mapped Spot Light ───

export const LIGHT_SPOT_NORMAL_FRAG = `#version 300 es
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
uniform float u_direction;
uniform float u_coneAngle;
uniform float u_coneSoftness;
uniform float u_specularPower;
uniform float u_specularIntensity;

float spotMask(vec2 toFrag) {
  if (length(toFrag) < 0.001) return 1.0;
  vec2 dir = vec2(cos(u_direction), sin(u_direction));
  float angleCos = dot(normalize(toFrag), dir);
  float halfCone = max(0.01, u_coneAngle * 0.5);
  float softness = max(0.001, u_coneSoftness);
  float outer = cos(halfCone);
  float inner = cos(halfCone * (1.0 - softness));
  return smoothstep(outer, inner, angleCos);
}

void main() {
  vec4 scene = texture(u_scene, v_texCoord);
  vec3 normal = normalize(texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0);

  vec2 fragPos = v_texCoord * u_resolution;
  vec2 toFrag = fragPos - u_lightPos;
  vec3 lightDir = normalize(vec3(u_lightPos - fragPos, u_height));

  float attenuation = 1.0 - smoothstep(0.0, u_radius, length(toFrag));
  attenuation *= attenuation;
  float cone = spotMask(toFrag);

  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), u_specularPower) * u_specularIntensity;

  vec3 light = u_lightColor * u_intensity * attenuation * cone * (diffuse + specular);
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
