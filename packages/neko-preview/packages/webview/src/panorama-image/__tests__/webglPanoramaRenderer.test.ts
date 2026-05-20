import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebglPanoramaRenderer, type WebglPanoramaMode } from '../webglPanoramaRenderer';

type TexParameteriCall = [target: number, pname: number, param: number];

interface MockWebGL2RenderingContext {
  readonly ARRAY_BUFFER: number;
  readonly CLAMP_TO_EDGE: number;
  readonly COMPILE_STATUS: number;
  readonly FLOAT: number;
  readonly FRAGMENT_SHADER: number;
  readonly LINEAR: number;
  readonly LINK_STATUS: number;
  readonly REPEAT: number;
  readonly RGBA: number;
  readonly STATIC_DRAW: number;
  readonly TEXTURE_2D: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly TRIANGLES: number;
  readonly UNPACK_FLIP_Y_WEBGL: number;
  readonly UNSIGNED_BYTE: number;
  readonly VERTEX_SHADER: number;
  readonly attachShader: ReturnType<typeof vi.fn>;
  readonly bindBuffer: ReturnType<typeof vi.fn>;
  readonly bindTexture: ReturnType<typeof vi.fn>;
  readonly bindVertexArray: ReturnType<typeof vi.fn>;
  readonly bufferData: ReturnType<typeof vi.fn>;
  readonly compileShader: ReturnType<typeof vi.fn>;
  readonly createBuffer: ReturnType<typeof vi.fn>;
  readonly createProgram: ReturnType<typeof vi.fn>;
  readonly createShader: ReturnType<typeof vi.fn>;
  readonly createTexture: ReturnType<typeof vi.fn>;
  readonly createVertexArray: ReturnType<typeof vi.fn>;
  readonly deleteProgram: ReturnType<typeof vi.fn>;
  readonly deleteShader: ReturnType<typeof vi.fn>;
  readonly deleteTexture: ReturnType<typeof vi.fn>;
  readonly deleteVertexArray: ReturnType<typeof vi.fn>;
  readonly drawArrays: ReturnType<typeof vi.fn>;
  readonly enableVertexAttribArray: ReturnType<typeof vi.fn>;
  readonly getAttribLocation: ReturnType<typeof vi.fn>;
  readonly getProgramParameter: ReturnType<typeof vi.fn>;
  readonly getShaderParameter: ReturnType<typeof vi.fn>;
  readonly getUniformLocation: ReturnType<typeof vi.fn>;
  readonly linkProgram: ReturnType<typeof vi.fn>;
  readonly pixelStorei: ReturnType<typeof vi.fn>;
  readonly shaderSource: ReturnType<typeof vi.fn>;
  readonly texImage2D: ReturnType<typeof vi.fn>;
  readonly texParameteri: ReturnType<typeof vi.fn>;
  readonly uniform1f: ReturnType<typeof vi.fn>;
  readonly uniform1i: ReturnType<typeof vi.fn>;
  readonly uniform2f: ReturnType<typeof vi.fn>;
  readonly uniform4f: ReturnType<typeof vi.fn>;
  readonly useProgram: ReturnType<typeof vi.fn>;
  readonly vertexAttribPointer: ReturnType<typeof vi.fn>;
  readonly viewport: ReturnType<typeof vi.fn>;
}

function createMockGl(): MockWebGL2RenderingContext {
  return {
    ARRAY_BUFFER: 0x8892,
    CLAMP_TO_EDGE: 0x812f,
    COMPILE_STATUS: 0x8b81,
    FLOAT: 0x1406,
    FRAGMENT_SHADER: 0x8b30,
    LINEAR: 0x2601,
    LINK_STATUS: 0x8b82,
    REPEAT: 0x2901,
    RGBA: 0x1908,
    STATIC_DRAW: 0x88e4,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TRIANGLES: 0x0004,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNSIGNED_BYTE: 0x1401,
    VERTEX_SHADER: 0x8b31,
    attachShader: vi.fn(),
    bindBuffer: vi.fn(),
    bindTexture: vi.fn(),
    bindVertexArray: vi.fn(),
    bufferData: vi.fn(),
    compileShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    createProgram: vi.fn(() => ({})),
    createShader: vi.fn(() => ({})),
    createTexture: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
    deleteTexture: vi.fn(),
    deleteVertexArray: vi.fn(),
    drawArrays: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getProgramParameter: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    linkProgram: vi.fn(),
    pixelStorei: vi.fn(),
    shaderSource: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    useProgram: vi.fn(),
    vertexAttribPointer: vi.fn(),
    viewport: vi.fn(),
  };
}

function createRendererHarness(): {
  readonly gl: MockWebGL2RenderingContext;
  readonly renderer: WebglPanoramaRenderer;
} {
  const gl = createMockGl();
  const canvas = {
    width: 100,
    height: 100,
    clientWidth: 100,
    clientHeight: 100,
    getContext: vi.fn(() => gl),
  } as unknown as HTMLCanvasElement;
  const renderer = new WebglPanoramaRenderer(canvas);
  expect(renderer.initialize()).toBe(true);
  renderer.setImage({} as HTMLImageElement);
  gl.texParameteri.mockClear();
  return { gl, renderer };
}

function renderMode(
  mode: WebglPanoramaMode,
  horizontalDeg: number,
): {
  readonly gl: MockWebGL2RenderingContext;
  readonly calls: TexParameteriCall[];
} {
  const { gl, renderer } = createRendererHarness();
  renderer.render(
    {
      mode,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      fovDeg: 75,
      exposure: 0,
      toneMapping: 'aces',
    },
    mode,
    { horizontalDeg, verticalDeg: 180 },
  );
  return { gl, calls: gl.texParameteri.mock.calls as TexParameteriCall[] };
}

function wrapSParam(calls: TexParameteriCall[], gl: MockWebGL2RenderingContext): number {
  const call = calls.find(([, pname]) => pname === gl.TEXTURE_WRAP_S);
  expect(call).toBeDefined();
  return call?.[2] ?? 0;
}

describe('WebglPanoramaRenderer', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps horizontal repeat for full-coverage sphere and little-planet rendering', () => {
    const sphere = renderMode('sphere', 360);
    const littlePlanet = renderMode('little-planet', 360);

    expect(wrapSParam(sphere.calls, sphere.gl)).toBe(sphere.gl.REPEAT);
    expect(wrapSParam(littlePlanet.calls, littlePlanet.gl)).toBe(littlePlanet.gl.REPEAT);
  });

  it('clamps horizontal sampling for partial coverage and cylindrical rendering', () => {
    const partialSphere = renderMode('sphere', 180);
    const cylinder = renderMode('cylindrical', 360);

    expect(wrapSParam(partialSphere.calls, partialSphere.gl)).toBe(partialSphere.gl.CLAMP_TO_EDGE);
    expect(wrapSParam(cylinder.calls, cylinder.gl)).toBe(cylinder.gl.CLAMP_TO_EDGE);
  });
});
