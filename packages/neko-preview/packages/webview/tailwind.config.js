import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    "./video.html",
    "./audio.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [],
}
