import type { MessageBundle } from '@neko/shared';

export const onboarding = {
  'onboarding.title': '开始使用 AI',
  'onboarding.subtitle': '连接 AI 服务以开始对话。',
  'onboarding.ssoButton': '使用 Neko Studio 账号登录',
  'onboarding.or': '或',
  'onboarding.customKeyButton': '使用我自己的 API Key',
  'onboarding.back': '返回',
  'onboarding.selectProvider': '选择服务商',
  'onboarding.enterKey': '请在下方输入您的 API Key。',
  'onboarding.testing': '测试中…',
  'onboarding.testAndStart': '测试并开始',
  'onboarding.testFailed': '连接测试失败，请检查您的 Key。',
} as const satisfies MessageBundle;
