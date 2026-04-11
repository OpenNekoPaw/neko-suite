/**
 * Gradient Shader Sources
 *
 * GLSL ES 3.0 fragment shaders for linear and radial gradient fill.
 */

export const LINEAR_GRADIENT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_start;     // gradient start (pixels)
uniform vec2 u_end;       // gradient end (pixels)
uniform vec4 u_color0;    // start color RGBA
uniform vec4 u_color1;    // end color RGBA

void main() {
  vec2 fragPos = v_texCoord * u_resolution;
  vec2 dir = u_end - u_start;
  float len2 = dot(dir, dir);
  float t = len2 > 0.0 ? clamp(dot(fragPos - u_start, dir) / len2, 0.0, 1.0) : 0.0;
  fragColor = mix(u_color0, u_color1, t);
}
`;

export const RADIAL_GRADIENT_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_center;    // gradient center (pixels)
uniform float u_radius;   // gradient radius (pixels)
uniform vec4 u_color0;    // center color RGBA
uniform vec4 u_color1;    // edge color RGBA

void main() {
  vec2 fragPos = v_texCoord * u_resolution;
  float dist = length(fragPos - u_center);
  float t = clamp(dist / max(u_radius, 1.0), 0.0, 1.0);
  fragColor = mix(u_color0, u_color1, t);
}
`;
