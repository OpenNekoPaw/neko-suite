import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../neko-agent/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-cut/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-canvas/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-audio/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-sketch/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-model/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-preview/packages/webview/src/**/*.{js,ts,jsx,tsx}',
    '../neko-types/src/components/**/*.{js,ts,jsx,tsx}',
    '../neko-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
};
