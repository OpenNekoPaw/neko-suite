import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { I18nService } from '@neko/shared/i18n';
import type { NkpControlDriver } from '@neko/shared';
import { I18nProvider } from '../i18n/I18nContext';
import { en } from '../i18n/locales/en';
import { zhCN } from '../i18n/locales/zh-cn';
import { usePuppetStore } from '../stores/puppet-store';
import { ParameterPanel } from './ParameterPanel';
import { PuppetNodeTree } from './PuppetNodeTree';
import { ControlDriverPanel } from './ControlDriverPanel';
import { PuppetRuntimeStatus } from './PuppetRuntimeStatus';
import type { PuppetDocumentContext } from '../types';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Puppet inspector i18n', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    usePuppetStore.setState({
      puppetLoaded: true,
      puppetParameters: [{ name: 'ParamAngleX', min: -30, max: 30, default: 0, current: 12 }],
      nativeBlendShapes: [{ meshId: 'face-mesh', name: 'Smile', current: 0.35 }],
      nativeControlDrivers: [createDriver()],
      puppetSnapshot: {
        format: 'native',
        nodes: [
          {
            id: 'root',
            name: 'Root',
            node_type: 'root',
            position: [0, 0],
            rotation: 0,
            scale: [1, 1],
            z_order: 0,
            opacity: 1,
            parent_id: null,
            has_mesh: false,
          },
        ],
        parameters: [],
        meshes: [],
      },
      selectedNativeBoneId: null,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    usePuppetStore.getState().resetAnimation();
  });

  it('resolves right inspector chrome in English without generic Scene labels', () => {
    renderInspector('en');

    const text = normalizedText(host);
    expect(text).toContain('Runtime');
    expect(text).toContain('Profile');
    expect(text).toContain('Live2D Puppet');
    expect(text).toContain('Parameters');
    expect(text).toContain('Blend Shapes');
    expect(text).toContain('Nodes');
    expect(text).toContain('Control Drivers');
    expect(text).toContain('Bone:Head.x');
    expect(text).toContain('linear x1');
    expect(text).toContain('Priority: 10');
    expectInspectorTextIsResolved(text);
  });

  it('resolves right inspector chrome in Chinese without generic Scene labels', () => {
    renderInspector('zh-cn');

    const text = normalizedText(host);
    expect(text).toContain('运行时');
    expect(text).toContain('配置');
    expect(text).toContain('参数');
    expect(text).toContain('混合形状');
    expect(text).toContain('节点');
    expect(text).toContain('控制驱动');
    expect(text).toContain('骨骼:Head.x');
    expect(text).toContain('线性 x1');
    expect(text).toContain('优先级: 10');
    expectInspectorTextIsResolved(text);
  });

  function renderInspector(locale: 'en' | 'zh-cn'): void {
    const service = new I18nService(locale);
    service.registerBundle('puppet', 'en', en);
    service.registerBundle('puppet', 'zh-cn', zhCN);

    act(() => {
      root.render(
        <I18nProvider service={service}>
          <PuppetRuntimeStatus context={documentContext} />
          <ParameterPanel controller={null} mode="professional" />
          <PuppetNodeTree />
          <ControlDriverPanel />
        </I18nProvider>,
      );
    });
  }
});

const documentContext: PuppetDocumentContext = {
  owner: 'neko-puppet',
  documentKind: 'nkp',
  profile: 'live2d',
  runtimeAdapter: {
    id: 'live2d-moc3-compat',
    version: 'clean-room',
  },
};

function createDriver(): NkpControlDriver {
  return {
    id: 'head-turn',
    source: { type: 'live2dParam', name: 'ParamAngleX' },
    target: { type: 'boneRotation', bone: 'Head', axis: 'x' },
    curve: { type: 'linear', scale: 1 },
    blendMode: 'override',
    priority: 10,
  };
}

function normalizedText(element: HTMLElement): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function expectInspectorTextIsResolved(text: string): void {
  expect(text).not.toContain('puppet.');
  expect(text.toLowerCase()).not.toContain('tilemap');
  expect(text.toLowerCase()).not.toContain('scene camera');
  expect(text.toLowerCase()).not.toContain('scene light');
  expect(text.toLowerCase()).not.toContain('parallax');
  expect(text.toLowerCase()).not.toContain('particle');
  expect(text.toLowerCase()).not.toContain('scene graph');
  expect(text.toLowerCase()).not.toContain('actor staging');
}
