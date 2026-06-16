// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';
import type { DashboardSkill } from '../types';
import { SkillList } from './SkillList';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const skills: readonly DashboardSkill[] = [
  makeSkill({
    id: 'media-to-video',
    name: '媒体转视频',
    tags: ['AI', '视频', '编排'],
    role: 'orchestrator',
    groupId: 'media-to-video',
  }),
  makeSkill({
    id: 'comic-to-storyboard',
    name: '漫画转分镜表',
    tags: ['AI', '漫画', '分镜'],
    role: 'focused-skill',
    visibility: 'advanced',
    groupId: 'media-to-video',
    parentSkillIds: ['media-to-video'],
  }),
  makeSkill({
    id: 'export-video-package',
    name: '视频导出打包',
    tags: ['导出', '视频', '交付'],
    role: 'quick-action',
  }),
];

describe('SkillList', () => {
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

  it('groups orchestrators with focused child skills and renders source/role badges', () => {
    const { host } = renderInteractive(
      <SkillList skills={skills} onCommand={vi.fn()} onSkillAction={vi.fn()} />,
    );

    expect(host.textContent).toContain('编排技能');
    expect(host.textContent).toContain('媒体转视频');
    expect(host.textContent).not.toContain('漫画转分镜表');
    expect(host.textContent).toContain('内置');
    expect(host.textContent).toContain('编排');
    expect(host.textContent).toContain('快捷动作');
    expect(host.textContent).toContain('视频导出打包');
    expect(host.querySelectorAll('.skill-row').length).toBe(2);

    act(() => {
      findButtonByText(host, '子技能（1）')?.click();
    });

    expect(host.textContent).toContain('漫画转分镜表');
    expect(host.querySelectorAll('.skill-row').length).toBe(3);
  });

  it('filters installed skills by tag', () => {
    const { host } = renderInteractive(
      <SkillList skills={skills} onCommand={vi.fn()} onSkillAction={vi.fn()} />,
    );

    expect(host.textContent).toContain('3 个技能');
    expect(host.textContent).toContain('视频导出打包');

    const storyboardFilter = host.querySelector<HTMLSelectElement>('.skill-filter-select');
    expect(storyboardFilter).not.toBeNull();

    act(() => {
      if (storyboardFilter) {
        storyboardFilter.value = '分镜';
        storyboardFilter.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    expect(host.textContent).toContain('1/3 个技能');
    expect(host.textContent).toContain('漫画转分镜表');
    expect(host.textContent).not.toContain('视频导出打包');
  });

  it('renders stable skill icons without leaking raw emoji or codicon text', () => {
    const iconSkills: readonly DashboardSkill[] = [
      makeSkill({
        id: 'builtin-icon',
        name: '内置图标技能',
        tags: ['AI'],
        role: 'orchestrator',
        icon: '🎨',
      }),
      makeSkill({
        id: 'command-icon',
        name: '命令图标技能',
        tags: ['视频'],
        role: 'quick-action',
        icon: '$(play-circle)',
      }),
    ];
    const { host } = renderInteractive(
      <SkillList skills={iconSkills} onCommand={vi.fn()} onSkillAction={vi.fn()} />,
    );

    expect(host.querySelectorAll('.skill-row-icon svg').length).toBe(2);
    expect(host.textContent).not.toContain('🎨');
    expect(host.textContent).not.toContain('$(play-circle)');
  });

  it('collapses and expands advanced entries on demand', () => {
    const { host } = renderInteractive(
      <SkillList skills={skills} onCommand={vi.fn()} onSkillAction={vi.fn()} />,
    );

    const advancedToggle = findButtonByText(host, '高级项1');
    expect(advancedToggle).not.toBeNull();
    expect(advancedToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('漫画转分镜表');

    act(() => {
      advancedToggle?.click();
    });

    expect(advancedToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('漫画转分镜表');
    expect(host.querySelectorAll('.skill-row').length).toBe(3);
  });

  it('dispatches typed management actions without file paths', () => {
    const onSkillAction = vi.fn();
    const { host } = renderInteractive(
      <SkillList skills={skills} onCommand={vi.fn()} onSkillAction={onSkillAction} />,
    );

    act(() => {
      findButtonByText(host, '高级项1')?.click();
    });

    const forkButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.textContent?.trim() === '派生',
    );
    expect(forkButtons.length).toBeGreaterThan(0);

    act(() => {
      forkButtons.at(-1)?.click();
    });

    expect(onSkillAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'comic-to-storyboard' }),
      'fork',
    );
    expect(JSON.stringify(onSkillAction.mock.calls)).not.toContain('/Users/');
    expect(JSON.stringify(onSkillAction.mock.calls)).not.toContain('SKILL.md');
  });

  it('dispatches New Skill and Rescan actions', () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => 'new-skill'),
    );
    const onSkillAction = vi.fn();
    const { host } = renderInteractive(
      <SkillList skills={skills} onCommand={vi.fn()} onSkillAction={onSkillAction} />,
    );

    act(() => {
      findButtonByText(host, '新建技能')?.click();
    });
    act(() => {
      findButtonByText(host, '重新扫描')?.click();
    });

    expect(onSkillAction).toHaveBeenCalledWith(undefined, 'create', { skillName: 'new-skill' });
    expect(onSkillAction).toHaveBeenCalledWith(undefined, 'rescan');
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

function findButtonByText(host: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === label,
    ) ?? null
  );
}

function makeSkill(input: {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly role: DashboardSkill['catalog']['role'];
  readonly icon?: string;
  readonly visibility?: DashboardSkill['catalog']['visibility'];
  readonly groupId?: string;
  readonly parentSkillIds?: readonly string[];
}): DashboardSkill {
  return {
    id: input.id,
    extensionId: 'neko.neko-agent',
    name: input.name,
    description: `${input.name}描述`,
    locale: 'zh-cn',
    icon: input.icon,
    command: 'neko.agent.invokeSkill',
    tags: input.tags,
    catalog: {
      role: input.role,
      source: 'builtin',
      visibility: input.visibility ?? 'primary',
      editable: false,
      groupId: input.groupId,
      parentSkillIds: input.parentSkillIds,
      actions: [{ id: 'run' }, { id: 'fork' }],
    },
  };
}
