/**
 * AttachmentProcessor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { AttachmentProcessor } from '../attachmentProcessor';

// Mock fs.promises for file reading
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AttachmentProcessor', () => {
  let processor: AttachmentProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new AttachmentProcessor();
  });

  describe('processAttachments', () => {
    it('should return empty result for undefined attachments', async () => {
      const result = await processor.processAttachments(undefined);

      expect(result.textContent).toBe('');
      expect(result.imageAttachments).toEqual([]);
    });

    it('should return empty result for empty array', async () => {
      const result = await processor.processAttachments([]);

      expect(result.textContent).toBe('');
      expect(result.imageAttachments).toEqual([]);
    });

    it('should process image attachment with base64 preview', async () => {
      const attachments = [
        {
          type: 'image' as const,
          name: 'photo.png',
          preview: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.imageAttachments).toHaveLength(1);
      expect(result.imageAttachments[0]).toEqual({
        type: 'base64',
        media_type: 'image/png',
        data: 'iVBORw0KGgoAAAANS',
      });
    });

    it('should process image attachment from file path', async () => {
      const mockBuffer = Buffer.from('fake-image-data');
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockBuffer);

      const attachments = [
        {
          type: 'image' as const,
          name: 'photo.jpg',
          path: '/tmp/photo.jpg',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(fs.promises.readFile).toHaveBeenCalledWith('/tmp/photo.jpg');
      expect(result.imageAttachments).toHaveLength(1);
      expect(result.imageAttachments[0]).toEqual({
        type: 'base64',
        media_type: 'image/jpeg',
        data: mockBuffer.toString('base64'),
      });
    });

    it('should handle image read failure gracefully', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));

      const attachments = [
        {
          type: 'image' as const,
          name: 'missing.png',
          path: '/tmp/missing.png',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.imageAttachments).toHaveLength(0);
    });

    it('should process file attachment by reading content', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('const x = 1;' as any);

      const attachments = [
        {
          type: 'file' as const,
          name: 'code.ts',
          path: '/tmp/code.ts',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('### File: code.ts');
      expect(result.textContent).toContain('const x = 1;');
    });

    it('should handle file read failure gracefully', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('Permission denied'));

      const attachments = [
        {
          type: 'file' as const,
          name: 'secret.txt',
          path: '/tmp/secret.txt',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('### File: secret.txt');
      expect(result.textContent).toContain('Failed to read file');
    });

    it('should process video/audio attachment as reference', async () => {
      const attachments = [
        {
          type: 'video' as const,
          name: 'clip.mp4',
          path: '/tmp/clip.mp4',
        },
        {
          type: 'audio' as const,
          name: 'music.mp3',
          path: '/tmp/music.mp3',
        },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.textContent).toContain('[Attached video: clip.mp4]');
      expect(result.textContent).toContain('(path: /tmp/clip.mp4)');
      expect(result.textContent).toContain('[Attached audio: music.mp3]');
    });

    it('should process mixed attachments', async () => {
      vi.mocked(fs.promises.readFile).mockResolvedValue('file content' as any);

      const attachments = [
        { type: 'image' as const, name: 'img.png', preview: 'data:image/png;base64,abc123' },
        { type: 'file' as const, name: 'readme.md', path: '/tmp/readme.md' },
        { type: 'video' as const, name: 'demo.mp4' },
      ];

      const result = await processor.processAttachments(attachments);

      expect(result.imageAttachments).toHaveLength(1);
      expect(result.textContent).toContain('### File: readme.md');
      expect(result.textContent).toContain('[Attached video: demo.mp4]');
    });
  });

  describe('readFileAsBase64', () => {
    it('should read and convert to base64 with correct mime type', async () => {
      const mockBuffer = Buffer.from('test');
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockBuffer);

      const result = await processor.readFileAsBase64('/path/to/image.webp');

      expect(result).toEqual({
        type: 'base64',
        media_type: 'image/webp',
        data: mockBuffer.toString('base64'),
      });
    });

    it('should default to image/png for unknown extensions', async () => {
      const mockBuffer = Buffer.from('test');
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockBuffer);

      const result = await processor.readFileAsBase64('/path/to/image.tiff');

      expect(result?.media_type).toBe('image/png');
    });

    it('should return null on read failure', async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await processor.readFileAsBase64('/nonexistent.png');

      expect(result).toBeNull();
    });
  });
});
