import type { MessageBundle } from '@neko/shared';

export const marketplace = {
  // Search bar
  'marketplace.search.placeholder': '搜索市场...',
  'marketplace.search.clear': '清除',
  'marketplace.filter.all': '全部',
  // AssetType 维度保留具体实现类型文案；category chip 才显示「素材 / 整合」。
  'marketplace.filter.media': '媒体',
  'marketplace.filter.identity': '身份',
  'marketplace.filter.skill': '技能',
  'marketplace.filter.shader': '着色器',
  'marketplace.filter.model': '模型',
  'marketplace.filter.provider': '提供方',
  'marketplace.filter.preset': '预设',
  'marketplace.filter.starter': '启动模板',
  'marketplace.filter.endpoint': '端点',
  'marketplace.filter.plugin': '插件',
  'marketplace.filter.bundle': '整合包',
  'marketplace.filter.category': '分类',
  'marketplace.filter.type': '类型',
  'marketplace.filter.kind': '子类型',
  'marketplace.filter.sort': '排序',
  'marketplace.filter.pricing': '价格',
  'marketplace.category.media': '素材',
  'marketplace.category.ai': 'AI',
  'marketplace.category.tooling': '工具',
  'marketplace.category.bundle': '整合',
  'marketplace.sort.recommended': '推荐',
  'marketplace.sort.latest': '最新',
  'marketplace.sort.trending': '趋势',
  'marketplace.sort.downloads': '下载量',
  'marketplace.pricing.free': '免费',
  'marketplace.pricing.paid': '付费',

  // Tabs
  'marketplace.tab.browse': '浏览',
  'marketplace.tab.installed': '已安装',
  'marketplace.tab.owned': '已拥有',
  'marketplace.tab.updates': '更新',

  // Browse view
  'marketplace.browse.featured': '精选',
  'marketplace.browse.results': '{count} 个结果',
  'marketplace.browse.searching': '搜索中...',
  'marketplace.browse.noResults': '未找到 "{query}" 的相关结果',
  'marketplace.browse.empty': '暂无可用包。',

  // Installed view
  'marketplace.installed.empty': '尚未安装任何市场包。',
  'marketplace.installed.hint': '浏览市场以查找技能和资产。',
  'marketplace.installed.disabled': '已停用',
  'marketplace.installed.dependencies': '{count} 个依赖引用',

  // Owned view
  'marketplace.owned.empty': '尚未拥有任何市场包。',
  'marketplace.owned.count': '{count} 个已拥有包',
  'marketplace.owned.state.owned-installed': '已安装',
  'marketplace.owned.state.owned-not-installed': '未安装',
  'marketplace.owned.state.expiring': '即将过期',
  'marketplace.owned.state.expired': '已过期',
  'marketplace.owned.state.pending': '处理中',

  // Updates view
  'marketplace.updates.empty': '所有包均为最新版本。',
  'marketplace.updates.updateAll': '全部更新',
  'marketplace.updates.count': '{count} 个更新可用',
  'marketplace.updates.countPlural': '{count} 个更新可用',
  'marketplace.updates.blocked': '已阻止',

  // Actions
  'marketplace.action.install': '安装',
  'marketplace.action.uninstall': '卸载',
  'marketplace.action.update': '更新',
  'marketplace.action.buy': '购买',
  'marketplace.action.installed': '已安装',
  'marketplace.action.enable': '启用',
  'marketplace.action.disable': '停用',
  'marketplace.action.detail': '详情',
  'marketplace.action.refresh': '刷新',
  'marketplace.action.renew': '续费',
  'marketplace.action.installing': '安装中...',
  'marketplace.action.uninstalling': '卸载中...',

  // Progress
  'marketplace.progress.downloading': '下载中',
  'marketplace.progress.extracting': '解压中',
  'marketplace.progress.installing': '安装中',

  // Status
  'marketplace.status.active': '可用',
  'marketplace.status.expiring-soon': '即将过期',
  'marketplace.status.expired': '已过期',
  'marketplace.status.incompatible': '不兼容',
  'marketplace.status.deprecated': '已弃用',
  'marketplace.largeAsset.state.not-owned': '未拥有',
  'marketplace.largeAsset.state.owned': '已拥有',
  'marketplace.largeAsset.state.manifest-only': '仅清单',
  'marketplace.largeAsset.state.proxy': '代理质量',
  'marketplace.largeAsset.state.partial': '部分',
  'marketplace.largeAsset.state.full': '完整',
  'marketplace.largeAsset.choose': '选择素材',
  'marketplace.largeAsset.unsupported': '不支持',
  'marketplace.largeAsset.recommended': '推荐',
  'marketplace.largeAsset.default': '默认',
  'marketplace.largeAsset.selectedCount': '已选择 {count} 项',
  'marketplace.largeAsset.variant': '变体',
  'marketplace.largeAsset.size': '大小',
  'marketplace.largeAsset.minVram': '最低显存',
  'marketplace.largeAsset.selectAll': '全选',
  'marketplace.largeAsset.selectRecommended': '推荐',
  'marketplace.largeAsset.clear': '清空',
  'marketplace.largeAsset.cancel': '取消',

  // Errors
  'marketplace.error.installFailed': '安装失败：{message}',
  'marketplace.error.uninstallFailed': '卸载失败：{message}',
  'marketplace.error.searchFailed': '搜索失败，请重试。',
  'marketplace.error.loadFailed': '加载市场数据失败。',
} as const satisfies MessageBundle;
