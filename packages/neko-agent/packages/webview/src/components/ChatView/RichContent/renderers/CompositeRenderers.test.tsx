import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { registerDefaultRenderers, RichContentRenderer } from '@/components/ChatView/RichContent';
import { richContentRegistry } from '../RichContentRegistry';
import type {
  AssetGalleryRichData,
  ComparisonGridRichData,
  StoryboardTableRichData,
} from '@/presenters/composite-content-presenter';

describe('composite rich content renderers', () => {
  it('registers storyboard, comparison, and gallery renderers', () => {
    registerDefaultRenderers();

    expect(richContentRegistry.has('storyboard-table')).toBe(true);
    expect(richContentRegistry.has('comparison-grid')).toBe(true);
    expect(richContentRegistry.has('asset-gallery')).toBe(true);
  });

  it('renders storyboard rows with media previews and diagnostics', () => {
    registerDefaultRenderers();

    render(
      <RichContentRenderer
        kind="storyboard-table"
        data={
          {
            template: 'storyboard-table',
            title: 'Opening',
            sections: [
              {
                id: 'section-0',
                index: 0,
                heading: 'Shot 1',
                content: 'Wide establishing frame',
                media: [
                  {
                    id: 'media-1',
                    toolCallId: 'call-1',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://asset.png',
                    caption: 'Wide',
                  },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [
              {
                code: 'missing-asset',
                toolCallId: 'call-2',
                assetIndex: 1,
                message: 'Asset 1 is not available for call-2',
              },
            ],
          } satisfies StoryboardTableRichData
        }
      />,
    );

    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.getByText('Shot 1')).toBeTruthy();
    expect(screen.getByText('Wide establishing frame')).toBeTruthy();
    expect(screen.getByAltText('Wide')).toBeTruthy();
    expect(screen.getByText('Asset 1 is not available for call-2')).toBeTruthy();
  });

  it('renders comparison variants', () => {
    registerDefaultRenderers();

    render(
      <RichContentRenderer
        kind="comparison-grid"
        data={
          {
            template: 'comparison',
            sections: [
              {
                id: 'section-a',
                index: 0,
                heading: 'Variant A',
                media: [
                  {
                    id: 'media-a',
                    toolCallId: 'call-a',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://a.png',
                    caption: 'A',
                  },
                ],
                diagnostics: [],
              },
              {
                id: 'section-b',
                index: 1,
                heading: 'Variant B',
                media: [
                  {
                    id: 'media-b',
                    toolCallId: 'call-b',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://b.png',
                    caption: 'B',
                  },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          } satisfies ComparisonGridRichData
        }
      />,
    );

    expect(screen.getByText('Comparison')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders gallery assets', () => {
    registerDefaultRenderers();

    render(
      <RichContentRenderer
        kind="asset-gallery"
        data={
          {
            template: 'gallery',
            title: 'Generated assets',
            sections: [
              {
                id: 'section-0',
                index: 0,
                heading: 'Keepers',
                media: [
                  {
                    id: 'asset-1',
                    toolCallId: 'call-1',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://asset.png',
                    caption: 'Final',
                    localPath: '/repo/out.png',
                  },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          } satisfies AssetGalleryRichData
        }
      />,
    );

    expect(screen.getByText('Generated assets')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
  });
});
