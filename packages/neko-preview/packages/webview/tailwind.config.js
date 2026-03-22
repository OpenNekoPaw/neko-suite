import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [nekoTailwindPreset],
  content: [
    "./video.html",
    "./audio.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Shared components in neko-types use Tailwind classes (e.g. bg-neko-preview-primary)
    // that must be scanned here to avoid purging from the generated CSS.
    "../../../neko-types/src/components/**/*.{tsx,ts}",
  ],
  plugins: [],
}
