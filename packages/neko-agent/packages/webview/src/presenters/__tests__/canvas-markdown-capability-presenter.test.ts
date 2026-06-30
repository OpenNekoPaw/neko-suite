import { describe, expect, it } from 'vitest';
import { projectCanvasMarkdownCapabilityInput } from '../canvas-markdown-capability-presenter';
import type { MarkdownResourceRenderingProjection } from '../markdown-resource-rendering-presenter';

describe('canvas markdown capability presenter', () => {
  it('projects explicit storyboard Markdown tables to review-first Canvas capability input', () => {
    const projection = projectCanvasMarkdownCapabilityInput({
      markdown: [
        '| scene | shot id | visual | image | prompt |',
        '| --- | --- | --- | --- | --- |',
        '| Opening | S1 | wide shot | P1 | cinematic light |',
      ].join('\n'),
      capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
      markdownResources: createResourceProjection(),
      target: { plugin: 'canvas', nodeId: 'board-1', mode: 'append' },
      provenance: {
        source: 'webview',
        label: 'assistant-markdown-block',
        metadata: { renderUri: 'vscode-webview://must-not-leak' },
      },
      title: 'Storyboard Draft',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        capabilityId: 'canvas.createStoryboardDraftFromMarkdown',
        sourceFormat: 'gfm-table',
        title: 'Storyboard Draft',
        target: { nodeId: 'board-1', mode: 'append' },
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
      }),
    );
    expect(JSON.stringify(projection)).not.toContain('vscode-webview://must-not-leak');
  });

  it('projects inferred Markdown tables to unified Canvas ingest input', () => {
    const projection = projectCanvasMarkdownCapabilityInput({
      markdown: [
        '| scene | shot id | visual | image | prompt |',
        '| --- | --- | --- | --- | --- |',
        '| Opening | S1 | wide shot | P1 | cinematic light |',
      ].join('\n'),
      title: 'Review Table',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        sourceFormat: 'gfm-table',
        intentHint: 'auto',
        title: 'Review Table',
      }),
    );
  });

  it('projects non-table Markdown to Canvas ingest with a note hint', () => {
    expect(
      projectCanvasMarkdownCapabilityInput({
        markdown: '# Plan\n\n- Review panels\n- Create draft',
      }),
    ).toEqual(
      expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        sourceFormat: 'markdown',
        intentHint: 'note',
      }),
    );
  });

  it('passes advisory creative table hints without making Webview the final authority', () => {
    expect(
      projectCanvasMarkdownCapabilityInput({
        markdown: [
          '| scene | shot id | visual | image | prompt |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | S1 | wide shot | P1 | cinematic light |',
        ].join('\n'),
        intentHint: 'creative-table',
        profileHint: 'storyboard',
      }),
    ).toEqual(
      expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
      }),
    );
  });
});

function createResourceProjection(): MarkdownResourceRenderingProjection {
  return {
    status: 'ready',
    diagnostics: [],
    tokens: [
      {
        token: 'P1',
        status: 'bound',
        refs: [{ token: 'P1', label: 'Panel 1', role: 'source' }],
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
        renderUris: ['vscode-webview://panel-1'],
        diagnostics: [],
      },
    ],
  };
}
