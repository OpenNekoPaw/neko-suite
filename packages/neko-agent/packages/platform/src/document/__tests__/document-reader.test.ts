import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentReaderRuntime,
  estimateSlideCount,
  isSupportedDocumentPath,
  stripHtmlToText,
  type DocumentReaderRuntimeDeps,
} from '../document-reader';

function createDeps(overrides: Partial<DocumentReaderRuntimeDeps> = {}): DocumentReaderRuntimeDeps {
  return {
    readTextFile: vi.fn(async () => ''),
    readBinaryFile: vi.fn(async () => new Uint8Array()),
    writeBinaryFile: vi.fn(async () => undefined),
    makeDir: vi.fn(async () => undefined),
    tempDir: () => '/tmp',
    loadModule: vi.fn(async () => null),
    now: () => new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('document-reader runtime', () => {
  it('检测支持的文档扩展名', () => {
    expect(isSupportedDocumentPath('/doc/story.pdf')).toBe(true);
    expect(isSupportedDocumentPath('/doc/story.FDX')).toBe(true);
    expect(isSupportedDocumentPath('/doc/story.exe')).toBe(false);
  });

  it('清洗 HTML 文本并移除脚本样式', () => {
    const text = stripHtmlToText(
      '<html><style>.x{}</style><script>alert(1)</script><body><h1>标题</h1><p>正文</p></body></html>',
    );

    expect(text).toBe('标题 正文');
  });

  it('估算 PPT 页数', () => {
    expect(estimateSlideCount('slide 1\n\nslide 2\n\n')).toBe(2);
  });

  it('通过平台运行时依赖检测 PDF DRM', async () => {
    const reader = createDocumentReaderRuntime(
      createDeps({
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('PDF /Encrypt metadata')),
      }),
    );

    await expect(reader.hasDRM('/doc/protected.pdf')).resolves.toBe(true);
  });

  it('解析 Final Draft 场景结构', async () => {
    class FakeXmlParser {
      parse(): unknown {
        return {
          FinalDraft: {
            Content: {
              TitlePage: { Content: 'Demo' },
              Paragraph: [
                { '@_Type': 'Scene Heading', Text: 'INT. OFFICE - DAY' },
                { '@_Type': 'Action', Text: 'John enters.' },
              ],
            },
          },
        };
      }
    }

    const reader = createDocumentReaderRuntime(
      createDeps({
        readTextFile: vi.fn(async () => '<xml />'),
        loadModule: vi.fn(async <T>(packageName: string) => {
          if (packageName === 'fast-xml-parser') {
            return { XMLParser: FakeXmlParser } as T;
          }
          return null;
        }),
      }),
    );

    const result = await reader.read('/doc/script.fdx');

    expect(result.text).toContain('INT. OFFICE - DAY');
    expect(result.metadata?.['format']).toBe('fdx');
    expect(result.metadata?.['title']).toBe('Demo');
  });
});
