/**
 * Mask Shader Sources
 *
 * GLSL ES 3.0 fragment shaders for clipping mask and layer mask compositing.
 */

/**
 * Clipping mask: restrict layer alpha to the alpha of the base layer below.
 * Output = layer color with alpha = min(layer.a, base.a).
 */
export const CLIPPING_MASK_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_layer;
uniform sampler2D u_base;

void main() {
  vec4 layer = texture(u_layer, v_texCoord);
  vec4 base = texture(u_base, v_texCoord);
  fragColor = vec4(layer.rgb, layer.a * step(0.001, base.a));
}
`;

/**
 * Layer mask: multiply layer alpha by the luminance of a grayscale mask texture.
 * White = fully visible, black = fully hidden.
 */
export const LAYER_MASK_FRAG = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_layer;
uniform sampler2D u_mask;

void main() {
  vec4 layer = texture(u_layer, v_texCoord);
  vec4 mask = texture(u_mask, v_texCoord);
  float maskValue = dot(mask.rgb, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(layer.rgb, layer.a * maskValue);
}
`;
