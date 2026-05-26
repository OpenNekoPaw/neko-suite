// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneTree } from './SceneTree';
import type { SceneNodeSnapshot } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Model SceneTree shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

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

  it('delegates selection and visibility through shared TreeView', () => {
    const onSelectNode = vi.fn();
    const onSetNodeVisible = vi.fn();

    act(() => {
      root.render(
        <SceneTree
          nodes={[createNode('root', 'Root', null), createNode('mesh', 'Mesh', 'root', false)]}
          onSelectNode={onSelectNode}
          onSetNodeVisible={onSetNodeVisible}
          selectedNodeId="mesh"
          showHeader={false}
        />,
      );
    });

    expect(host.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('sceneTree.title');

    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="mesh"]')?.click();
    });
    expect(onSelectNode).toHaveBeenCalledWith('mesh');

    const showButton = host.querySelector<HTMLButtonElement>(
      '[data-tree-item-id="mesh"] button[aria-label="sceneTree.showNode"]',
    );
    act(() => {
      showButton?.click();
    });
    expect(onSetNodeVisible).toHaveBeenCalledWith('mesh', true);
  });

  it('uses shared TreeView virtualization for 500 visible scene nodes', () => {
    act(() => {
      root.render(
        <SceneTree
          nodes={Array.from({ length: 500 }, (_, index) =>
            createNode(`node-${index}`, `Node ${index}`, null),
          )}
          onSelectNode={vi.fn()}
          selectedNodeId="node-15"
          showHeader={false}
        />,
      );
    });

    expect(host.querySelector('[data-virtualized="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeLessThan(500);
    expect(host.querySelector('[data-tree-item-id="node-15"]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

function createNode(
  nodeId: string,
  name: string,
  parentId: string | null,
  visible = true,
): SceneNodeSnapshot {
  return {
    nodeId,
    name,
    parentId,
    kind: 'mesh',
    visible,
    children: [],
  } as SceneNodeSnapshot;
}
