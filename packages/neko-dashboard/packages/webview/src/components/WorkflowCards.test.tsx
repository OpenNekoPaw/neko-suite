// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import type { DashboardProjectType, WorkflowAvailability } from '../types';
import { WorkflowCards } from './WorkflowCards';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('WorkflowCards', () => {
  const mountedRoots: Array<{ root: Root; host: HTMLDivElement }> = [];

  afterEach(() => {
    for (const mounted of mountedRoots.splice(0)) {
      act(() => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  it('renders creative content scenarios without visible file formats or an AI suite card', () => {
    const { host } = renderWorkflowCards();

    expect(host.textContent).toContain('剧本');
    expect(host.textContent).toContain('画布');
    expect(host.textContent).toContain('剪辑');
    expect(host.textContent).toContain('DAW');
    expect(host.textContent).toContain('3D模型');
    expect(host.textContent).toContain('2D模型');
    expect(host.textContent).toContain('绘画');
    expect(host.textContent).not.toMatch(/\.(fountain|nkc|nkv|nka|nkm|nkp|nks)/);
    expect(host.textContent).not.toContain('AI 助手');
  });

  it('routes primary and secondary actions through existing project and command callbacks', () => {
    const onCreateProject = vi.fn();
    const onCommand = vi.fn();
    const { host } = renderWorkflowCards({ onCreateProject, onCommand });

    clickButton(host, '新建剧本');
    clickButton(host, '新建画布');
    clickButton(host, '新建剪辑');
    clickButton(host, '发送 Agent');

    expect(onCreateProject).toHaveBeenCalledWith('story');
    expect(onCreateProject).toHaveBeenCalledWith('canvas');
    expect(onCreateProject).toHaveBeenCalledWith('video');
    expect(onCommand).toHaveBeenCalledWith('neko.story.sendToAgent');
  });

  it('marks unavailable creative suites as in development instead of offering actions', () => {
    const { host } = renderWorkflowCards();

    expect(host.textContent).toContain('开发中');
    expect(host.querySelectorAll('.workflow-card-unavailable--developing')).toHaveLength(4);
    expect(findButton(host, '新建 DAW')).toBeUndefined();
    expect(findButton(host, '新建 3D 模型')).toBeUndefined();
    expect(findButton(host, '新建 2D 模型')).toBeUndefined();
    expect(findButton(host, '新建绘画')).toBeUndefined();
  });

  it('uses each file format workflow availability for its card', () => {
    const workflows: readonly WorkflowAvailability[] = [
      {
        id: 'fountain',
        available: false,
        state: 'missing',
      },
      {
        id: 'nkc',
        available: true,
        state: 'ready',
      },
    ];

    const { host } = renderWorkflowCards({ workflows });

    expect(host.textContent).toContain('扩展未安装');
    expect(host.querySelectorAll('.workflow-card--disabled')).toHaveLength(1);
  });

  function renderWorkflowCards(
    input: {
      readonly workflows?: readonly WorkflowAvailability[];
      readonly onCreateProject?: (type: DashboardProjectType) => void;
      readonly onCommand?: (command: string) => void;
    } = {},
  ): { host: HTMLDivElement } {
    i18nService.setLocale('zh-cn');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push({ root, host });

    act(() => {
      root.render(
        <I18nProvider service={i18nService}>
          <WorkflowCards
            workflows={input.workflows ?? []}
            onCreateProject={
              input.onCreateProject ??
              (() => {
                // Test default.
              })
            }
            onCommand={
              input.onCommand ??
              (() => {
                // Test default.
              })
            }
          />
        </I18nProvider>,
      );
    });

    return { host };
  }
});

function clickButton(host: HTMLElement, label: string): void {
  const button = findButton(host, label);
  expect(button).toBeTruthy();
  act(() => {
    button?.click();
  });
}

function findButton(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}
