import type { PanoramaCoverageAngle, PanoramaViewState } from '@neko/shared';
import { DEFAULT_PANORAMA_COVERAGE_ANGLE } from '@neko/shared';

export type WebglPanoramaMode = 'sphere' | 'little-planet' | 'cylindrical';

interface RendererState {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly texture: WebGLTexture;
  readonly uniforms: {
    readonly resolution: WebGLUniformLocation;
    readonly yawPitchFov: WebGLUniformLocation;
    readonly exposure: WebGLUniformLocation;
    readonly mode: WebGLUniformLocation;
    readonly coverage: WebGLUniformLocation;
  };
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec4 uYawPitchFov;
uniform float uExposure;
uniform int uMode;
uniform vec2 uCoverage;
in vec2 vUv;
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

vec2 sphereUv(vec3 direction) {
  float longitude = atan(direction.z, direction.x);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  return vec2(0.5 + longitude / radians(uCoverage.x), 0.5 - latitude / radians(uCoverage.y));
}

vec2 cylinderUv(vec3 direction) {
  float longitude = atan(direction.z, direction.x);
  float tanV = direction.y / max(length(direction.xz), 0.00001);
  float halfVertical = radians(uCoverage.y) * 0.5;
  return vec2(0.5 + longitude / radians(uCoverage.x), 0.5 - tanV / (2.0 * tan(halfVertical)));
}

vec4 samplePano(vec2 uv) {
  vec3 color = texture(uTexture, uv).rgb;
  color *= pow(2.0, uExposure * 0.25);
  return vec4(color, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  float yaw = radians(uYawPitchFov.x);
  float pitch = radians(uYawPitchFov.y);
  float fov = radians(uYawPitchFov.z);

  if (uMode == 1) {
    float r = length(p);
    if (r > 1.0) {
      discard;
    }
    float theta = atan(p.y, p.x) + yaw;
    float phi = (1.0 - r) * PI * 0.5 + pitch;
    vec3 direction = normalize(vec3(cos(phi) * cos(theta), sin(phi), cos(phi) * sin(theta)));
    outColor = samplePano(sphereUv(direction));
    return;
  }

  vec3 direction = normalize(vec3(p.x * tan(fov * 0.5), -p.y * tan(fov * 0.5), -1.0));
  direction = rotateX(direction, pitch);
  direction = rotateY(direction, yaw);
  if (uMode == 2) {
    vec2 uv = cylinderUv(direction);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      discard;
    }
    outColor = samplePano(uv);
    return;
  }
  outColor = samplePano(sphereUv(direction));
}
`;

export class WebglPanoramaRenderer {
  private state: RendererState | null = null;
  private image: HTMLImageElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  initialize(): boolean {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) return false;

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) return false;

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    const resolution = gl.getUniformLocation(program, 'uResolution');
    const yawPitchFov = gl.getUniformLocation(program, 'uYawPitchFov');
    const exposure = gl.getUniformLocation(program, 'uExposure');
    const mode = gl.getUniformLocation(program, 'uMode');
    const coverage = gl.getUniformLocation(program, 'uCoverage');
    if (
      !vao ||
      !buffer ||
      !texture ||
      !resolution ||
      !yawPitchFov ||
      !exposure ||
      !mode ||
      !coverage
    ) {
      return false;
    }

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
      uniforms: { resolution, yawPitchFov, exposure, mode, coverage },
    };
    return true;
  }

  setImage(image: HTMLImageElement): void {
    if (!this.state) return;
    this.image = image;
    const { gl, texture } = this.state;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  render(
    viewState: PanoramaViewState,
    mode: WebglPanoramaMode,
    coverage: PanoramaCoverageAngle = DEFAULT_PANORAMA_COVERAGE_ANGLE,
  ): void {
    if (!this.state || !this.image) return;
    const { gl, program, vao, uniforms } = this.state;
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const nextWidth = Math.max(1, Math.floor(width * dpr));
    const nextHeight = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindTexture(gl.TEXTURE_2D, this.state.texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      (mode === 'sphere' || mode === 'little-planet') && coverage.horizontalDeg >= 360
        ? gl.REPEAT
        : gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform4f(uniforms.yawPitchFov, viewState.yawDeg, viewState.pitchDeg, viewState.fovDeg, 0);
    gl.uniform1f(uniforms.exposure, viewState.exposure);
    gl.uniform1i(uniforms.mode, mode === 'little-planet' ? 1 : mode === 'cylindrical' ? 2 : 0);
    gl.uniform2f(uniforms.coverage, coverage.horizontalDeg, coverage.verticalDeg);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  dispose(): void {
    if (!this.state) return;
    const { gl, program, vao, texture } = this.state;
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(texture);
    this.state = null;
    this.image = null;
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
