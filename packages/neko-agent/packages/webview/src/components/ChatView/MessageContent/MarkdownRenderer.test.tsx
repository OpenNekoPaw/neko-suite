import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { MarkdownRenderer } from './MarkdownRenderer';

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
});

function renderMarkdown(content: string, isStreaming = false) {
  registerDefaultRenderers();
  return render(<MarkdownRenderer content={content} isStreaming={isStreaming} />);
}
