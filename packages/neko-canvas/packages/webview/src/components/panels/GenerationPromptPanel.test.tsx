// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  type CanvasStoryboardActionIntentId,
} from '@neko/shared';
import { GenerationPromptPanel, type GenerationPanelTarget } from './GenerationPromptPanel';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GenerationPromptPanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setLocale('en');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('uses semantic prompt documents as generation action context', () => {
    const onGenerate = vi.fn();
    const target = createTarget('generate-video');

    act(() => {
      root.render(
        <GenerationPromptPanel
          visible
          target={target}
          onGenerate={onGenerate}
          onClose={() => undefined}
        />,
      );
    });

    expect(host.querySelector('textarea')?.value).toBe('Semantic video prompt');
    expect(host.querySelector('[data-generation-prompt-source]')?.textContent).toBe(
      'Semantic document',
    );

    const generateButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('生成'),
    );
    expect(generateButton).not.toBeUndefined();
    act(() => {
      generateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onGenerate).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        prompt: 'Semantic video prompt',
        storyboardPromptDocument: target.semanticPromptDocument,
        storyboardActionContext: target.actionContext,
      }),
    );
  });
});

function createTarget(actionId: CanvasStoryboardActionIntentId): GenerationPanelTarget {
  return {
    nodeId: 'shot-generation-panel',
    initialPrompt: 'Plain seed should not win',
    semanticPromptDocument: {
      blockKind: 'video',
      documentId: 'shot-generation-panel:video:prompt',
      version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
      text: 'Semantic video prompt',
    },
    actionContext: {
      actionId,
      promptSource: 'semantic-prompt-document',
    },
    initialGenerateVideo: true,
  };
}
