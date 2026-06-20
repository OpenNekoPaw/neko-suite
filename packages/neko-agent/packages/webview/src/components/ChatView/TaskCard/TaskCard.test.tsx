import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackgroundTask } from '@/components/TaskListView';
import { TaskCard } from './TaskCard';

vi.mock('@/components/ChatView/RichContent', () => ({
  RichContentRenderer: () => <div data-testid="result-preview" />,
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'common.view' ? 'View' : key),
  }),
}));

describe('TaskCard result actions', () => {
  it('renders creative target buttons without the redundant Explorer action', () => {
    render(
      <TaskCard
        task={createCompletedImageTask()}
        onViewResult={vi.fn()}
        plugins={{ canvas: true, cut: true, sketch: true, model: false }}
      />,
    );

    fireEvent.click(screen.getByText('tasks.imageGeneration'));

    expect(screen.getByTestId('result-preview')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Canvas/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Timeline/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sketch/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Explorer|Folder/ })).toBeNull();
    expect(screen.queryByText('tasks.revealInExplorer')).toBeNull();
  });
});

function createCompletedImageTask(): BackgroundTask {
  return {
    id: 'task-1',
    type: 'image',
    name: 'Generated frame',
    prompt: 'Generate a quiet interior frame.',
    providerId: 'openai',
    providerName: 'gpt-image-2',
    status: 'completed',
    progress: 100,
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:01.000Z',
    result: {
      urls: ['webview-uri:/workspace/.neko/generated/image/frame.png'],
      localPaths: ['/workspace/.neko/generated/image/frame.png'],
      width: 1024,
      height: 1024,
    },
  };
}
