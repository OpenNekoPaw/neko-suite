// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelSelectionWorkflow } from '../stores/modelStore';
import { SelectionModeControls } from './SelectionModeControls';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'selection.aria.workflowModes': '选择工作流模式',
        'selection.workflow.object': '对象',
        'selection.workflow.faceRegion': '面部',
        'selection.workflow.bonePose': '骨骼',
        'selection.workflow.light': '灯光',
        'selection.workflow.animation': '动画',
        'selection.workflow.exportInspect': '检查',
        'selection.workflowTitle.light': '已创建灯光选择',
      };
      return messages[key] ?? key;
    },
  }),
}));

let host: HTMLDivElement;
let root: Root;

describe('SelectionModeControls', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders localized workflow controls and keeps workflow actions typed', () => {
    const onWorkflowChange = vi.fn();
    renderControls({ onWorkflowChange });

    expect(host.querySelector('[aria-label="选择工作流模式"]')).not.toBeNull();
    expect(buttonByText('对象').getAttribute('aria-pressed')).toBe('true');
    expect(buttonByText('灯光').title).toBe('已创建灯光选择');

    act(() => {
      buttonByText('灯光').click();
    });

    expect(onWorkflowChange).toHaveBeenCalledWith('light');
  });

  it('disables face-region selection until character regions are available', () => {
    renderControls({ characterRegionsAvailable: false });

    expect(buttonByText('面部').disabled).toBe(true);
    expect(buttonByText('骨骼').disabled).toBe(false);
  });
});

function renderControls({
  workflow = 'object',
  typedPickingAvailable = true,
  characterRegionsAvailable = true,
  onWorkflowChange = vi.fn(),
}: {
  workflow?: ModelSelectionWorkflow;
  typedPickingAvailable?: boolean;
  characterRegionsAvailable?: boolean;
  onWorkflowChange?: (workflow: ModelSelectionWorkflow) => void;
} = {}): void {
  act(() => {
    root.render(
      <SelectionModeControls
        workflow={workflow}
        typedPickingAvailable={typedPickingAvailable}
        characterRegionsAvailable={characterRegionsAvailable}
        onWorkflowChange={onWorkflowChange}
      />,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}
