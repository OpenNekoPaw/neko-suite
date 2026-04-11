import type { Config } from 'tailwindcss';
import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

export default {
  presets: [nekoTailwindPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
} satisfies Config;
