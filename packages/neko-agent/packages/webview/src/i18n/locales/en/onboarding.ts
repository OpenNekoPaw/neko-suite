import type { MessageBundle } from '@neko/shared';

export const onboarding = {
  'onboarding.title': 'Get Started with AI',
  'onboarding.subtitle': 'Connect an AI service to start chatting.',
  'onboarding.ssoButton': 'Sign in with Neko Studio',
  'onboarding.or': 'or',
  'onboarding.customKeyButton': 'Use my own API key',
  'onboarding.back': 'Back',
  'onboarding.selectProvider': 'Select a provider',
  'onboarding.enterKey': 'Enter your API key below.',
  'onboarding.testing': 'Testing…',
  'onboarding.testAndStart': 'Test & Start',
  'onboarding.testFailed': 'Connection test failed. Please check your key.',
} as const satisfies MessageBundle;
