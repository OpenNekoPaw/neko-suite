import '@testing-library/jest-dom/vitest';

// Mock acquireVsCodeApi before any module imports it
const mockPostMessage = vi.fn();

(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: () => null,
  setState: vi.fn(),
});

export { mockPostMessage };
