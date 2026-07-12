import type { ReactElement } from 'react';
import type { SupportedLocale } from '@neko/shared/i18n';
import { render as renderInk } from 'ink-testing-library';
import { AgentTerminalPresentationProvider } from '../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../presentation/testing';

export function renderWithPresentation(node: ReactElement, locale: SupportedLocale = 'en') {
  const presentation = createTestAgentTerminalPresentation(locale);
  const wrap = (child: ReactElement): ReactElement => (
    <AgentTerminalPresentationProvider value={presentation}>
      {child}
    </AgentTerminalPresentationProvider>
  );
  const rendered = renderInk(wrap(node));
  const rerender = rendered.rerender;

  return {
    ...rendered,
    rerender(nextNode: ReactElement): void {
      rerender(wrap(nextNode));
    },
  };
}
