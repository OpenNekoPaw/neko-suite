import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatModelOption } from '@neko/shared';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import type { GenCategory, GenerationParams } from './types';
import { DEFAULT_GENERATION_PARAMS } from './types';
import { GenerationParamsBar } from './GenerationParamsBar';

const translations: Record<string, string> = {
  'chat.generation.category.image': '图片',
  'chat.generation.category.video': '视频',
  'chat.generation.category.audio': '音频',
  'chat.generation.model.none': '不使用',
  'chat.generation.model.noneShort': '无',
  'chat.generation.model.select': '选择{category}模型',
  'chat.generation.model.unconfigured': '未配置{category}模型',
  'chat.generation.param.ratio': '画面比例',
  'chat.generation.param.resolution': '分辨率',
  'chat.generation.param.videoDuration': '视频时长',
  'chat.generation.param.audioType': '音频类型',
  'chat.generation.param.audioDuration': '音频时长',
  'chat.generation.audioType.music': '音乐',
  'chat.generation.audioType.sfx': '音效',
  'chat.generation.audioType.ambient': '环境音',
  'chat.generation.audioType.voice': '人声',
  'chat.mediaModelNone': 'media:无',
};

const mediaModels: ChatModelOption[] = [
  {
    id: 'image-provider:model-image',
    label: 'Image Provider / Model Image',
    providerId: 'image-provider',
    modelId: 'model-image',
    category: 'image',
  },
  {
    id: 'video-provider:model-video',
    label: 'Video Provider / Model Video',
    providerId: 'video-provider',
    modelId: 'model-video',
    category: 'video',
  },
  {
    id: 'audio-provider:model-audio',
    label: 'Audio Provider / Model Audio',
    providerId: 'audio-provider',
    modelId: 'model-audio',
    category: 'audio',
  },
];

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      formatTranslation(translations[key] ?? key, params),
  }),
}));

describe('GenerationParamsBar', () => {
  it('switches generation category and reveals category-specific params', () => {
    const onGenCategoryChange = vi.fn();

    render(<Harness onGenCategoryChange={onGenCategoryChange} />);

    expect(screen.getByTitle('图片')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '视频时长' })).toBeNull();

    fireEvent.click(screen.getByTitle('图片'));
    fireEvent.click(screen.getByRole('menuitem', { name: '视频' }));

    expect(onGenCategoryChange).toHaveBeenCalledWith('video');
    expect(document.querySelector('.agent-control-chip-category')?.textContent).toContain('视频');
    expect(screen.getByRole('button', { name: '视频时长' })).toBeTruthy();
  });

  it('switches to audio params with localized audio type options', () => {
    render(<Harness onGenCategoryChange={vi.fn()} />);

    fireEvent.click(screen.getByTitle('图片'));
    fireEvent.click(screen.getByRole('menuitem', { name: '音频' }));

    expect(document.querySelector('.agent-control-chip-category')?.textContent).toContain('音频');
    expect(screen.getByRole('button', { name: '音频类型' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '音频类型' }));

    expect(screen.getByRole('menuitem', { name: '音乐' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '环境音' })).toBeTruthy();
  });

  it('selects media models from the inline model dropdown', () => {
    const onMediaModelSelect = vi.fn();

    render(<Harness onGenCategoryChange={vi.fn()} onMediaModelSelect={onMediaModelSelect} />);

    fireEvent.click(screen.getByTitle('Image Provider / Model Image'));
    fireEvent.click(screen.getByRole('menuitem', { name: '不使用' }));

    expect(onMediaModelSelect).toHaveBeenCalledWith('image', 'none');

    fireEvent.click(screen.getByRole('button', { name: /无/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Image Provider / Model Image' }));

    expect(onMediaModelSelect).toHaveBeenCalledWith('image', 'image-provider:model-image');
  });

  it('uses unified compact dropdown classes for generation controls', () => {
    render(<Harness onGenCategoryChange={vi.fn()} />);

    fireEvent.click(screen.getByTitle('图片'));

    expect(document.querySelector('.agent-dropdown-menu-compact')).toBeTruthy();
    expect(screen.getByTitle('图片').className).toContain('agent-control-chip-category');
    expect(screen.getByRole('button', { name: '画面比例' }).className).toContain(
      'agent-control-chip-param',
    );
  });
});

function Harness({
  onGenCategoryChange,
  onMediaModelSelect = vi.fn(),
}: {
  readonly onGenCategoryChange: (category: GenCategory) => void;
  readonly onMediaModelSelect?: (category: GenCategory, modelId: string) => void;
}) {
  const [genCategory, setGenCategory] = useState<GenCategory>('image');
  const [genParams, setGenParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);
  const [mediaModelSelection, setMediaModelSelection] = useState({
    image: 'image-provider:model-image',
    video: 'video-provider:model-video',
    audio: 'audio-provider:model-audio',
  });

  const handleGenCategoryChange = (category: GenCategory) => {
    onGenCategoryChange(category);
    setGenCategory(category);
  };

  const handleMediaModelSelect = (category: GenCategory, modelId: string) => {
    onMediaModelSelect(category, modelId);
    setMediaModelSelection((current) => ({ ...current, [category]: modelId }));
  };

  return (
    <InputAreaProvider
      selectedModel="auto"
      availableModels={[]}
      onModelSelect={vi.fn()}
      mediaModelSelection={mediaModelSelection}
      availableMediaModels={mediaModels}
      onMediaModelSelect={handleMediaModelSelect}
      sessionMode="agent"
      onSessionModeChange={vi.fn()}
      executionMode="ask"
      onExecutionModeChange={vi.fn()}
      promptMode="default"
      onPromptModeChange={vi.fn()}
      contextTokenCount={0}
      maxContextTokens={8192}
      isCompressing={false}
      mediaModelCallCount={0}
      skills={[]}
      contextChips={[]}
      onRemoveContextChip={vi.fn()}
      genCategory={genCategory}
      genParams={genParams}
      onGenCategoryChange={handleGenCategoryChange}
      onGenParamsChange={(partial) => setGenParams((current) => ({ ...current, ...partial }))}
    >
      <GenerationParamsBar />
    </InputAreaProvider>
  );
}

function formatTranslation(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
