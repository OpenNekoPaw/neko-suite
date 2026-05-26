import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  });

  it('renders as the right node tree panel surface', () => {
    setLocale('en');

    const markup = renderToStaticMarkup(
      React.createElement(NodeLibraryPanel, {
        coreDescriptors: createCoreNodeTypeDescriptors(),
        subsystemManifests: [],
        onCreateNode: () => undefined,
      }),
    );

    expect(markup).toContain('id="canvas-right-node-tree-panel"');
    expect(markup).toContain('data-canvas-right-node-tree="true"');
    expect(markup).toContain('aria-label="Node Library"');
  });

  it('keeps file-bound node entries behind a collapsed file references group', () => {
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
    expect(markup).not.toContain('选择文件添加媒体');
    expect(markup).not.toContain('draggable="false"');
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
