/**
 * Particle Renderer
 *
 * WebGL2 instanced rendering for particle systems.
 * Renders billboarded quads with per-instance position, size, and color.
 */
import type { ParticleBlendMode } from '../types/particle';
import { compileWebGLProgram } from './webgl-utils';

const PARTICLE_VERT = `#version 300 es
precision highp float;

// Per-vertex quad
layout(location = 0) in vec2 a_quad;

// Per-instance data
layout(location = 1) in vec2 a_position;
layout(location = 2) in float a_size;
layout(location = 3) in vec4 a_color;

uniform vec2 u_resolution;
out vec4 v_color;
out vec2 v_uv;

void main() {
  v_color = a_color;
  v_uv = a_quad * 0.5 + 0.5;

  vec2 worldPos = a_position + a_quad * a_size;
  vec2 ndc = (worldPos / u_resolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Soft circle
  float dist = length(v_uv - 0.5) * 2.0;
  float alpha = 1.0 - smoothstep(0.7, 1.0, dist);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

export class ParticleRenderer {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;
  private instanceVBO: WebGLBuffer | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;

    // Compile program
    this.program = compileWebGLProgram(gl, PARTICLE_VERT, PARTICLE_FRAG, 'Particle');

    // Quad geometry: two triangles forming a unit square
    const quadData = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance buffer (will be updated each frame)
    this.instanceVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);

    // a_position (vec2) at location 1
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(1, 1);

    // a_size (float) at location 2
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 8);
    gl.vertexAttribDivisor(2, 1);

    // a_color (vec4) at location 3
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 28, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  render(
    instanceData: Float32Array,
    count: number,
    width: number,
    height: number,
    blendMode: ParticleBlendMode = 'additive',
  ): void {
    if (count === 0 || !this.program || !this.quadVAO || !this.instanceVBO) return;

    const gl = this.gl;
    gl.useProgram(this.program);

    // Set resolution
    const resLoc = gl.getUniformLocation(this.program, 'u_resolution');
    gl.uniform2f(resLoc, width, height);

    // Update instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVBO);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

    // Set blend mode
    gl.enable(gl.BLEND);
    this.setBlendMode(blendMode);

    // Draw instanced
    gl.bindVertexArray(this.quadVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);

    // Restore default blend
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private setBlendMode(mode: ParticleBlendMode): void {
    const gl = this.gl;
    switch (mode) {
      case 'additive':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      case 'multiply':
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        break;
      case 'normal':
      default:
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        break;
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.instanceVBO) gl.deleteBuffer(this.instanceVBO);
  }
}
