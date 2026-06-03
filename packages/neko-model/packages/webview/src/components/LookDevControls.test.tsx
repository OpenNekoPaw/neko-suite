// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewportRenderMode } from '@neko/shared';
import { defaultModelLookDevSceneControlCapabilities } from '@neko/neko-client';
import { LookDevControls } from './LookDevControls';
import type { LookDevUiState } from '../stores/modelStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'lookdev.aria.renderModes': 'LookDev 模式',
        'lookdev.mode.pbr': 'PBR',
        'lookdev.mode.clay': '白模',
        'lookdev.mode.wireframe': '线框',
        'lookdev.mode.normal': '法线',
        'lookdev.mode.depth': '深度',
        'lookdev.mode.lightComplexity': '光照',
        'lookdev.mode.unlit': '无光照',
        'lookdev.mode.shadowAtlas': '阴影',
        'lookdev.title.clay': '白模检查视图',
        'lookdev.title.normal': '法线检查视图',
        'lookdev.title.depth': '深度检查视图',
        'lookdev.status.pending': '切换中',
        'lookdev.status.applied': '已应用',
        'lookdev.helpers.enabled': '辅助',
        'lookdev.helpers.disabled': '干净',
        'lookdev.live.enabled': '实时',
        'lookdev.live.pending': '待实时应用',
        'lookdev.retry': '重试 LookDev 切换',
        'controlAvailability.state.disabled': '不可用',
        'controlAvailability.reason.capability-unsupported': '引擎不支持该能力',
        'controlAvailability.reason.capability-unknown': '引擎能力状态未知',
      };
      return messages[key] ?? key;
    },
  }),
}));

let host: HTMLDivElement;
let root: Root;

describe('LookDevControls', () => {
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

  it('renders Engine render modes and requests changes without local 3D state', () => {
    const onModeChange = vi.fn();
    renderControls({ onModeChange });

    expect(tabLabels()).toContain('PBR');
    expect(tabLabels()).toContain('白模');
    expect(tabLabels()).toContain('线框');
    expect(host.querySelector('[aria-label="LookDev 模式"]')).not.toBeNull();
    expect(buttonByText('白模').title).toBe('白模检查视图');

    act(() => {
      buttonByText('白模').click();
    });

    expect(onModeChange).toHaveBeenCalledWith('clay');
    expect(host.textContent).toContain('待实时应用');
    expect(host.textContent).not.toContain('重启流');
  });

  it('disables unsupported Clay and shows pending diagnostic state', () => {
    renderControls({
      state: {
        requestedMode: 'wireframe',
        appliedMode: 'pbr',
        status: 'pending',
        diagnostic: 'waiting for Engine descriptor',
      },
      capabilities: {
        ...defaultModelLookDevSceneControlCapabilities(),
        renderModes: ['pbr', 'wireframe'],
        liveViewportSettings: true,
        clay: false,
        authoredLights: false,
        environment: false,
        typedPicking: false,
        characterRegions: false,
        capabilityStates: {
          ...defaultModelLookDevSceneControlCapabilities().capabilityStates,
          clay: 'unsupported',
          renderModes: {
            ...defaultModelLookDevSceneControlCapabilities().capabilityStates.renderModes,
            clay: 'unsupported',
          },
        },
      },
    });

    expect(buttonByText('线框').getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).toContain('切换中');
    expect(host.textContent).toContain('waiting for Engine descriptor');
    expect(host.textContent).toContain('实时');
  });

  it('keeps baseline LookDev buttons visible and explains unknown capability state', () => {
    renderControls({
      capabilities: {
        ...defaultModelLookDevSceneControlCapabilities(),
        renderModes: ['pbr'],
        liveViewportSettings: false,
        clay: false,
        authoredLights: false,
        environment: false,
        typedPicking: false,
        characterRegions: false,
        capabilityStates: {
          ...defaultModelLookDevSceneControlCapabilities().capabilityStates,
          clay: 'unknown',
          renderModes: {
            ...defaultModelLookDevSceneControlCapabilities().capabilityStates.renderModes,
            clay: 'unknown',
            normal: 'unknown',
            depth: 'unsupported',
          },
        },
      },
    });

    expect(buttonByText('白模').dataset.availabilityReason).toBe('capability-unknown');
    expect(buttonByText('白模').title).toBe('白模检查视图 - 不可用: 引擎能力状态未知');
    expect(buttonByText('法线').dataset.availabilityReason).toBe('capability-unknown');
    expect(buttonByText('深度').dataset.availabilityReason).toBe('capability-unsupported');
  });
});

function renderControls({
  state = appliedState('pbr'),
  capabilities = {
    ...defaultModelLookDevSceneControlCapabilities(),
    renderModes: ['pbr', 'clay', 'wireframe', 'normal', 'depth', 'lightComplexity'],
    liveViewportSettings: false,
    clay: true,
    authoredLights: true,
    environment: true,
    typedPicking: true,
    characterRegions: true,
    capabilityStates: {
      ...defaultModelLookDevSceneControlCapabilities().capabilityStates,
      authoredLights: 'supported',
      environment: 'supported',
      typedPicking: 'supported',
      characterRegions: 'supported',
      renderModes: {
        ...defaultModelLookDevSceneControlCapabilities().capabilityStates.renderModes,
        shadowAtlas: 'unsupported',
      },
    },
  },
  routeAReady = true,
  onModeChange = vi.fn(),
}: {
  state?: LookDevUiState;
  capabilities?: React.ComponentProps<typeof LookDevControls>['capabilities'];
  routeAReady?: boolean;
  onModeChange?: (mode: ViewportRenderMode) => void;
}): void {
  act(() => {
    root.render(
      <LookDevControls
        state={state}
        capabilities={capabilities}
        routeAReady={routeAReady}
        helperPassesEnabled={true}
        onModeChange={onModeChange}
      />,
    );
  });
}

function appliedState(mode: ViewportRenderMode): LookDevUiState {
  return {
    requestedMode: null,
    appliedMode: mode,
    status: 'applied',
    diagnostic: null,
  };
}

function tabLabels(): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map(
    (button) => button.textContent ?? '',
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}
