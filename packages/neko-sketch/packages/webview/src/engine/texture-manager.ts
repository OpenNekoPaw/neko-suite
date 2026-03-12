/**
 * Texture Manager
 *
 * Creates, updates, and manages WebGL textures and framebuffers.
 */
import type { ITextureManager } from './types';

export class TextureManager implements ITextureManager {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures = new Set<WebGLTexture>();
  private readonly framebuffers = new Set<WebGLFramebuffer>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  createTexture(width: number, height: number, data?: Uint8Array | null): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data ?? null,
    );

    // Clamp and linear filter for painting
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindTexture(gl.TEXTURE_2D, null);
    this.textures.add(texture);
    return texture;
  }

  createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Failed to create framebuffer');

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.framebuffers.add(fbo);
    return fbo;
  }

  updateTexture(
    texture: WebGLTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    data: Uint8Array,
  ): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  readPixels(fbo: WebGLFramebuffer, x: number, y: number, w: number, h: number): Uint8Array {
    const gl = this.gl;
    const pixels = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);
    this.textures.delete(texture);
  }

  deleteFramebuffer(fbo: WebGLFramebuffer): void {
    this.gl.deleteFramebuffer(fbo);
    this.framebuffers.delete(fbo);
  }

  dispose(): void {
    this.framebuffers.forEach((fbo) => this.gl.deleteFramebuffer(fbo));
    this.textures.forEach((tex) => this.gl.deleteTexture(tex));
    this.framebuffers.clear();
    this.textures.clear();
  }
}
