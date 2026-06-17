import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PuppetNodeTree } from './PuppetNodeTree';
import { usePuppetStore } from '../stores/puppet-store';
import type { PuppetNodeSnapshot } from '../animation/types';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('PuppetNodeTree shared UI migration', () => {
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
    usePuppetStore.getState().resetAnimation();
  });

  it('uses shared TreeView selection callbacks for puppet nodes', () => {
    usePuppetStore.setState({
      puppetLoaded: true,
      puppetSnapshot: {
        nodes: [
          createNode('root', 'Root', null, 'root'),
          createNode('group-head', 'Head', 'root', 'group'),
        ],
        parameters: [],
        meshes: [],
      },
      selectedNativeBoneId: null,
    });

    act(() => {
      root.render(<PuppetNodeTree />);
    });

    expect(host.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe(
      'puppet.nodes.treeLabel',
    );

    act(() => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Expand item"]')?.click();
    });
    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="group-head"]')?.click();
    });

    expect(usePuppetStore.getState().selectedNativeBoneId).toBe('group-head');
  });

  it('uses the shared TreeView large-list virtualization path', () => {
    usePuppetStore.setState({
      puppetLoaded: true,
      puppetSnapshot: {
        nodes: Array.from({ length: 500 }, (_, index) =>
          createNode(`node-${index}`, `Node ${index}`, null, 'part'),
        ),
        parameters: [],
        meshes: [],
      },
    });

    act(() => {
      root.render(<PuppetNodeTree />);
    });

    expect(host.querySelector('[data-virtualized="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeLessThan(500);
  });
});

function createNode(
  id: string,
  name: string,
  parentId: string | null,
  nodeType: string,
): PuppetNodeSnapshot {
  return {
    id,
    name,
    parent_id: parentId,
    node_type: nodeType,
    position: [0, 0],
    rotation: 0,
    scale: [1, 1],
    z_order: 0,
    opacity: 1,
    has_mesh: false,
  };
}
