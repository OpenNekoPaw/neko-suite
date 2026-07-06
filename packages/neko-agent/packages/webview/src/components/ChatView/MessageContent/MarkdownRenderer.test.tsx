import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { MarkdownResourceRenderingProjection } from '@/presenters/markdown-resource-rendering-presenter';

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['count'] !== undefined ? `${String(vars['count'])} ${key}` : key,
  }),
}));

vi.mock('@/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    ({
      'chat.structuredArtifact.generating': 'Generating structured content...',
      'chat.markdown.resourceStatus.image': '图像',
      'chat.markdown.resourceStatus.images': `${String(params?.['count'] ?? '')} 张图像`,
      'chat.markdown.resourceStatus.candidates': `${String(params?.['count'] ?? '')} 个候选`,
      'chat.markdown.resourceStatus.ambiguous': '有歧义',
      'chat.markdown.resourceStatus.missing': '缺失',
      'chat.markdown.resourceStatus.unsupported': '不支持',
      'chat.markdown.resourceStatus.unbound': '未绑定',
      'chat.markdown.diagnostic.missingResourceToken': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 未匹配到已知资源。`,
      'chat.markdown.diagnostic.missingResourceContext': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 无法解析，因为这条消息没有图像资源上下文。`,
      'chat.markdown.diagnostic.ambiguousResourceToken': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 匹配到多个资源。`,
      'chat.markdown.diagnostic.unsupportedResourceReference': 'Agent Markdown 渲染暂未启用 Neko 资源引用嵌入和链接。',
      'chat.markdown.image.unprojected': `图像引用 "${String(params?.['src'] ?? '')}" 尚未由宿主投影。`,
      'chat.markdown.image.missingSource': '图像引用缺少来源。',
    })[key] ?? key,
  getLocale: () => 'zh-cn',
}));

describe('MarkdownRenderer structured artifacts', () => {
  it('renders uppercase neko composite artifacts as storyboard tables', () => {
    renderMarkdown(`Summary.

\`\`\`NEKO
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "artifact-storyboard",
  "title": "Comic artifact",
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "title": "Opening",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition.",
                "characterAction": "Rin enters the frame.",
                "imageStrategy": "use-as-reference"
              }
            ]
          }
        ]
      }
    }
  ]
}
\`\`\``);

    expect(screen.getByText('Summary.')).toBeTruthy();
    expect(screen.getByText('Storyboard Payload')).toBeTruthy();
    expect(screen.getByText('Panel action and composition.')).toBeTruthy();
    expect(screen.queryByText('NEKO')).toBeNull();
    expect(screen.queryByText(/"kind": "composite-artifact"/)).toBeNull();
  });

  it('hides incomplete structured artifact source while streaming', () => {
    renderMarkdown(
      `\`\`\`neko
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "blocks": [`,
      true,
    );

    expect(screen.getByText('Generating structured content...')).toBeTruthy();
    expect(screen.queryByText(/"schemaVersion": 1/)).toBeNull();
  });

  it('keeps ordinary json code blocks visible', () => {
    renderMarkdown(`\`\`\`json
{ "hello": "world" }
\`\`\``);

    expect(screen.getByText('json')).toBeTruthy();
    expect(screen.getByText(/hello/)).toBeTruthy();
  });

  it('renders non-storyboard composite artifacts with the generic artifact renderer', () => {
    renderMarkdown(`\`\`\`NEKO
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "character-review",
  "title": "Character Review",
  "profile": "character-memory-review",
  "blocks": [
    {
      "blockId": "review-table",
      "kind": "table",
      "title": "Review Table",
      "table": {
        "schemaVersion": 1,
        "kind": "generic-table",
        "tableId": "characters",
        "title": "Characters",
        "columns": [
          { "columnId": "name", "label": "Name", "cellType": "string" },
          { "columnId": "status", "label": "Status", "cellType": "status" }
        ],
        "rows": [
          {
            "rowId": "hero",
            "cells": {
              "name": { "type": "string", "value": "少年英雄" },
              "status": { "type": "status", "value": "needs-review" }
            }
          }
        ]
      }
    }
  ]
}
\`\`\``);

    expect(screen.getByText('Character Review')).toBeTruthy();
    expect(screen.getByText('character-memory-review')).toBeTruthy();
    expect(screen.getByText('Characters')).toBeTruthy();
    expect(screen.getByText('少年英雄')).toBeTruthy();
    expect(screen.queryByText(/"artifactId": "character-review"/)).toBeNull();
  });

  it('renders resource token thumbnails from projection without persisting render URIs', () => {
    const projection: MarkdownResourceRenderingProjection = {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'page_1',
          status: 'bound',
          refs: [{ label: 'Page 1', role: 'source' }],
          resources: [
            { token: 'page_1', label: 'Page 1', role: 'source', sourcePath: 'assets/page-1.png' },
          ],
          renderUris: ['vscode-webview://page-1'],
          diagnostics: [],
        },
      ],
    };

    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | page_1 | 4s | Frame |',
      ].join('\n'),
      false,
      projection,
    );

    expect(screen.queryByText('page_1')).toBeNull();
    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1');
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://page-1');
  });

  it('renders table resource images as uncropped media previews', () => {
    renderMarkdown(
      [
        '| shot id | source | visual |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing page |',
      ].join('\n'),
      false,
      {
        status: 'ready',
        diagnostics: [],
        tokens: [
          {
            token: 'P1',
            status: 'bound',
            refs: [{ label: 'Page 1', role: 'source' }],
            resources: [{ token: 'P1', label: 'Page 1', role: 'source', sourcePath: 'P1' }],
            renderUris: ['vscode-webview://page-1'],
            diagnostics: [],
          },
        ],
      },
    );

    const image = screen.getByAltText('Page 1');
    expect(image.getAttribute('src')).toBe('vscode-webview://page-1');
    expect(image.className).toContain('object-contain');
    expect(image.className).toContain('max-h-40');
    expect(image.className).not.toContain('h-12');
    expect(image.className).not.toContain('w-12');
    expect(image.className).not.toContain('object-cover');
    expect(screen.queryByText('P1')).toBeNull();
  });

  it('localizes emitted creative table headers while preserving extension headers', () => {
    render(
      <MarkdownRenderer
        content={[
          '| scene | shot | imagePrompt | videoPrompt | 自定义审阅 |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | keyframe | scene video | note |',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('columnheader', { name: '场景' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '图像提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '视频提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '自定义审阅' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'imagePrompt' })).toBeNull();
  });

  it('localizes storyboard creative table field headers and known enum cell values', () => {
    renderMarkdown(
      [
        '| scene | shot | source | sourcePanel | nextAction |',
        '| --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | 整页 | use-as-reference |',
      ].join('\n'),
    );

    expect(screen.getByRole('columnheader', { name: '场景' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '镜头' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '来源' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '来源分格' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '建议操作' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'sourcePanel' })).toBeNull();
    expect(screen.getByText('use-as-reference')).toBeTruthy();
  });

  it('localizes storyboard creative table enum cells for display only', () => {
    renderMarkdown(
      [
        '| scene | shot | decision | reviewStatus | contentType | requiresSplit |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | reference-only | needs-review | cover | false |',
      ].join('\n'),
    );

    expect(screen.getByText('仅作参考')).toBeTruthy();
    expect(screen.getByText('待审阅')).toBeTruthy();
    expect(screen.getByText('封面')).toBeTruthy();
    expect(screen.getByText('否')).toBeTruthy();
    expect(screen.queryByText('reference-only')).toBeNull();
    expect(screen.queryByText('needs-review')).toBeNull();
  });

  it('preserves Chinese storyboard header aliases emitted by the agent', () => {
    renderMarkdown(
      [
        '| 画面内容 | 生成提示词 | 建议操作 |',
        '| --- | --- | --- |',
        '| 主角出现 | 黑白工业巨构镜头 | split-panel |',
      ].join('\n'),
    );

    expect(screen.getByRole('columnheader', { name: '画面内容' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '生成提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '建议操作' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '画面' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '提示词' })).toBeNull();
  });

  it('renders inline-code resource labels from normalized token projection', () => {
    const projection: MarkdownResourceRenderingProjection = {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: '`read-image-cover.jpg`',
          status: 'bound',
          refs: [{ label: 'read-image-cover.jpg', role: 'source' }],
          resources: [
            {
              token: '`read-image-cover.jpg`',
              label: 'read-image-cover.jpg',
              role: 'source',
              sourcePath: 'read-image-cover.jpg',
            },
          ],
          renderUris: ['vscode-webview://cover'],
          diagnostics: [],
        },
      ],
    };

    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | 4s | Frame |',
      ].join('\n'),
      false,
      projection,
    );

    expect(screen.queryByText('`read-image-cover.jpg`')).toBeNull();
    expect(screen.queryByText('image')).toBeNull();
    expect(screen.getByAltText('read-image-cover.jpg').getAttribute('src')).toBe(
      'vscode-webview://cover',
    );
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://cover');
  });

  it('renders missing resource tokens as text with diagnostics', () => {
    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | missing | 4s | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'missing-resource-token',
            severity: 'error',
            token: 'missing',
            message: 'Markdown resource token "missing" does not match a known resource.',
          },
        ],
        tokens: [
          {
            token: 'missing',
            status: 'missing',
            refs: [],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'missing-resource-token',
                severity: 'error',
                token: 'missing',
                message: 'Markdown resource token "missing" does not match a known resource.',
              },
            ],
          },
        ],
      },
    );

    expect(screen.getAllByText('missing').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('缺失', { selector: '[data-markdown-resource-status="missing"]' }),
    ).toBeTruthy();
    expect(screen.getAllByText(/未匹配到已知资源/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('-')).toBeNull();
  });

  it('shows blocking resource diagnostics near the rendered markdown', () => {
    renderMarkdown(
      ['| shot id | duration | visual |', '| --- | --- | --- |', '| 001 | maybe | |'].join('\n'),
      false,
      {
        status: 'diagnostic',
        tokens: [],
        diagnostics: [
          {
            code: 'missing-resource-token',
            severity: 'error',
            token: 'page_1',
            message: 'Markdown resource token "page_1" does not match a known resource.',
          },
        ],
      },
    );

    expect(screen.getByRole('alert').textContent).toContain('page_1');
  });

  it('renders CommonMark image references through projected resources only', () => {
    renderMarkdown('![cover](assets/cover.png)', false, {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'assets/cover.png',
          status: 'bound',
          refs: [{ label: 'cover.png', role: 'source' }],
          resources: [
            {
              token: 'assets/cover.png',
              label: 'cover.png',
              role: 'source',
              sourcePath: 'assets/cover.png',
            },
          ],
          renderUris: ['vscode-webview://cover'],
          diagnostics: [],
        },
      ],
    });

    expect(screen.getByAltText('cover.png').getAttribute('src')).toBe('vscode-webview://cover');
    expect(screen.queryByText('assets/cover.png')).toBeNull();
  });

  it('renders CommonMark image panel hints through the base resource token', () => {
    renderMarkdown('![panel](P1#panel_1)', false, {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'P1',
          status: 'bound',
          refs: [{ label: 'Page 1', role: 'source' }],
          resources: [{ token: 'P1', label: 'Page 1', role: 'source', sourcePath: 'P1' }],
          renderUris: ['vscode-webview://page-1'],
          diagnostics: [],
        },
      ],
    });

    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1');
    expect(screen.queryByText('P1#panel_1')).toBeNull();
  });

  it('localizes ambiguous resource status labels and diagnostics', () => {
    renderMarkdown(
      [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'ambiguous-resource-token',
            severity: 'error',
            token: 'P1',
            message: 'Markdown resource token "P1" matches multiple resources.',
            candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
          },
        ],
        tokens: [
          {
            token: 'P1',
            status: 'ambiguous',
            refs: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'ambiguous-resource-token',
                severity: 'error',
                token: 'P1',
                message: 'Markdown resource token "P1" matches multiple resources.',
                candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
              },
            ],
          },
        ],
      },
    );

    expect(screen.getByText('2 个候选')).toBeTruthy();
    expect(screen.getAllByText('Markdown 资源标记 "P1" 匹配到多个资源。').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/matches multiple resources/)).toBeNull();
  });

  it('renders missing resource context diagnostics distinctly', () => {
    renderMarkdown(
      [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'missing-resource-context',
            severity: 'error',
            token: 'P1',
            message:
              'Markdown resource token "P1" cannot be resolved because this message has no image resource context.',
          },
        ],
        tokens: [
          {
            token: 'P1',
            status: 'missing',
            refs: [],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'missing-resource-context',
                severity: 'error',
                token: 'P1',
                message:
                  'Markdown resource token "P1" cannot be resolved because this message has no image resource context.',
              },
            ],
          },
        ],
      },
    );

    expect(screen.getByRole('alert').textContent).toContain('没有图像资源上下文');
  });

  it('shows unsupported-extension diagnostics for Neko resource-reference embeds', () => {
    renderMarkdown('![[cover.png]]', false, {
      status: 'ready',
      tokens: [],
      diagnostics: [
        {
          severity: 'warning',
          code: 'unsupported-resource-reference-markdown-extension',
          token: 'cover.png',
          message:
            'Neko resource-reference embeds and links are not enabled for Agent Markdown rendering yet.',
        },
      ],
    });

    expect(screen.getByRole('note').textContent).toContain('Neko 资源引用嵌入和链接');
  });

  it('renders read-only semantic prompt span chips with Canvas handoff metadata', () => {
    const { container } = renderMarkdown('Alley at night. Rin enters.', false, {
      status: 'ready',
      tokens: [],
      diagnostics: [],
      promptSpans: [
        {
          kind: 'scene',
          range: { start: 0, end: 14 },
          fieldId: 'scene.location',
          label: 'Alley',
          tone: 'scene',
          tooltip: 'Scene location span',
          ref: { kind: 'canvas-node', id: 'scene-1', namespace: 'canvas' },
        },
      ],
    });

    expect(screen.getByText('Alley at night. Rin enters.')).toBeTruthy();
    const chip = container.querySelector('[data-markdown-prompt-span="true"]');
    expect(chip?.textContent).toContain('Alley');
    expect(chip?.textContent).toContain('scene.location');
    expect(chip?.textContent).toContain('@scene-1');
    expect(chip?.className).toContain('border-b-2');
    expect(chip?.getAttribute('data-markdown-prompt-span-kind')).toBe('scene');
    expect(chip?.getAttribute('data-markdown-prompt-span-field-id')).toBe('scene.location');
    expect(chip?.getAttribute('data-markdown-prompt-span-range')).toBe('0:14');
    expect(chip?.getAttribute('data-canvas-handoff-ref-kind')).toBe('canvas-node');
    expect(chip?.getAttribute('data-canvas-handoff-ref-id')).toBe('scene-1');
    expect(chip?.getAttribute('title')).toContain('Scene location span');
    expect(chip?.getAttribute('title')).toContain('source: Alley at night');
  });

  it('renders semantic prompt span diagnostics without routing through resource fallback copy', () => {
    renderMarkdown('Use @Rin in the voice prompt.', false, {
      status: 'diagnostic',
      tokens: [],
      promptSpans: [],
      diagnostics: [
        {
          severity: 'warning',
          code: 'prompt-span-unresolved-ref',
          token: '@Rin',
          message: 'Prompt span @Rin does not resolve to a stable ref.',
        },
      ],
    });

    expect(screen.getByRole('note').textContent).toContain(
      'Prompt span @Rin does not resolve to a stable ref.',
    );
    expect(screen.queryByText(/Markdown 资源标记/)).toBeNull();
  });
});

function renderMarkdown(
  content: string,
  isStreaming = false,
  markdownResources?: MarkdownResourceRenderingProjection,
) {
  registerDefaultRenderers();
  return render(
    <MarkdownRenderer
      content={content}
      isStreaming={isStreaming}
      markdownResources={markdownResources}
    />,
  );
}
