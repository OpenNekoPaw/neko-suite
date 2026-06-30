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

    expect(screen.getByText('page_1')).toBeTruthy();
    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1');
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://page-1');
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

    expect(
      screen.getByText('image', { selector: '[data-markdown-resource-status="bound"]' }),
    ).toBeTruthy();
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
            message: 'Creative draft resource token "missing" does not match a known resource.',
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
                message: 'Creative draft resource token "missing" does not match a known resource.',
              },
            ],
          },
        ],
      },
    );

    expect(screen.getAllByText('missing').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('missing', { selector: '[data-markdown-resource-status="missing"]' }),
    ).toBeTruthy();
    expect(screen.getAllByText(/does not match a known resource/).length).toBeGreaterThanOrEqual(1);
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
            message: 'Creative draft resource token "page_1" does not match a known resource.',
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
    expect(screen.getByText('assets/cover.png')).toBeTruthy();
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

    expect(screen.getByRole('note').textContent).toContain('Neko resource-reference embeds');
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
