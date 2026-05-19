import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_SYSTEM, type ToolResult } from '@neko/shared';
import { createReadImageTool } from '../readImageTool';

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
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

  it('uses the current platform service for vision mode', async () => {
    const readFile = vi.fn(async () => PNG_1X1);
    const service = {
      chat: vi.fn(async () => ({
        message: { role: 'assistant', content: 'one tiny image' },
      })),
    };
    const platform = {
      createService: vi.fn(() => service),
    };
    const tool = createReadImageTool({ readFile, platform: platform as never });

    const result = (await tool.execute({
      images: [{ path: '/images/page.png', label: 'P1' }],
      mode: 'vision',
      analysis: 'describe',
    })) as ToolResult;

    expect(result.success).toBe(true);
    expect(service.chat).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'user',
        content: expect.arrayContaining([
          expect.objectContaining({ type: 'text' }),
          expect.objectContaining({
            type: 'image',
            imageUrl: expect.stringContaining('data:image/png;base64,'),
          }),
        ]),
      }),
    ]);
    expect(result.data).toEqual(
      expect.objectContaining({
        mode: 'vision',
        images: [expect.objectContaining({ analysis: 'one tiny image', label: 'P1' })],
      }),
    );
  });
});
