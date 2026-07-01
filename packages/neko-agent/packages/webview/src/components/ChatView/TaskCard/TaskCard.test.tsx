import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackgroundTask } from '@/components/TaskListView';
import { TaskCard } from './TaskCard';

vi.mock('@/components/ChatView/RichContent', () => ({
  RichContentRenderer: (props: { openOnClick?: boolean }) => (
    <button type="button" data-testid="result-preview" data-open-on-click={props.openOnClick}>
      preview
    </button>
  ),
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
  it('renders result previews without path-backed transfer actions', () => {
    render(
      <TaskCard
        task={createCompletedImageTask()}
        onViewResult={vi.fn()}
        plugins={{ canvas: true, cut: true, sketch: true, model: false }}
      />,
    );

    fireEvent.click(screen.getByText('tasks.imageGeneration'));

    expect(screen.getByTestId('result-preview')).toBeTruthy();
    expect(screen.getByTestId('result-preview').getAttribute('data-open-on-click')).toBe('false');
    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Timeline/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sketch/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Explorer|Folder/ })).toBeNull();
    expect(screen.queryByText('tasks.revealInExplorer')).toBeNull();
    expect(screen.queryByText(/frame\.png/)).toBeNull();
  });

  it('does not open the result when clicking the inline preview', () => {
    const onViewResult = vi.fn();

    render(<TaskCard task={createCompletedImageTask()} onViewResult={onViewResult} />);

    fireEvent.click(screen.getByText('tasks.imageGeneration'));
    fireEvent.click(screen.getByTestId('result-preview'));

    expect(onViewResult).not.toHaveBeenCalled();
  });

  it('opens the result only from the explicit view button', () => {
    const onViewResult = vi.fn();

    render(<TaskCard task={createCompletedImageTask()} onViewResult={onViewResult} />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(onViewResult).toHaveBeenCalledWith('task-1');
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
      width: 1024,
      height: 1024,
    },
  };
}
