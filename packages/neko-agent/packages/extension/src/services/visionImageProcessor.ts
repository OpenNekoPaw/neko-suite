import type { VisionImageProcessor } from '@neko/platform/media';

export function createSharpVisionImageProcessor(): VisionImageProcessor {
  return {
    metadata: async (buffer) => {
      const sharp = (await import('sharp')).default;
      return sharp(buffer).metadata();
    },
    toJpeg: async (input) => {
      const sharp = (await import('sharp')).default;
      let image = sharp(input.buffer);
      if (input.resize) {
        image = image.resize(input.resize);
      }
      return image.jpeg({ quality: input.jpegQuality }).toBuffer();
    },
  };
}
