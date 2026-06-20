/**
 * ModelIcon — provider / category color dot for model selectors
 */

import type { ModelType } from '@neko/shared';

// Brand-inspired colors, adjusted for VS Code dark/light themes
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#E5742A',
  openai: '#10A37F',
  google: '#4285F4',
  azure: '#0078D4',
  ollama: '#8B5CF6',
  lmstudio: '#8B5CF6',
  deepseek: '#1A73E8',
  mistral: '#FF7000',
  cohere: '#39594D',
};

const CATEGORY_COLORS: Record<ModelType, string> = {
  llm: '#10A37F',
  image: '#A855F7',
  video: '#EF4444',
  audio: '#06B6D4',
};

export function getProviderColor(providerId: string): string {
  const key = providerId.toLowerCase();
  for (const [prefix, color] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(prefix)) return color;
  }
  return '#6B7280';
}

export function getCategoryColor(category: ModelType | string | undefined): string {
  return category ? (CATEGORY_COLORS[category as ModelType] ?? '#6B7280') : '#6B7280';
}

interface ModelDotProps {
  color: string;
  className?: string;
}

/** Small filled circle indicating provider / category */
export function ModelDot({ color, className }: ModelDotProps) {
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${className ?? 'w-1.5 h-1.5'}`}
      style={{ backgroundColor: color }}
    />
  );
}
