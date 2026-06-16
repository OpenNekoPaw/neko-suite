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
        'selection.label.workflow': '选择',
        'selection.workflow.object': '对象',
        'selection.workflow.faceRegion': '面部',
        'selection.workflow.bonePose': '骨骼',
        'selection.workflow.light': '灯光',
        'selection.workflow.animation': '动画',
        'selection.workflow.exportInspect': '检查',
        'selection.workflowTitle.light': '已创建灯光选择',
        'selection.workflowTitle.object': '对象选择',
        'selection.workflowTitle.faceRegion': '角色区域选择',
        'selection.workflowTitle.exportInspect': '只读检查',
        'controlAvailability.state.disabled': '不可用',
        'controlAvailability.reason.missing-character-regions': '当前资产没有角色区域元数据',
        'controlAvailability.reason.capability-unsupported': '引擎不支持该能力',
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
    expect(selectByLabel('选择工作流模式').value).toBe('object');

    act(() => {
      changeSelect('选择工作流模式', 'light');
    });

    expect(onWorkflowChange).toHaveBeenCalledWith('light');
  });

  it('disables face-region selection until character regions are available', () => {
    renderControls({ characterRegionsAvailable: false });

    const options = selectOptions();
    expect(options.find((item) => item.textContent === '面部')?.disabled).toBe(true);
    expect(options.find((item) => item.textContent === '面部')?.dataset.availabilityReason).toBe(
      'missing-character-regions',
    );
    expect(options.find((item) => item.textContent === '骨骼')?.disabled).toBe(false);
  });

  it('keeps Object and Inspect available when semantic typed picking is unavailable', () => {
    renderControls({ typedPickingAvailable: false, characterRegionsAvailable: false });

    const options = selectOptions();
    expect(options.find((item) => item.textContent === '对象')?.disabled).toBe(false);
    expect(options.find((item) => item.textContent === '对象')?.dataset.availabilityState).toBe(
      'available',
    );
    expect(options.find((item) => item.textContent === '检查')?.disabled).toBe(false);
    expect(options.find((item) => item.textContent === '骨骼')?.disabled).toBe(true);
    expect(options.find((item) => item.textContent === '骨骼')?.dataset.availabilityReason).toBe(
      'capability-unsupported',
    );
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

function selectByLabel(label: string): HTMLSelectElement {
  const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) throw new Error(`Select not found: ${label}`);
  return select;
}

function selectOptions(): HTMLOptionElement[] {
  return [...selectByLabel('选择工作流模式').querySelectorAll('option')];
}

function changeSelect(label: string, value: string): void {
  const select = selectByLabel(label);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
