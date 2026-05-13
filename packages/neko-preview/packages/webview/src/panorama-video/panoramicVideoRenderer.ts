import type { PanoramaViewState } from '@neko/shared';

interface RendererState {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly texture: WebGLTexture;
  readonly uniforms: {
    readonly resolution: WebGLUniformLocation;
    readonly yawPitchFov: WebGLUniformLocation;
  };
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec4 uYawPitchFov;
out vec4 outColor;

const float PI = 3.14159265359;

vec3 rotateX(vec3 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

vec3 rotateY(vec3 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  float yaw = radians(uYawPitchFov.x);
  float pitch = radians(uYawPitchFov.y);
  float fov = radians(uYawPitchFov.z);
  vec3 direction = normalize(vec3(p.x * tan(fov * 0.5), -p.y * tan(fov * 0.5), -1.0));
  direction = rotateX(direction, pitch);
  direction = rotateY(direction, yaw);
  float longitude = atan(direction.z, direction.x);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  vec2 uv = vec2(0.5 + longitude / (2.0 * PI), 0.5 - latitude / PI);
  outColor = texture(uTexture, uv);
}
`;

export class PanoramicVideoRenderer {
  private state: RendererState | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(): boolean {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!gl) return false;
    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) return false;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const resolution = gl.getUniformLocation(program, 'uResolution');
    const yawPitchFov = gl.getUniformLocation(program, 'uYawPitchFov');
    if (!vao || !buffer || !texture || !resolution || !yawPitchFov) return false;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.state = {
      gl,
      program,
      vao,
      texture,
      uniforms: { resolution, yawPitchFov },
    };
    return true;
  }

  renderFrame(frame: VideoFrame, viewState: PanoramaViewState): boolean {
    if (!this.state) return false;
    const { gl, program, vao, texture, uniforms } = this.state;
    const width = this.canvas.clientWidth || frame.displayWidth;
    const height = this.canvas.clientHeight || frame.displayHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const nextWidth = Math.max(1, Math.floor(width * dpr));
    const nextHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform4f(uniforms.yawPitchFov, viewState.yawDeg, viewState.pitchDeg, viewState.fovDeg, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }

  dispose(): void {
    if (!this.state) return;
    const { gl, program, vao, texture } = this.state;
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(texture);
    this.state = null;
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return gl.getProgramParameter(program, gl.LINK_STATUS) === true ? program : null;
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
