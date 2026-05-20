import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ToolResult } from '@neko/shared';
import { createReadImageTool } from '../readImageTool';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

const JPEG_1X1 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x00, 0x01, 0x00,
  0x01, 0x03, 0x01, 0x11, 0x00, 0xff, 0xd9,
]);

describe('createReadImageTool', () => {
  it('creates a read-only image tool', () => {
    const tool = createReadImageTool();

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.READ_IMAGE);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.parameters).not.toHaveProperty('anyOf');
    expect(tool.parameters).not.toHaveProperty('oneOf');
    expect(tool.parameters).not.toHaveProperty('allOf');
  });

  it('reads local image metadata without invoking vision', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const tool = createReadImageTool({ readFile });

    const result = (await tool.execute({
      image_paths: ['/images/page.png'],
      mode: 'metadata',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(readFile).toHaveBeenCalledWith('/images/page.png');
    expect(result.data).toEqual(
      expect.objectContaining({
        mode: 'metadata',
        images: [
          expect.objectContaining({
            path: '/images/page.png',
            width: 1,
            height: 1,
            mimeType: 'image/png',
            byteSize: PNG_1X1.byteLength,
          }),
        ],
      }),
    );
  });

  it('preprocesses vision images before sending them to the current platform service', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const imageProcessor = {
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      toJpeg: vi.fn(async () => JPEG_1X1),
    };
    const service = {
      chat: vi.fn(async () => ({
        message: { role: 'assistant', content: 'one tiny image' },
      })),
    };
    const platform = {
      createService: vi.fn(() => service),
    };
    const tool = createReadImageTool({ readFile, imageProcessor, platform: platform as never });

    const result = (await tool.execute({
      images: [{ path: '/images/page.png', label: 'P1' }],
      mode: 'vision',
      analysis: 'describe',
      max_long_edge: 512,
      quality: 80,
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(imageProcessor.toJpeg).toHaveBeenCalledWith({
      buffer: PNG_1X1,
      jpegQuality: 80,
    });
    expect(service.chat).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
          expect.objectContaining({
            type: 'image',
            imageUrl: expect.stringContaining('data:image/jpeg;base64,'),
          }),
        ]),
      }),
    ]);
    expect(result.data).toEqual(
      expect.objectContaining({
        mode: 'vision',
        images: [
          expect.objectContaining({
            analysis: 'one tiny image',
            label: 'P1',
            mimeType: 'image/png',
            visionInput: expect.objectContaining({
              preprocess: 'auto',
              transformed: true,
              mimeType: 'image/jpeg',
              maxLongEdge: 512,
              jpegQuality: 80,
            }),
          }),
        ],
      }),
    );
  });

  it('can send original bytes when vision preprocessing is disabled', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const imageProcessor = {
      metadata: vi.fn(async () => ({ width: 1, height: 1 })),
      toJpeg: vi.fn(async () => JPEG_1X1),
    };
    const service = {
      chat: vi.fn(async () => ({
        message: { role: 'assistant', content: 'original image' },
      })),
    };
    const platform = {
      createService: vi.fn(() => service),
    };
    const tool = createReadImageTool({ readFile, imageProcessor, platform: platform as never });

    const result = (await tool.execute({
      image_paths: ['/images/page.png'],
      mode: 'vision',
      preprocess: 'none',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(imageProcessor.toJpeg).not.toHaveBeenCalled();
    expect(service.chat).toHaveBeenCalledWith([
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            imageUrl: expect.stringContaining('data:image/png;base64,'),
          }),
        ]),
      }),
    ]);
    expect(result.data).toEqual(
      expect.objectContaining({
        images: [
          expect.objectContaining({
            visionInput: expect.objectContaining({
              preprocess: 'none',
              transformed: false,
              mimeType: 'image/png',
              byteSize: PNG_1X1.byteLength,
            }),
          }),
        ],
      }),
    );
  });
});
