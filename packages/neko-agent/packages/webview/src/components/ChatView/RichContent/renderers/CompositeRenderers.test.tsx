import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/I18nContext';
import { chat as enChat } from '@/i18n/locales/en/chat';
import { chat as zhCnChat } from '@/i18n/locales/zh-cn/chat';
import { registerDefaultRenderers, RichContentRenderer } from '@/components/ChatView/RichContent';
import { richContentRegistry } from '../RichContentRegistry';
import { I18nService } from '@neko/shared';
import type { CompositeArtifactRichData } from './CompositeArtifactRenderer';
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
    expect(richContentRegistry.has('composite-artifact')).toBe(true);
  });

  it('renders composite artifact review tables and blocking diagnostics without execute controls', () => {
    registerDefaultRenderers();

    render(
      <RichContentRenderer
        kind="composite-artifact"
        data={
          {
            schemaVersion: 1,
            kind: 'composite-artifact',
            artifactId: 'comic-review-1',
            profile: 'comic-animation-review',
            title: 'Comic Animation Review',
            suggestedActions: [
              {
                actionId: 'run-batch',
                kind: 'execute',
                label: 'Run Batch',
                disabled: true,
                disabledReason: 'Provider unavailable',
              },
            ],
            diagnostics: [
              {
                severity: 'warning',
                code: 'provider-unavailable',
                path: ['batchExecutionPlan', 'items', 0],
                message: 'Local OCR provider unavailable.',
              },
            ],
            blocks: [
              {
                blockId: 'visual-occurrences',
                kind: 'table',
                title: 'Visual Occurrences',
                table: {
                  schemaVersion: 1,
                  kind: 'generic-table',
                  tableId: 'visual-occurrence-review',
                  profile: 'comic-visual-occurrence-review',
                  title: 'Visual Occurrence Review',
                  columns: [
                    { columnId: 'occurrenceId', label: 'Occurrence', cellType: 'string' },
                    { columnId: 'confidence', label: 'Confidence', cellType: 'number' },
                    { columnId: 'status', label: 'Status', cellType: 'status' },
                    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
                  ],
                  rows: [
                    {
                      rowId: 'occ-1',
                      status: 'needs-review',
                      cells: {
                        occurrenceId: { type: 'string', value: 'occ-1' },
                        confidence: { type: 'number', value: 0.42 },
                        status: { type: 'status', value: 'needs-review' },
                        diagnostics: {
                          type: 'diagnostic',
                          value: {
                            severity: 'warning',
                            code: 'invalid-required-field',
                            path: ['visualOccurrences', 0, 'confidence'],
                            message: 'Low confidence visual occurrence.',
                          },
                        },
                      },
                    },
                  ],
                },
              },
              {
                blockId: 'batch-execution',
                kind: 'table',
                title: 'Batch Execution',
                table: {
                  schemaVersion: 1,
                  kind: 'generic-table',
                  tableId: 'batch-execution-review',
                  profile: 'batch-execution-review',
                  title: 'Batch Execution Review',
                  columns: [
                    { columnId: 'itemId', label: 'Item', cellType: 'string' },
                    { columnId: 'capabilityId', label: 'Capability', cellType: 'string' },
                    { columnId: 'status', label: 'Status', cellType: 'status' },
                    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
                  ],
                  rows: [
                    {
                      rowId: 'item-1',
                      status: 'blocked',
                      cells: {
                        itemId: { type: 'string', value: 'item-1' },
                        capabilityId: { type: 'string', value: 'perception.ocr' },
                        status: { type: 'status', value: 'blocked' },
                        diagnostics: {
                          type: 'diagnostic',
                          value: {
                            severity: 'error',
                            code: 'invalid-required-field',
                            path: ['costEstimate'],
                            message: 'Cost is unknown.',
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          } satisfies CompositeArtifactRichData
        }
      />,
    );

    expect(screen.getByText('Comic Animation Review')).toBeTruthy();
    expect(screen.getByText('comic-animation-review')).toBeTruthy();
    expect(screen.getByText('Run Batch')).toBeTruthy();
    expect(screen.getByText(/disabled: Provider unavailable/)).toBeTruthy();
    expect(screen.getByText(/Local OCR provider unavailable/)).toBeTruthy();
    expect(screen.getByText('Visual Occurrences')).toBeTruthy();
    expect(screen.getByText('Visual Occurrence Review')).toBeTruthy();
    expect(screen.getByText('occ-1')).toBeTruthy();
    expect(screen.getByText('0.42')).toBeTruthy();
    expect(screen.getAllByText('needs-review').length).toBeGreaterThan(0);
    expect(screen.getByText(/Low confidence visual occurrence/)).toBeTruthy();
    expect(screen.getByText('Batch Execution')).toBeTruthy();
    expect(screen.getByText('perception.ocr')).toBeTruthy();
    expect(screen.getByText(/Cost is unknown/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Run Batch|execute/i })).toBeNull();
  });

  it('renders storyboard rows with media previews and diagnostics', () => {
    registerDefaultRenderers();

    renderWithI18n(
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
                    role: 'original',
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
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Asset 1 is not available for call-2')).toBeTruthy();
  });

  it('renders semantic storyboard table fields instead of only fallback row content', () => {
    registerDefaultRenderers();

    renderWithI18n(
      <RichContentRenderer
        kind="storyboard-table"
        data={
          {
            template: 'storyboard-table',
            title: 'Semantic Opening',
            storyboardTable: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Semantic Opening',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'INT. CAFE - DAY',
                  sceneNumber: 1,
                  location: 'Cafe',
                  timeOfDay: 'Day',
                  summary: 'Rin finds the signal.',
                  shots: [
                    {
                      shotId: 'shot-1',
                      shotNumber: 1,
                      duration: 4,
                      visualDescription: 'Rin notices a blue pulse under the table.',
                      characterAction: 'Rin kneels and reaches toward the light.',
                      characters: [
                        {
                          name: 'Rin',
                          role: 'primary',
                          action: 'kneels',
                          emotion: 'focused',
                        },
                      ],
                      shotScale: 'CU',
                      cameraAngle: 'low-angle',
                      cameraMovement: 'zoom-in',
                      emotion: ['focused', 'curious'],
                      sceneTags: ['signal'],
                      dialogue: '找到了。',
                      textCues: [
                        {
                          cueId: 'shot-1-text-1',
                          kind: 'dialogue',
                          text: '找到了。',
                          speakerName: 'Rin',
                          speakerCharacterId: 'char-rin',
                          emotion: 'focused',
                          delivery: 'quietly',
                        },
                        {
                          cueId: 'shot-1-text-2',
                          kind: 'narration',
                          text: '她终于看见线索。',
                        },
                        {
                          cueId: 'shot-1-text-3',
                          kind: 'sfx',
                          text: '嗡',
                        },
                        {
                          cueId: 'shot-1-text-4',
                          kind: 'backgroundText',
                          text: 'CAFE',
                        },
                      ],
                      voiceOver: '她终于看见线索。',
                      soundCue: '嗡',
                      visualStyle: 'noir manga',
                      vfx: ['blue glow'],
                      generationPrompt: 'close-up, blue pulse, manga noir',
                      imageStrategy: 'use-as-reference',
                      decisionReason: 'Keep the manga panel composition as reference.',
                    },
                  ],
                },
              ],
            },
            sections: [
              {
                id: 'section-0',
                index: 0,
                heading: 'Fallback Shot 1',
                content: 'Fallback content',
                media: [
                  {
                    id: 'media-1',
                    toolCallId: 'read-image',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://panel.png',
                    caption: 'Original panel',
                    role: 'source',
                  },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          } satisfies StoryboardTableRichData
        }
      />,
    );

    expect(screen.getByText('Semantic Opening')).toBeTruthy();
    expect(screen.getByText('1 shots')).toBeTruthy();
    expect(screen.getByText('#01')).toBeTruthy();
    expect(screen.getByText('INT. CAFE - DAY')).toBeTruthy();
    expect(screen.getByText(/Scene 1/)).toBeTruthy();
    expect(screen.getByText(/Location: Cafe/)).toBeTruthy();
    expect(screen.getByText(/Time: Day/)).toBeTruthy();
    expect(screen.getByText('Rin finds the signal.')).toBeTruthy();
    expect(screen.getByText('4s')).toBeTruthy();
    expect(screen.getByText('CU / low-angle / zoom-in')).toBeTruthy();
    expect(screen.getByText('Rin notices a blue pulse under the table.')).toBeTruthy();
    expect(screen.getByText('Rin kneels and reaches toward the light.')).toBeTruthy();
    expect(screen.getByText('Characters')).toBeTruthy();
    expect(screen.getByText('Rin (primary) kneels focused')).toBeTruthy();
    expect(screen.getByText('Emotion: focused, curious')).toBeTruthy();
    expect(screen.getByText(/Dialogue \/ Rin \[char-rin\]: 找到了。/)).toBeTruthy();
    expect(screen.getByText(/Narration: 她终于看见线索。/)).toBeTruthy();
    expect(screen.getByText(/SFX Text: 嗡/)).toBeTruthy();
    expect(screen.getByText(/Background Text: CAFE/)).toBeTruthy();
    expect(screen.getByText(/Style: noir manga/)).toBeTruthy();
    expect(screen.getByText(/VFX: blue glow/)).toBeTruthy();
    expect(screen.getByText(/Prompt: close-up, blue pulse, manga noir/)).toBeTruthy();
    expect(screen.getByText('use-as-reference')).toBeTruthy();
    expect(screen.getByText('Keep the manga panel composition as reference.')).toBeTruthy();
    expect(screen.getByAltText('Original panel')).toBeTruthy();
  });

  it('renders storyboard table transfer actions for available targets', () => {
    registerDefaultRenderers();

    renderWithI18n(
      <RichContentRenderer
        kind="storyboard-table"
        data={
          {
            template: 'storyboard-table',
            title: 'Transferable Storyboard',
            plugins: { canvas: true, cut: true },
            storyboardTable: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: 'Transferable Storyboard',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: 'Page 1',
                  shots: [
                    {
                      shotNumber: 1,
                      duration: 3,
                      visualDescription: 'A figure pauses at the cave entrance.',
                      characterAction: 'The figure holds a lantern.',
                      imageStrategy: 'reuse-original',
                      sourceMediaRefs: [
                        {
                          refId: 'panel-1',
                          role: 'source',
                          locator: {
                            type: 'tool-result',
                            toolCallId: 'read-image',
                            assetIndex: 0,
                          },
                          mimeType: 'image/jpeg',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            sections: [
              {
                id: 'section-0',
                index: 0,
                heading: 'Shot 1',
                media: [
                  {
                    id: 'read-image:0:/repo/page-1.jpg',
                    toolCallId: 'read-image',
                    assetIndex: 0,
                    type: 'image',
                    src: 'webview://page-1.jpg',
                    localPath: '/repo/page-1.jpg',
                    mimeType: 'image/jpeg',
                  },
                ],
                diagnostics: [],
              },
            ],
            diagnostics: [],
          } satisfies StoryboardTableRichData
        }
      />,
    );

    expect(screen.getByTitle('Open in Canvas')).toBeTruthy();
    expect(screen.getByTitle('Open in Timeline')).toBeTruthy();
    expect(screen.getByTitle('Open in Explorer')).toBeTruthy();
  });

  it('localizes semantic storyboard table field labels', () => {
    registerDefaultRenderers();

    renderWithI18n(
      <RichContentRenderer
        kind="storyboard-table"
        data={
          {
            template: 'storyboard-table',
            title: '中文分镜',
            storyboardTable: {
              schemaVersion: 1,
              kind: 'storyboard-table',
              title: '中文分镜',
              scenes: [
                {
                  sceneId: 'scene-1',
                  sceneTitle: '第1页',
                  sceneNumber: 1,
                  location: '沙漠',
                  timeOfDay: '黃昏',
                  summary: '角色准备出发。',
                  shots: [
                    {
                      shotNumber: 1,
                      duration: 2,
                      visualDescription: '角色看向远方。',
                      characterAction: '角色停下脚步。',
                      characters: [{ name: '燈神', role: 'primary' }],
                      dialogue: '開始吧。',
                      soundCue: '沙',
                      visualStyle: '繁中漫画',
                      generationPrompt: '漫画分镜',
                      imageStrategy: 'generate-new',
                    },
                  ],
                },
              ],
            },
            sections: [{ id: 'section-0', index: 0, media: [], diagnostics: [] }],
            diagnostics: [],
          } satisfies StoryboardTableRichData
        }
      />,
      'zh-cn',
    );

    expect(screen.getByText('1 个镜头')).toBeTruthy();
    expect(screen.getByText(/场景 1/)).toBeTruthy();
    expect(screen.getByText(/地点: 沙漠/)).toBeTruthy();
    expect(screen.getByText(/时间: 黃昏/)).toBeTruthy();
    expect(screen.getByText('角色准备出发。')).toBeTruthy();
    expect(screen.getByText('镜头')).toBeTruthy();
    expect(screen.getByText('图片')).toBeTruthy();
    expect(screen.getByText('时长')).toBeTruthy();
    expect(screen.getByText('画面 / 动作')).toBeTruthy();
    expect(screen.getByText('人物')).toBeTruthy();
    expect(screen.getByText(/燈神/)).toBeTruthy();
    expect(screen.getByText(/对白: 開始吧。/)).toBeTruthy();
    expect(screen.getByText(/音效: 沙/)).toBeTruthy();
    expect(screen.getByText(/风格: 繁中漫画/)).toBeTruthy();
    expect(screen.getByText(/提示词: 漫画分镜/)).toBeTruthy();
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

function renderWithI18n(node: React.ReactElement, locale: 'en' | 'zh-cn' = 'en') {
  const service = new I18nService(locale);
  service.registerBundle('chat', 'en', enChat);
  service.registerBundle('chat', 'zh-cn', zhCnChat);
  return render(<I18nProvider service={service}>{node}</I18nProvider>);
}
