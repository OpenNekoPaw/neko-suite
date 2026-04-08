import '@testing-library/jest-dom/vitest';
import React, { createElement, type ReactElement } from 'react';

// Ensure React is globally available for shared components using classic JSX transform
(globalThis as Record<string, unknown>).React = React;
import { render, type RenderOptions } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nContext';
import { i18nService } from '../i18n';

// Mock acquireVsCodeApi before any module imports it
const mockPostMessage = vi.fn();

(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
  postMessage: mockPostMessage,
  getState: () => null,
  setState: vi.fn(),
});

/** Render with I18nProvider wrapper for components that use useTranslation */
function renderWithI18n(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => createElement(I18nProvider, { service: i18nService }, children),
    ...options,
  });
}

export { mockPostMessage, renderWithI18n };
