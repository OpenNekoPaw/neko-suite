export function compileWebGLProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  label: string,
): WebGLProgram {
  let vert: WebGLShader | null = null;
  let frag: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    vert = compileWebGLShader(gl, gl.VERTEX_SHADER, vertSrc, label);
    frag = compileWebGLShader(gl, gl.FRAGMENT_SHADER, fragSrc, label);

    program = gl.createProgram();
    if (!program) {
      throw new Error(formatProgramCreateError(label));
    }

    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(formatProgramLinkError(label, info));
    }

    return program;
  } catch (error) {
    if (program) {
      gl.deleteProgram(program);
    }
    throw error;
  } finally {
    if (vert) {
      gl.deleteShader(vert);
    }
    if (frag) {
      gl.deleteShader(frag);
    }
  }
}

function compileWebGLShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(formatShaderCompileError(label, info));
  }

  return shader;
}

function formatProgramCreateError(label: string): string {
  if (label === 'Shader') {
    return 'Failed to create WebGL program';
  }
  return `Failed to create ${label.toLowerCase()} program`;
}

function formatProgramLinkError(label: string, info: string | null): string {
  if (label === 'Shader') {
    return `Shader link failed: ${info}`;
  }
  return `${label} program link failed: ${info}`;
}

function formatShaderCompileError(label: string, info: string | null): string {
  if (label === 'Shader') {
    return `Shader compile failed: ${info}`;
  }
  return `${label} shader compile failed: ${info}`;
}
