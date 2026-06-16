// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardTask } from '@neko/shared';
import type { DashboardCreativeEntityRow } from '@neko/shared/types/dashboard-creative-entity';
import { App } from './App';
import { I18nProvider } from './i18n/I18nContext';
import { i18nService } from './i18n';
import { applyTaskChange } from './taskState';
import type { DashboardData } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const baseTask: DashboardTask = {
  taskId: 'neko-agent:task-1',
  source: 'neko-agent',
  sourceTaskId: 'task-1',
  kind: 'generate-image',
  title: 'Generate image',
  status: 'running',
  progress: 10,
  actions: ['cancel'],
  startedAt: 1,
};

describe('dashboard task reducer helpers', () => {
  it('adds a new task', () => {
    expect(applyTaskChange([], baseTask, 'added')).toEqual([baseTask]);
  });

  it('updates an existing task without duplication', () => {
    const updated = { ...baseTask, progress: 80 };
    const result = applyTaskChange([baseTask], updated, 'updated');

    expect(result).toHaveLength(1);
    expect(result[0]?.progress).toBe(80);
  });

  it('removes an existing task', () => {
    expect(applyTaskChange([baseTask], baseTask, 'removed')).toEqual([]);
  });
});

describe('App', () => {
  const mountedRoots: Array<{ root: Root; host: HTMLDivElement }> = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const mounted of mountedRoots.splice(0)) {
      act(() => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  it('renders creative entities even when the dashboard payload is in welcome mode', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push({ root, host });

    i18nService.setLocale('zh-cn');
    act(() => {
      root.render(
        createElement(I18nProvider, {
          service: i18nService,
          children: createElement(App),
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'update', data: welcomeDataWithEntities },
        }),
      );
    });

    expect(host.textContent).toContain('创作实体');
    expect(host.textContent).toContain('小橘');
    expect(host.textContent).toContain('候选');
  });
});

const creativeEntityRow: DashboardCreativeEntityRow = {
  ref: {
    source: 'neko-story',
    sourceEntityId: 'candidate:character:小橘',
    entityId: '小橘',
    entityKind: 'character',
    workspaceFolder: 'neko-test',
  },
  label: '小橘',
  kind: 'character',
  status: 'candidate',
  sourceKind: 'script',
  freshness: 'fresh',
  actions: [{ id: 'show-detail', label: 'Show detail' }],
  searchText: '小橘 candidate script',
};

const welcomeDataWithEntities: DashboardData = {
  mode: 'welcome',
  projects: [],
  recent: [],
  tasks: [],
  creativeEntities: {
    statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
    rows: [creativeEntityRow],
  },
  runtime: {},
  workflows: [],
  skills: [],
};
