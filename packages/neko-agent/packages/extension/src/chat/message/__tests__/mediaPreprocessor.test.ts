import { describe, expect, it, vi } from 'vitest';
import { MediaPreprocessor } from '../mediaPreprocessor';

const processMock = vi.hoisted(() => vi.fn());
const processImageMock = vi.hoisted(() => vi.fn());
const processVideoMock = vi.hoisted(() => vi.fn());

vi.mock('@neko/platform/media', () => ({
  VisionPreprocessor: class {
    process = processMock;
    processImage = processImageMock;
    processVideo = processVideoMock;
  },
}));

vi.mock('../../../services/visionImageProcessor', () => ({
  createSharpVisionImageProcessor: vi.fn(() => ({})),
}));

vi.mock('../../../services/documentPathResolver', () => ({
  resolveDocumentPath: vi.fn(async (filePath: string) =>
    filePath.replace('${A}', '/Volumes/assets'),
  ),
}));

vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('MediaPreprocessor', () => {
  it('resolves PathResolver variables before auto media preprocessing', async () => {
    processMock.mockResolvedValue({ type: 'unsupported', images: [] });

    const processor = new MediaPreprocessor(null);
    await processor.process('${A}/video/clip.mp4');

    expect(processMock).toHaveBeenCalledWith('/Volumes/assets/video/clip.mp4', undefined);
  });

  it('resolves PathResolver variables before image and video preprocessing', async () => {
    processImageMock.mockResolvedValue({ type: 'unsupported', images: [] });
    processVideoMock.mockResolvedValue({ type: 'unsupported', images: [] });

    const processor = new MediaPreprocessor(null);
    await processor.processImage('${A}/image/ref.png');
    await processor.processVideo('${A}/video/ref.mp4', { maxFrames: 3 });

    expect(processImageMock).toHaveBeenCalledWith('/Volumes/assets/image/ref.png');
    expect(processVideoMock).toHaveBeenCalledWith('/Volumes/assets/video/ref.mp4', {
      maxFrames: 3,
    });
  });
});
