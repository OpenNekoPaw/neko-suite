import type { Config } from 'tailwindcss';
// Import path resolves to @neko/shared alias defined in vite.config.ts
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at build time via path alias
import { nekoTailwindPreset } from '../../../neko-types/src/theme/tailwind-preset';

export default {
  presets: [nekoTailwindPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} satisfies Config;
