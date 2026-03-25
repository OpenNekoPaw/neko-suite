import type { MessageBundle } from '@neko/shared';

export const marketplace = {
  // Search bar
  'marketplace.search.placeholder': '搜索市场...',
  'marketplace.search.clear': '清除',
  'marketplace.filter.all': '全部',
  'marketplace.filter.skill': 'Skills',
  'marketplace.filter.shader': 'Shaders',
  'marketplace.filter.model': '模型',
  'marketplace.filter.preset': '预设',

  // Tabs
  'marketplace.tab.browse': '浏览',
  'marketplace.tab.installed': '已安装',
  'marketplace.tab.updates': '更新',

  // Browse view
  'marketplace.browse.featured': '精选',
  'marketplace.browse.results': '{count} 个结果',
  'marketplace.browse.searching': '搜索中...',
  'marketplace.browse.noResults': '未找到 "{query}" 的相关结果',
  'marketplace.browse.empty': '暂无可用包。',

  // Installed view
  'marketplace.installed.empty': '尚未安装任何市场包。',

  // Updates view
  'marketplace.updates.empty': '所有包均为最新版本。',
  'marketplace.updates.updateAll': '全部更新',
  'marketplace.updates.count': '{count} 个更新可用',
  'marketplace.updates.countPlural': '{count} 个更新可用',

  // Actions
  'marketplace.action.install': '安装',
  'marketplace.action.uninstall': '卸载',
  'marketplace.action.update': '更新',
  'marketplace.action.enable': '启用',
  'marketplace.action.disable': '停用',
  'marketplace.action.installing': '安装中...',
  'marketplace.action.uninstalling': '卸载中...',

  // Progress
  'marketplace.progress.downloading': '下载中',
  'marketplace.progress.extracting': '解压中',
  'marketplace.progress.installing': '安装中',

  // Errors
  'marketplace.error.installFailed': '安装失败：{message}',
  'marketplace.error.uninstallFailed': '卸载失败：{message}',
  'marketplace.error.searchFailed': '搜索失败，请重试。',
  'marketplace.error.loadFailed': '加载市场数据失败。',
} as const satisfies MessageBundle;
