import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../neko-agent/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-cut/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-types/src/components/**/*.{js,ts,jsx,tsx}',
    '../neko-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
};
