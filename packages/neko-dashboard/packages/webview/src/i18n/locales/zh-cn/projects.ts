import type { MessageBundle } from '@neko/shared';

export const projects = {
  'projects.search': '搜索项目',
  'projects.filterByType': '按类型筛选',
  'projects.column.name': '名称',
  'projects.column.type': '类型',
  'projects.column.lastModified': '最后修改',
  'projects.column.size': '大小',
  'projects.column.path': '路径',
  'projects.column.actions': '操作',
  'projects.empty': '没有匹配当前筛选条件的项目。',
} as const satisfies MessageBundle;
