// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS } from '@neko/shared';
import { setLocale } from '../../i18n';
import { createCoreNodeTypeDescriptors } from '../../subsystems/core/descriptors';
import { createPlaceholderNodeTypeDescriptors } from '../../subsystems/placeholderDescriptors';
import { createStoryboardNodeTypeDescriptors } from '../../subsystems/storyboard/descriptors';
import { t } from '../../i18n';
import {
  createNodeLibraryGroups,
  requestSubsystemLoadOnce,
  resolveNodeLibraryLabel,
} from './NodeLibraryPanel';
import { NodeLibraryPanel } from './NodeLibraryPanel';

(globalThis as { React?: typeof React }).React = React;

describe('NodeLibraryPanel', () => {
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

  it('localizes subsystem group labels and placeholder node descriptors', () => {
    setLocale('zh-cn');

    const groups = createNodeLibraryGroups(
      createCoreNodeTypeDescriptors(),
      BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
    );
    const behaviorDescriptors = createPlaceholderNodeTypeDescriptors('behavior');

    expect(groups.find((group) => group.id === 'storyboard')?.label).toBe('故事板');
    expect(groups.find((group) => group.id === 'behavior')?.label).toBe('行为');
    expect(groups.find((group) => group.id === 'file-references')?.label).toBe('文件引用');
    expect(behaviorDescriptors.state?.labelKey).toBe('node.state');
    expect(resolveNodeLibraryLabel('shot')).toBe('镜头');
    expect(resolveNodeLibraryLabel('state')).toBe('状态');
    expect(resolveNodeLibraryLabel('narrative-start')).toBe('叙事入口');
    expect(resolveNodeLibraryLabel('narrative-ending')).toBe('叙事终点');
    expect(
      t('toolbar.autoArrangeChoice', {
        subsystem: t('library.group.storyboard'),
        strategy: t('autoArrange.strategy.grid'),
      }),
    ).toBe('故事板 · 网格');
  });

  it('marks library node entries as draggable', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(NodeLibraryPanel, {
        coreDescriptors: createCoreNodeTypeDescriptors(),
        subsystemManifests: [],
        onCreateNode: () => undefined,
      }),
    );

    expect(markup).toContain('draggable="true"');
    expect(markup).toContain('Text');
    expect(markup).toContain('canvas-node-library-icon');
    expect(markup).toContain('data-node-library-icon="annotation"');
    expect(markup).toContain('canvas-node-library-icon-svg');
    expect(markup).toContain('data-node-library-icon-glyph="note"');
    expect(markup).toContain('canvas-node-library-section');
    expect(markup).toContain('canvas-node-library-section-title');
    expect(markup).toContain('canvas-node-library-items');
    expect(markup).toContain('data-node-library-section-state="core"');
    expect(markup).not.toContain('📝');
    expect(markup).not.toContain('🔤');
    expect(markup).not.toContain('codicon-file-media');
    expect(markup).not.toContain('aria-label="Visible"');
    expect(markup).not.toContain('aria-label="Unlocked"');
  });

  it('renders node library content without owning the right dock shell', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(NodeLibraryPanel, {
        coreDescriptors: createCoreNodeTypeDescriptors(),
        subsystemManifests: [],
        onCreateNode: () => undefined,
      }),
    );

    expect(markup).not.toContain('id="canvas-right-node-tree-panel"');
    expect(markup).not.toContain('data-canvas-right-node-tree="true"');
    expect(markup).toContain('Node Library');
  });

  it('keeps file-bound node entries visible in the file references group', () => {
    setLocale('zh-cn');

    const markup = renderToStaticMarkup(
      React.createElement(NodeLibraryPanel, {
        coreDescriptors: {
          ...createCoreNodeTypeDescriptors(),
          ...createStoryboardNodeTypeDescriptors(),
        },
        subsystemManifests: [],
        nodeTypeDescriptors: createPlaceholderNodeTypeDescriptors('entity'),
        onCreateNode: () => undefined,
      }),
    );

    expect(markup).toContain('文件引用');
    expect(markup).toContain('媒体');
    expect(markup).toContain('文件');
    expect(markup).toContain('data-node-library-badge="library.badge.file"');
    expect(markup).not.toContain('draggable="false"');
  });

  it('renders subsystem badges with explicit active and available states', () => {
    setLocale('zh-cn');

    const markup = renderToStaticMarkup(
      React.createElement(NodeLibraryPanel, {
        activeSubsystemIds: ['storyboard'],
        coreDescriptors: createCoreNodeTypeDescriptors(),
        subsystemManifests: BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
        onCreateNode: () => undefined,
      }),
    );

    expect(markup).toContain('data-node-library-subsystem-state="active"');
    expect(markup).toContain('data-node-library-subsystem-state="available"');
    expect(markup).toContain('data-node-library-section-state="active"');
    expect(markup).toContain('data-node-library-section-state="available"');
    expect(markup).toContain('已激活');
    expect(markup).toContain('可用');
  });

  it('opens pickers for visible file reference entries', () => {
    setLocale('en');
    const onCreateNode = vi.fn();
    const onPickNodeSource = vi.fn();

    act(() => {
      root.render(
        React.createElement(NodeLibraryPanel, {
          coreDescriptors: {
            ...createCoreNodeTypeDescriptors(),
            ...createStoryboardNodeTypeDescriptors(),
          },
          subsystemManifests: [],
          onCreateNode,
          onPickNodeSource,
        }),
      );
    });

    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="media"]')?.click();
      host.querySelector<HTMLElement>('[data-tree-item-id="script"]')?.click();
      host.querySelector<HTMLElement>('[data-tree-item-id="document"]')?.click();
      host.querySelector<HTMLElement>('[data-tree-item-id="model"]')?.click();
    });

    expect(onCreateNode).not.toHaveBeenCalled();
    expect(onPickNodeSource).toHaveBeenCalledTimes(4);
    expect(onPickNodeSource).toHaveBeenNthCalledWith(1, 'media', 'pickMediaFile');
    expect(onPickNodeSource).toHaveBeenNthCalledWith(2, 'script', 'pickScriptDocument');
    expect(onPickNodeSource).toHaveBeenNthCalledWith(3, 'document', 'pickReferenceDocument');
    expect(onPickNodeSource).toHaveBeenNthCalledWith(4, 'model', 'pickModelReference');
  });

  it('moves file-bound nodes out of default groups and hides projection-only entity nodes', () => {
    setLocale('zh-cn');

    const groups = createNodeLibraryGroups(
      {
        ...createCoreNodeTypeDescriptors(),
        ...createStoryboardNodeTypeDescriptors(),
      },
      BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
    );

    expect(groups.find((group) => group.id === 'storyboard')?.nodeTypes).toEqual([
      'storyboard',
      'shot',
      'scene',
      'gallery',
      'table',
    ]);
    expect(groups.find((group) => group.id === 'narrative')?.nodeTypes).toEqual([
      'narrative-start',
      'choice',
      'merge',
      'narrative-scene',
      'narrative-note',
      'narrative-ending',
    ]);
    expect(groups.find((group) => group.id === 'entity')).toBeUndefined();
    expect(groups.find((group) => group.id === 'file-references')?.nodeTypes).toEqual([
      'media',
      'script',
      'document',
      'model',
      'canvas-embed',
      'project',
    ]);
  });

  it('deduplicates subsystem load requests after the first request', () => {
    const requestedSubsystemIds = new Set<Parameters<typeof requestSubsystemLoadOnce>[1]>();
    const onLoadSubsystem = vi.fn();

    expect(requestSubsystemLoadOnce(requestedSubsystemIds, 'storyboard', onLoadSubsystem)).toBe(
      true,
    );
    expect(requestSubsystemLoadOnce(requestedSubsystemIds, 'storyboard', onLoadSubsystem)).toBe(
      false,
    );
    expect(requestSubsystemLoadOnce(requestedSubsystemIds, 'behavior', onLoadSubsystem)).toBe(true);
    expect(onLoadSubsystem).toHaveBeenCalledTimes(2);
    expect(onLoadSubsystem).toHaveBeenNthCalledWith(1, 'storyboard');
    expect(onLoadSubsystem).toHaveBeenNthCalledWith(2, 'behavior');
  });
});
