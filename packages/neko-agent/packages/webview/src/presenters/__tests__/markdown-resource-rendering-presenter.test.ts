import { describe, expect, it } from 'vitest';
import type { ToolCall } from '@neko-agent/types';
import {
  projectMarkdownResourceRendering,
  normalizeMarkdownResourceLookupToken,
} from '../markdown-resource-rendering-presenter';

describe('markdown resource rendering presenter', () => {
  it('projects markdown table resource tokens from stable tool result resources', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-cover.jpg',
        status: 'bound',
        renderUris: ['vscode-webview://cover'],
        refs: [expect.objectContaining({ label: 'read-image-cover.jpg' })],
      }),
    );
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://cover');
  });

  it('does not bind missing tokens by image order', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P9 | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall()],
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P9',
        status: 'missing',
      }),
    );
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'missing-resource-token',
    ]);
  });

  it('binds scoped page tokens from imageInfo entries in the current tool result', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadDocumentToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
        renderUris: ['vscode-webview://page-1'],
        resources: [
          expect.objectContaining({
            token: 'P1',
            documentResourceRef: expect.objectContaining({ entryPath: 'OPS/page-1.jpg' }),
          }),
        ],
      }),
    );
  });

  it('marks repeated scoped page tokens across tool results as ambiguous', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadDocumentToolCall({ id: 'read-doc-a', entryPath: 'OPS/a/page-1.jpg' }),
        createReadDocumentToolCall({ id: 'read-doc-b', entryPath: 'OPS/b/page-1.jpg' }),
      ],
    });

    expect(projection.status).toBe('diagnostic');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'P1',
        status: 'ambiguous',
      }),
    );
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ambiguous-resource-token',
        token: 'P1',
      }),
    ]);
  });

  it('binds ReadImage-derived asset labels from stable image metadata', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'Cover',
          entryPath: 'image/cover.jpg',
          resourceId: 'managed-cover',
          includeAttachments: false,
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-cover.jpg',
        status: 'bound',
        resources: [
          expect.objectContaining({
            token: 'read-image-cover.jpg',
            resourceRef: expect.objectContaining({ id: 'managed-cover' }),
          }),
        ],
      }),
    );
  });

  it('binds stable ReadImage asset ids back to their resource refs', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `read-image-moe-010564.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'moe-010564.jpg',
          entryPath: 'image/moe-010564.jpg',
          assetId: 'read-image-moe-010564.jpg',
          resourceId: 'managed-moe-010564',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'read-image-moe-010564.jpg',
        status: 'bound',
        renderUris: ['vscode-webview://cover'],
        resources: [
          expect.objectContaining({
            token: 'read-image-moe-010564.jpg',
            resourceRef: expect.objectContaining({ id: 'managed-moe-010564' }),
          }),
        ],
      }),
    );
  });

  it('binds document image basenames without requiring generated read-image prefixes', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | `moe-010564.jpg` | Establishing frame |',
      ].join('\n'),
      toolCalls: [
        createReadImageToolCall({
          label: 'Moe page',
          entryPath: 'image/moe-010564.jpg',
          resourceId: 'managed-moe-010564',
        }),
      ],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens[0]).toEqual(
      expect.objectContaining({
        token: 'moe-010564.jpg',
        status: 'bound',
      }),
    );
  });

  it('marks Neko resource-reference embeds unsupported without resolving paths', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![[cover.png]]',
      toolCalls: [createReadImageToolCall()],
    });

    expect(projection.status).toBe('ready');
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-resource-reference-markdown-extension',
        token: 'cover.png',
      }),
    ]);
    expect(projection.tokens).toEqual([]);
  });

  it('treats panel hints as placement intent without requiring separate resources', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | P1#panel_2 | Close-up from page panel |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall({ alias: 'P1', label: 'Page 1' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('treats CommonMark image panel hints as placement intent on the base token', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: '![panel](P1#panel_2)',
      toolCalls: [createReadImageToolCall({ alias: 'P1', label: 'Page 1' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'P1',
        status: 'bound',
      }),
    ]);
  });

  it('does not treat CommonMark image alt text as a separate resource token', () => {
    const projection = projectMarkdownResourceRendering({
      markdown: [
        '| shot id | source | prompt |',
        '| --- | --- | --- |',
        '| 001 | ![cover](assets/cover.png) | Establishing frame |',
      ].join('\n'),
      toolCalls: [createReadImageToolCall({ alias: 'assets/cover.png', label: 'cover.png' })],
    });

    expect(projection.status).toBe('ready');
    expect(projection.tokens).toEqual([
      expect.objectContaining({
        token: 'assets/cover.png',
        status: 'bound',
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('normalizes markdown resource tokens without draft-runtime', () => {
    expect(normalizeMarkdownResourceLookupToken('`read-image-cover.jpg`')).toBe(
      'read_image_cover.jpg',
    );
    expect(normalizeMarkdownResourceLookupToken('Page 1')).toBe('page_1');
  });
});

function createReadImageToolCall(
  overrides: {
    readonly alias?: string;
    readonly label?: string;
    readonly entryPath?: string;
    readonly assetId?: string;
    readonly resourceId?: string;
    readonly includeAttachments?: boolean;
  } = {},
): ToolCall {
  const resourceId = overrides.resourceId ?? 'read-image-cover';
  const entryPath = overrides.entryPath ?? '.neko/resources/read-image-cover.jpg';
  return {
    id: 'read-image',
    name: 'ReadImage',
    arguments: {},
    result: {
      success: true,
      data: {
        images: [
          {
            label: overrides.label ?? 'read-image-cover.jpg',
            ...(overrides.alias ? { alias: overrides.alias } : {}),
            ...(overrides.entryPath ? { entryPath: overrides.entryPath } : {}),
            mimeType: 'image/jpeg',
            resourceRef: {
              id: resourceId,
              scope: 'project',
              provider: 'read-image',
              kind: 'media',
              source: {
                kind: 'file',
                projectRelativePath: entryPath,
              },
              locator: {
                kind: 'file',
                path: entryPath,
              },
              fingerprint: {
                strategy: 'provider',
                providerId: 'read-image',
                value: resourceId,
              },
            },
          },
        ],
      },
      ...(overrides.includeAttachments === false
        ? {}
        : {
            attachments: [
              {
                type: 'image',
                path: 'vscode-webview://cover',
                mimeType: 'image/jpeg',
                assetRef: {
                  assetId: overrides.assetId ?? 'read-image-cover',
                  uri: 'vscode-webview://cover',
                  mimeType: 'image/jpeg',
                  ...(overrides.label ? { label: overrides.label } : {}),
                },
              },
            ],
          }),
    },
  };
}

function createReadDocumentToolCall(
  overrides: {
    readonly id?: string;
    readonly label?: string;
    readonly entryPath?: string;
    readonly sourcePath?: string;
  } = {},
): ToolCall {
  const entryPath = overrides.entryPath ?? 'OPS/page-1.jpg';
  return {
    id: overrides.id ?? 'read-doc',
    name: 'ReadDocument',
    arguments: {},
    result: {
      success: true,
      data: {
        imageInfo: [
          {
            label: overrides.label ?? 'Page 1',
            entryPath,
            mimeType: 'image/jpeg',
            width: 1494,
            height: 2133,
            resourceRef: {
              kind: 'document-entry',
              source: {
                filePath: overrides.sourcePath ?? '/books/story.epub',
                format: 'epub',
              },
              entryPath,
              versionPolicy: 'versioned-export',
            },
          },
        ],
      },
      attachments: [
        {
          type: 'image',
          path: 'vscode-webview://page-1',
          mimeType: 'image/jpeg',
        },
      ],
    },
  };
}
