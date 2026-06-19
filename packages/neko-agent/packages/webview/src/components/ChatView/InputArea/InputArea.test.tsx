import { fireEvent, render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentContextPayload, ChatModelOption, MessageAttachment } from '@neko/shared';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import { DEFAULT_GENERATION_PARAMS } from './types';
import { InputArea } from './InputArea';

const translations: Record<string, string> = {
  'chat.input.control.mode': '模式与模型',
  'chat.input.control.params': '工具参数',
  'chat.input.placeholder': '输入任何问题...',
  'chat.input.thinkingPlaceholder': '输入下一条消息...',
  'chat.input.attach': '添加附件',
  'chat.input.attachFile': '添加附件',
  'chat.input.send': '发送',
  'chat.input.queue': '加入队列',
  'chat.input.queuePlaceholder': '已排队 {count} 条消息... 继续输入',
  'chat.input.queuedMessages': '{count} 条排队消息',
  'chat.input.cancel': '取消 (Esc)',
  'chat.input.commands': '命令',
  'chat.input.canvasContext.kicker': '画布选中上下文',
  'chat.input.canvasContext.multiTitle': '已选 {count} 个画布节点',
  'chat.input.canvasContext.counts': '画布选中统计',
  'chat.input.canvasContext.count.shots': '{count} 个镜头',
  'chat.input.canvasContext.count.scenes': '{count} 个场景',
  'chat.input.canvasContext.more': '+{count} 个',
  'chat.input.canvasContext.action.batchGenerate': '批量生成',
  'chat.input.canvasContext.action.optimize': '优化节点',
  'chat.input.canvasContext.action.understand': '询问 Agent',
  'chat.input.canvasContext.prompt.batchGenerate': '为选中的画布镜头批量生成图片。',
  'chat.input.canvasContext.prompt.optimize': '优化选中的画布节点，让分镜结构和视觉提示词更清晰。',
  'chat.input.canvasContext.prompt.understand': '分析选中的画布节点，并建议下一步可执行动作。',
  'chat.autoMode': '自动',
  'chat.selectModel': '选择模型',
  'chat.noModelsAvailable': '无可用模型',
  'chat.sessionMode.agent': 'Agent',
  'chat.sessionMode.image': '生图',
  'chat.sessionMode.video': '生视频',
  'chat.sessionMode.audio': '生音频',
  'chat.generation.category.image': '图片',
  'chat.generation.category.video': '视频',
  'chat.generation.category.audio': '音频',
  'chat.generation.model.none': '不使用',
  'chat.generation.model.noneShort': '无',
  'chat.generation.model.select': '选择{category}模型',
  'chat.generation.model.unconfigured': '未配置{category}模型',
  'chat.generation.param.ratio': '画面比例',
  'chat.generation.param.resolution': '分辨率',
};

const autoModel: ChatModelOption = {
  id: 'auto',
  label: 'Auto',
  providerId: '',
  modelId: '',
  category: 'llm',
};

const chatModels: ChatModelOption[] = [
  autoModel,
  {
    id: 'openai:gpt-5.5',
    label: 'OpenAI / gpt-5.5',
    providerId: 'openai',
    modelId: 'gpt-5.5',
    category: 'llm',
  },
];

const mediaModels: ChatModelOption[] = [
  {
    id: 'image-provider:model-image',
    label: 'Image Provider / Model Image',
    providerId: 'image-provider',
    modelId: 'model-image',
    category: 'image',
  },
];

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      formatTranslation(translations[key] ?? key, params),
  }),
}));

describe('InputArea composer controls', () => {
  it('keeps unconfigured conversations on Agent with an empty LLM selector only', () => {
    render(
      <Harness selectedModel="auto" availableModels={[autoModel]} availableMediaModels={[]}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式与模型' });
    expect(within(modeGroup).getByRole('button', { name: 'Agent' })).toBeTruthy();
    expect(within(modeGroup).getByRole('button', { name: '选择模型' }).textContent).toContain(
      '无可用模型',
    );
    expect(screen.queryByRole('group', { name: '工具参数' })).toBeNull();

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Agent' }));
    expect(screen.queryByRole('menuitem', { name: '生图' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '生视频' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '生音频' })).toBeNull();

    fireEvent.click(within(modeGroup).getByRole('button', { name: '选择模型' }));
    expect(within(screen.getByRole('menu')).getByText('无可用模型')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '自动' })).toBeNull();
  });

  it('hides legacy LLM/generation labels while preserving mode and params controls', () => {
    render(
      <Harness>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByText('LLM')).toBeNull();
    expect(screen.queryByText('生成')).toBeNull();
    const modeGroup = screen.getByRole('group', { name: '模式与模型' });
    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(modeGroup.className).toContain('agent-composer-control-group-mode');
    expect(paramsGroup.className).toContain('agent-composer-control-group-config');
    expect(within(modeGroup).getByRole('button', { name: 'Agent' })).toBeTruthy();
    expect(within(modeGroup).getByRole('button', { name: '选择模型' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /图片/ })).toBeTruthy();
    expect(within(paramsGroup).getByTitle('Image Provider / Model Image')).toBeTruthy();
    expect(screen.getByTitle('添加附件').className).toContain('agent-composer-tool-button');
    expect(screen.getByTitle('命令').className).toContain('agent-composer-tool-button');
    expect(document.querySelector('.agent-composer-toolbar')).toBeTruthy();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('projects selected canvas nodes into a lightweight reference row and recommended actions', () => {
    const onInputChange = vi.fn();
    render(
      <Harness
        ambientNodes={[
          { nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' },
          { nodeId: 'shot-2', type: 'shot', summary: '#2 close-up' },
          { nodeId: 'scene-1', type: 'scene', summary: 'Scene 1: Gate' },
        ]}
      >
        <InputArea
          inputValue=""
          isThinking={false}
          onInputChange={onInputChange}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.getByLabelText('画布选中上下文')).toBeTruthy();
    expect(document.querySelector('.agent-canvas-reference-row')).toBeTruthy();
    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.className).toContain('agent-reference-token');
    expect(token?.getAttribute('data-reference-variant')).toBe('ambient');
    expect(token?.getAttribute('data-reference-kind')).toBe('canvas');
    expect(document.querySelector('.agent-composer-shell [data-agent-canvas-context]')).toBeNull();
    expect(screen.getByText('#1 wide shot')).toBeTruthy();
    expect(screen.getByText('+2 个')).toBeTruthy();
    expect(screen.getByText('2 个镜头')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '批量生成' }));
    expect(onInputChange).toHaveBeenCalledWith('为选中的画布镜头批量生成图片。');
  });

  it('renders attached context and files with the shared reference token presentation', () => {
    const onRemoveContextChip = vi.fn();
    const onAttachedFilesChange = vi.fn();
    const contextChip: AgentContextPayload = {
      id: 'scene-1',
      type: 'scene',
      label: 'Scene 1',
      summary: 'Gate scene',
      data: null,
    };
    const attachedFile: MessageAttachment = {
      id: 'file-1',
      name: 'brief.md',
      type: 'file',
      size: 2048,
    };

    render(
      <Harness contextChips={[contextChip]} onRemoveContextChip={onRemoveContextChip}>
        <InputArea
          inputValue=""
          isThinking={false}
          attachedFiles={[attachedFile]}
          onAttachedFilesChange={onAttachedFilesChange}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const tokens = Array.from(document.querySelectorAll('[data-agent-reference-token="true"]'));
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => token.getAttribute('data-reference-variant'))).toEqual([
      'attached',
      'attached',
    ]);
    expect(tokens.map((token) => token.getAttribute('data-reference-kind'))).toEqual([
      'entity',
      'file',
    ]);
    expect(screen.getByText('Scene 1')).toBeTruthy();
    expect(screen.getByText('brief.md')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Scene 1' }));
    expect(onRemoveContextChip).toHaveBeenCalledWith('scene-1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove brief.md' }));
    expect(onAttachedFilesChange).toHaveBeenCalledWith([]);
  });

  it('moves completed @file mentions into reference tokens and preserves @path on send', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'zip',
            kind: 'file',
            label: '【CG】游戏角色.zip',
            filePath: 'assets/【CG】游戏角色.zip',
            source: 'workspace',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '参考 @assets/【CG】游戏角色.zip ' },
    });

    const token = screen.getByText('【CG】游戏角色.zip').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('assets')).toBeTruthy();
    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '参考 ',
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @assets/【CG】游戏角色.zip',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '【CG】游戏角色.zip',
            path: 'assets/【CG】游戏角色.zip',
          }),
        ],
      }),
    );
  });

  it('moves completed path-backed asset mentions into reference tokens', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'asset-hero',
            kind: 'asset',
            label: 'Hero portrait',
            filePath: 'assets/hero.png',
            source: 'asset-library',
            mediaType: 'image',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '参考 @assets/hero.png' },
    });

    const token = screen.getByText('Hero portrait').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('image');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('assets')).toBeTruthy();
    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '参考 ',
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @assets/hero.png',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: 'Hero portrait',
            path: 'assets/hero.png',
            mediaType: 'image',
            source: 'asset-library',
          }),
        ],
      }),
    );
  });

  it('selects @ mention files with CJK and spaces as reference tokens and clears the trigger', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'file-face',
            kind: 'file',
            label: '按键 黑脸.exp3.json',
            filePath: 'assets/live2d/按键 黑脸.exp3.json',
            source: 'workspace',
            mediaType: 'document',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '参考 @' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /按键 黑脸\.exp3\.json/i }));

    const token = screen.getByText('按键 黑脸.exp3.json').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(textarea.value).toBe('参考 ');

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @"assets/live2d/按键 黑脸.exp3.json"',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '按键 黑脸.exp3.json',
            path: 'assets/live2d/按键 黑脸.exp3.json',
          }),
        ],
      }),
    );
  });

  it('quotes selected @file references with spaces when sending', () => {
    const onSend = vi.fn();
    render(
      <Harness
        selectedFileReferences={[
          {
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            path: 'assets/ref file.zip',
          },
        ]}
      >
        <InputArea inputValue="参考" isThinking={false} onInputChange={vi.fn()} onSend={onSend} />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @"assets/ref file.zip"',
        displayMessageText: '参考',
      }),
    );
  });

  it('shows explicit queue and stop actions while a response is running', () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();

    render(
      <Harness>
        <InputArea
          inputValue="继续处理"
          isThinking={true}
          queuedMessageCount={2}
          onInputChange={vi.fn()}
          onSend={onSend}
          onCancel={onCancel}
        />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('已排队 2 条消息... 继续输入');
    expect(textarea).toBeTruthy();
    expect(screen.getByTitle('加入队列').className).toContain('agent-composer-queue');
    expect(screen.getByTitle('取消 (Esc)').className).toContain('agent-composer-stop');
    expect(document.querySelector('.agent-composer-queue-count')?.textContent).toBe('2');

    fireEvent.click(screen.getByTitle('加入队列'));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ messageText: '继续处理' }));

    fireEvent.click(screen.getByTitle('取消 (Esc)'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps incomplete workspace references in the textarea until a token can be created', () => {
    render(
      <Harness
        mentionItems={[
          {
            id: 'video',
            kind: 'file',
            label: '1080P.mp4',
            filePath: 'cases/1080P.mp4',
            source: 'workspace',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '请分析 @cases/1080' },
    });

    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '请分析 @cases/1080',
    );
    expect(document.querySelector('[data-agent-reference-token="true"]')).toBeNull();
  });
});

function InputAreaStatefulHarness({
  initialInputValue,
  onSend,
}: {
  readonly initialInputValue: string;
  readonly onSend: React.ComponentProps<typeof InputArea>['onSend'];
}) {
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [selectedFileReferences, setSelectedFileReferences] = useState<
    NonNullable<React.ComponentProps<typeof InputArea>['selectedFileReferences']>
  >([]);

  return (
    <InputArea
      inputValue={inputValue}
      isThinking={false}
      selectedFileReferences={selectedFileReferences}
      onSelectedFileReferencesChange={setSelectedFileReferences}
      onInputChange={setInputValue}
      onSend={onSend}
    />
  );
}

function Harness({
  ambientNodes,
  contextChips = [],
  onRemoveContextChip = vi.fn(),
  mentionItems = [],
  selectedModel = 'openai:gpt-5.5',
  availableModels = chatModels,
  availableMediaModels = mediaModels,
  selectedFileReferences = [],
  onSelectedFileReferencesChange = vi.fn(),
  children,
}: {
  readonly ambientNodes?: Array<{ nodeId: string; type: string; summary: string }>;
  readonly contextChips?: AgentContextPayload[];
  readonly onRemoveContextChip?: (id: string) => void;
  readonly mentionItems?: React.ComponentProps<typeof InputAreaProvider>['mentionItems'];
  readonly selectedModel?: string;
  readonly availableModels?: ChatModelOption[];
  readonly availableMediaModels?: ChatModelOption[];
  readonly selectedFileReferences?: React.ComponentProps<
    typeof InputArea
  >['selectedFileReferences'];
  readonly onSelectedFileReferencesChange?: React.ComponentProps<
    typeof InputArea
  >['onSelectedFileReferencesChange'];
  readonly children: React.ReactNode;
}) {
  return (
    <InputAreaProvider
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={vi.fn()}
      mediaModelSelection={{
        image: 'image-provider:model-image',
        video: 'none',
        audio: 'none',
      }}
      availableMediaModels={availableMediaModels}
      onMediaModelSelect={vi.fn()}
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
      mentionItems={mentionItems}
      contextChips={contextChips}
      onRemoveContextChip={onRemoveContextChip}
      ambientNodes={ambientNodes}
      genCategory="image"
      genParams={DEFAULT_GENERATION_PARAMS}
      onGenCategoryChange={vi.fn()}
      onGenParamsChange={vi.fn()}
    >
      {injectInputReferenceProps(children, {
        selectedFileReferences,
        onSelectedFileReferencesChange,
      })}
    </InputAreaProvider>
  );
}

function injectInputReferenceProps(
  children: React.ReactNode,
  props: Pick<
    React.ComponentProps<typeof InputArea>,
    'selectedFileReferences' | 'onSelectedFileReferencesChange'
  >,
) {
  if (!isValidElement<React.ComponentProps<typeof InputArea>>(children)) {
    return children;
  }
  return cloneElement(children, props);
}

function formatTranslation(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
