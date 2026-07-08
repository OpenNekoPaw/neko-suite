import { describe, expect, it } from 'vitest';
import { createDesktopI18n } from '../i18n';

describe('desktop renderer i18n', () => {
  it('registers English and Chinese workbench shell messages through shared i18n', () => {
    const i18n = createDesktopI18n('zh-cn');

    expect(i18n.t('surface.explorer.title')).toBe('项目资源管理器');
    expect(i18n.t('rightPanel.agent')).toBe('Agent');
    expect(i18n.t('explorer.fileTree')).toBe('工作区文件树');
    expect(i18n.t('explorer.directoryManagement')).toBe('目录管理');
    expect(i18n.t('explorer.moreActions')).toBe('更多操作');
    expect(i18n.t('explorer.outline')).toBe('大纲');
    expect(i18n.t('explorer.scm.untracked')).toBe('未跟踪');
    expect(i18n.t('adapter.cutProjectInvalid')).toBe('无效的 Cut 项目');
    expect(i18n.t('editor.loading')).toBe('正在加载编辑器文档...');
    expect(i18n.t('status.files', { count: 12 })).toBe('12 个文件');
    expect(i18n.t('inspector.title')).toBe('检查器');
    expect(i18n.t('viewport.activate')).toBe('激活');

    i18n.setLocale('en');

    expect(i18n.t('surface.explorer.title')).toBe('Project Explorer');
    expect(i18n.t('rightPanel.agent')).toBe('Agent');
    expect(i18n.t('explorer.fileTree')).toBe('Workspace file tree');
    expect(i18n.t('explorer.directoryManagement')).toBe('Directory management');
    expect(i18n.t('explorer.moreActions')).toBe('More actions');
    expect(i18n.t('explorer.outline')).toBe('Outline');
    expect(i18n.t('explorer.scm.untracked')).toBe('Untracked');
    expect(i18n.t('adapter.cutProjectInvalid')).toBe('Invalid Cut project');
    expect(i18n.t('editor.loading')).toBe('Loading editor document...');
    expect(i18n.t('status.files', { count: 12 })).toBe('12 files');
    expect(i18n.t('inspector.title')).toBe('Inspector');
    expect(i18n.t('viewport.activate')).toBe('Activate');
  });
});
