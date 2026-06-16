// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityRow,
} from '@neko/shared/types/dashboard-creative-entity';
import { CreativeEntitiesSection } from './CreativeEntitiesSection';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const row: DashboardCreativeEntityRow = {
  ref: {
    source: 'neko-story',
    sourceEntityId: 'entity:char_xiaoju',
    entityId: 'char_xiaoju',
    entityKind: 'character',
    workspaceFolder: 'neko-test',
  },
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  missingRepresentationKinds: ['live2d'],
  defaultBindingRoles: ['portrait'],
  visualDraftCount: 1,
  freshness: 'fresh',
  actions: [{ id: 'show-detail', label: 'Show detail' }],
  searchText: '小橘 portrait',
};

const detail: DashboardCreativeEntityDetail = {
  ref: row.ref,
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  aliases: ['Xiaoju'],
  relationships: [],
  occurrences: [
    {
      source: 'script',
      role: 'reference',
      label: '小橘',
      location: 'cases/test.fountain:8',
    },
  ],
  bindings: [
    {
      id: 'binding-portrait',
      role: 'portrait',
      assetRef: 'project://assets/xiaoju',
      preview: {
        kind: 'image',
        uri: 'vscode-webview://neko-dashboard/assets/xiaoju.png',
        label: '小橘头像',
        thumbnailUri: 'vscode-webview://neko-dashboard/assets/xiaoju-thumb.png',
        mimeType: 'image/png',
      },
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      isDefault: true,
      updatedAt: '2026-05-18T00:00:00.000Z',
    },
  ],
  defaults: [
    {
      id: 'binding-portrait',
      role: 'portrait',
      assetRef: 'project://assets/xiaoju',
      preview: {
        kind: 'image',
        uri: 'vscode-webview://neko-dashboard/assets/xiaoju.png',
        label: '小橘头像',
        thumbnailUri: 'vscode-webview://neko-dashboard/assets/xiaoju-thumb.png',
        mimeType: 'image/png',
      },
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      isDefault: true,
      updatedAt: '2026-05-18T00:00:00.000Z',
    },
  ],
  requirements: [
    {
      id: 'requirement-live2d',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      source: 'story',
      sourceRef: 'story://test.fountain#12',
      requiredKinds: ['live2d'],
      status: 'missing',
      actions: ['generate', 'bind-existing'],
    },
  ],
  visualDrafts: [
    {
      id: 'draft-1',
      characterId: 'char_xiaoju',
      source: 'agent',
      prompt: 'orange outfit',
      generatedAssetIds: ['generated-1'],
      status: 'drafting',
      factCount: 1,
    },
  ],
  syncSuggestions: [
    {
      id: 'sync-1',
      kind: 'asset-metadata',
      status: 'suggested',
      entityRef: row.ref,
      targetRef: 'project://assets/xiaoju',
      fields: ['tags'],
      reason: 'Asset tags may be stale',
      ownerSource: 'neko-story',
    },
    {
      id: 'sync-2',
      kind: 'asset-metadata',
      status: 'unavailable',
      entityRef: row.ref,
      targetRef: 'market://pack/xiaoju',
      fields: ['tags'],
      reason: 'Read-only target',
      ownerSource: 'neko-story',
      readonlyTarget: true,
    },
  ],
  memoryReviews: [
    {
      reviewId: 'review-obs-1',
      contributionId: 'contribution-page-1',
      observationId: 'obs-1',
      entityRef: row.ref,
      sourcePackage: 'neko-agent',
      sourceLabel: '漫画 OCR',
      sourceKind: 'comic',
      reviewPolicy: 'requires-user-review',
      reviewStatus: 'needs-review',
      dimensions: ['appearance', 'voice'],
      summary: '小橘穿着橙色外套。',
      evidenceText: 'P11 panel',
      confidence: 0.82,
      actions: ['accept-memory-review', 'reject-memory-review', 'mark-memory-conflict'],
    },
  ],
  freshness: 'fresh',
  actions: [
    { id: 'character-dialogue', label: 'Character Dialogue' },
    { id: 'embody-character', label: 'Embody Character' },
    { id: 'bind-existing', label: 'Bind asset' },
    { id: 'generate-material', label: 'Generate material' },
    { id: 'review-drafts', label: 'Review drafts', disabled: false },
    { id: 'confirm-candidate', label: 'Confirm candidate', disabled: true },
  ],
};

describe('CreativeEntitiesSection', () => {
  const mountedRoots: Array<{ root: Root; host: HTMLDivElement }> = [];

  afterEach(() => {
    for (const mounted of mountedRoots.splice(0)) {
      act(() => {
        mounted.root.unmount();
      });
      mounted.host.remove();
    }
  });

  it('renders table rows, detail content, disabled actions, and sync suggestions', () => {
    const html = renderSection(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [row],
          selectedRef: row.ref,
          detail,
        }}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(html).toContain('创作实体');
    expect(html).toContain('刷新');
    expect(html).toContain('小橘');
    expect(html).toContain('身份');
    expect(html).toContain('素材');
    expect(html).toContain('活动');
    expect(html).not.toContain('<th>状态</th>');
    expect(html).not.toContain('<th>默认绑定</th>');
    expect(html).not.toContain('<th>断开</th>');
    expect(html).not.toContain('<th>草稿</th>');
    expect(html).toContain('Live2D');
    expect(html).toContain('角色对话');
    expect(html).toContain('代入角色');
    expect(html).not.toContain('Bind asset');
    expect(html).not.toContain('测试 NPC');
    expect(html).not.toContain('角色视角');
    expect(html).not.toContain('验证角色');
    expect(html).not.toContain('完善设定');
    expect(html).toContain('project://assets/xiaoju');
    expect(html).toContain('已确认');
    expect(html).toContain('记忆审阅');
    expect(html).toContain('小橘穿着橙色外套。');
    expect(html).toContain('待审阅');
    expect(html).toContain('漫画 OCR');
    expect(html).toContain('媒体预览');
    expect(html).toContain('1 张图片');
    expect(html).toContain('小橘头像');
    expect(html).toContain('vscode-webview://neko-dashboard/assets/xiaoju-thumb.png');
    expect(html).toContain('图片预览');
    expect(html).toContain('Asset tags may be stale');
    expect(html).toContain('disabled=""');
  });

  it('keeps media actions in the preview instead of duplicating them in the footer', () => {
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [row],
          selectedRef: row.ref,
          detail,
        }}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(host.textContent).toContain('素材缺口');
    const preview = host.querySelector('.entity-preview-panel');
    expect(preview?.textContent).toContain('媒体预览');
    expect(host.querySelector('.detail-actions')?.textContent).toContain('角色对话');
    expect(host.querySelector('.detail-actions')?.textContent).toContain('代入角色');
    expect(host.querySelector('.detail-actions')?.textContent).not.toContain('绑定素材');
    expect(host.querySelector('.detail-actions')?.textContent).not.toContain('生成');
    expect(host.querySelector('.detail-actions')?.textContent).not.toContain('详情');
    expect(host.querySelector('.detail-actions')?.textContent).not.toContain('待补素材');
  });

  it('switches the detail preview between bound images and models', () => {
    const modelDetail: DashboardCreativeEntityDetail = {
      ...detail,
      bindings: [
        ...detail.bindings,
        {
          id: 'binding-live3d',
          role: 'live3d',
          assetRef: 'project://assets/xiaoju-model',
          preview: {
            kind: 'model',
            uri: 'vscode-webview://neko-dashboard/assets/xiaoju.glb',
            label: '小橘 3D 模型',
            thumbnailUri: 'vscode-webview://neko-dashboard/assets/xiaoju-model-thumb.png',
            mimeType: 'model/gltf-binary',
          },
          status: 'confirmed',
          availability: 'active',
          source: 'user',
          isDefault: false,
          updatedAt: '2026-05-18T00:00:00.000Z',
        },
      ],
    };
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [row],
          selectedRef: row.ref,
          detail: modelDetail,
        }}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(host.textContent).toContain('1 张图片 · 1 个模型');
    expect(host.querySelector<HTMLImageElement>('.entity-preview-stage img')?.src).toContain(
      'xiaoju-thumb.png',
    );

    const modelTab = findButtonByText(host, '模型1');
    expect(modelTab).not.toBeNull();
    act(() => {
      modelTab?.click();
    });

    expect(host.textContent).toContain('小橘 3D 模型');
    expect(host.querySelector<HTMLImageElement>('.entity-preview-stage img')?.src).toContain(
      'xiaoju-model-thumb.png',
    );
  });

  it('shows bind and generate guidance when the selected entity has no preview media', () => {
    const onAction = vi.fn();
    const noPreviewDetail: DashboardCreativeEntityDetail = {
      ...detail,
      bindings: detail.bindings.map((binding) => {
        const { preview: _preview, ...bindingWithoutPreview } = binding;
        return bindingWithoutPreview;
      }),
      defaults: detail.defaults.map((binding) => {
        const { preview: _preview, ...bindingWithoutPreview } = binding;
        return bindingWithoutPreview;
      }),
    };
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [row],
          selectedRef: row.ref,
          detail: noPreviewDetail,
        }}
        onSelect={vi.fn()}
        onAction={onAction}
        onRefresh={vi.fn()}
      />,
    );

    expect(host.textContent).toContain('需要绑定形象 / 生成形象');
    expect(host.textContent).toContain('绑定参考图、Live2D 或 Live3D');

    const bindButton = findButtonByText(host, '绑定素材');
    const generateButton = findButtonByText(host, '生成');
    expect(bindButton).not.toBeNull();
    expect(generateButton).not.toBeNull();
    act(() => {
      bindButton?.click();
      generateButton?.click();
    });

    expect(onAction).toHaveBeenNthCalledWith(1, {
      source: row.ref.source,
      ref: row.ref,
      action: 'bind-existing',
    });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      source: row.ref.source,
      ref: row.ref,
      action: 'generate-material',
    });
  });

  it('compresses empty detail fields and formats occurrence locations without repeated names', () => {
    const compactDetail: DashboardCreativeEntityDetail = {
      ...detail,
      label: '猫妈妈',
      aliases: [],
      occurrences: [18, 21, 28, 31, 42, 56].map((line) => ({
        source: 'script',
        role: 'reference',
        label: '猫妈妈',
        location: `cases/test.fountain:${line}`,
      })),
      bindings: [],
      defaults: [],
      requirements: [
        {
          id: 'requirement-portrait-reference',
          entityId: 'cat-mother',
          entityKind: 'character',
          source: 'story',
          sourceRef: 'story://cases/test.fountain#18',
          requiredKinds: ['portrait', 'reference'],
          status: 'missing',
          actions: ['generate', 'bind-existing'],
        },
      ],
      visualDrafts: [],
      memoryReviews: [],
      syncSuggestions: [],
    };
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [{ ...row, label: '猫妈妈' }],
          selectedRef: row.ref,
          detail: compactDetail,
        }}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(host.textContent).toContain('6 次出现');
    expect(host.textContent).toContain('缺：头像, 参考图');
    expect(host.textContent).toContain('另 2 项');
    expect(host.textContent).toContain('cases/test.fountain:18');
    expect(host.textContent).toContain('素材缺口');
    expect(host.textContent).not.toContain('默认绑定无');
    expect(host.textContent).not.toContain('全部绑定无');
    expect(host.textContent).not.toContain('视觉草稿无');
    expect(host.textContent).not.toContain('记忆审阅无');
    expect(host.textContent).not.toContain('同步建议无');

    const occurrenceChips = Array.from(host.querySelectorAll('.detail-occurrence-chip'));
    expect(occurrenceChips).toHaveLength(4);
    for (const chip of occurrenceChips) {
      expect(chip.textContent).not.toContain('猫妈妈');
    }
  });

  it('does not render unsafe absolute paths from malformed source DTOs', () => {
    const html = renderSection(
      <CreativeEntitiesSection
        state={{
          statuses: [],
          rows: [
            row,
            {
              ...row,
              ref: { ...row.ref, sourceEntityId: 'entity:unsafe' },
              label: 'Unsafe',
              searchText: '/tmp/leak.fountain',
            },
          ],
          selectedRef: row.ref,
          detail: {
            ...detail,
            occurrences: [{ ...detail.occurrences[0]!, location: '/tmp/leak.fountain:1' }],
          },
        }}
        onSelect={vi.fn()}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(html).toContain('小橘');
    expect(html).not.toContain('/tmp/leak');
    expect(html).not.toContain('.neko/.cache');
  });

  it('delegates Dashboard character role operations through shared action requests', () => {
    const onAction = vi.fn();
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [row],
          selectedRef: row.ref,
          detail,
        }}
        onSelect={vi.fn()}
        onAction={onAction}
        onRefresh={vi.fn()}
      />,
    );

    for (const label of ['角色对话', '代入角色', '接受']) {
      const button = findButtonByText(host, label);
      expect(button, label).not.toBeNull();
      act(() => {
        button?.click();
      });
    }

    expect(onAction).toHaveBeenCalledTimes(3);
    expect(onAction).toHaveBeenNthCalledWith(1, {
      source: row.ref.source,
      ref: row.ref,
      action: 'character-dialogue',
    });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      source: row.ref.source,
      ref: row.ref,
      action: 'embody-character',
    });
    expect(onAction).toHaveBeenNthCalledWith(3, {
      source: row.ref.source,
      ref: row.ref,
      action: 'accept-memory-review',
      memoryReviewId: 'review-obs-1',
    });
  });

  it('renders orphaned binding availability and delegates binding-scoped actions with ids', () => {
    const onAction = vi.fn();
    const orphanedDetail: DashboardCreativeEntityDetail = {
      ...detail,
      bindings: [
        {
          ...detail.bindings[0]!,
          id: 'binding-missing-portrait',
          assetRef: 'project://assets/missing-portrait',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        },
      ],
      defaults: [
        {
          ...detail.defaults[0]!,
          id: 'binding-missing-portrait',
          assetRef: 'project://assets/missing-portrait',
          availability: 'orphaned',
          orphanedAt: '2026-06-10T01:00:00.000Z',
        },
      ],
      actions: [
        ...detail.actions,
        { id: 'rebind-orphaned-binding', label: 'Rebind orphaned asset' },
        { id: 'locate-binding-source', label: 'Locate source' },
        { id: 'archive-binding', label: 'Archive orphaned binding' },
      ],
    };
    const { host } = renderInteractive(
      <CreativeEntitiesSection
        state={{
          statuses: [{ source: 'neko-story', available: true, freshness: 'fresh' }],
          rows: [{ ...row, orphanedBindingCount: 1 }],
          selectedRef: row.ref,
          detail: orphanedDetail,
        }}
        onSelect={vi.fn()}
        onAction={onAction}
        onRefresh={vi.fn()}
      />,
    );

    expect(host.textContent).toContain('1 个断开');
    expect(host.textContent).toContain('已断开');
    expect(host.textContent).toContain('断开时间：2026-06-10T01:00:00.000Z');
    expect(host.textContent).toContain('重新绑定');
    expect(host.textContent).not.toContain('Rebind orphaned asset');

    const rebindInput = host.querySelector<HTMLInputElement>('input[aria-label="新素材引用"]');
    expect(rebindInput).not.toBeNull();
    const rebindButton = findButtonByText(host, '重新绑定');
    expect(rebindButton).not.toBeNull();
    expect(rebindButton?.disabled).toBe(true);
    act(() => {
      setInputValue(rebindInput, 'project://assets/new-portrait');
    });
    expect(rebindButton?.disabled).toBe(false);
    act(() => {
      rebindButton?.click();
    });

    const archiveButton = findButtonByText(host, '归档绑定');
    expect(archiveButton).not.toBeNull();
    act(() => {
      archiveButton?.click();
    });

    expect(onAction).toHaveBeenNthCalledWith(1, {
      source: row.ref.source,
      ref: row.ref,
      action: 'rebind-orphaned-binding',
      payload: {
        bindingId: 'binding-missing-portrait',
        assetRef: 'project://assets/new-portrait',
      },
    });
    expect(onAction).toHaveBeenNthCalledWith(2, {
      source: row.ref.source,
      ref: row.ref,
      action: 'archive-binding',
      payload: { bindingId: 'binding-missing-portrait' },
    });
  });

  function renderInteractive(element: React.ReactElement): { host: HTMLDivElement } {
    i18nService.setLocale('zh-cn');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mountedRoots.push({ root, host });
    act(() => {
      root.render(<I18nProvider service={i18nService}>{element}</I18nProvider>);
    });
    return { host };
  }
});

function renderSection(element: React.ReactElement): string {
  i18nService.setLocale('zh-cn');
  return renderToStaticMarkup(<I18nProvider service={i18nService}>{element}</I18nProvider>);
}

function findButtonByText(host: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === label,
    ) ?? null
  );
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
