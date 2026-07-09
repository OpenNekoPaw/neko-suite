import { useEffect, type ReactElement } from 'react';
import { AudioEditor } from './editor/AudioEditor';
import { setLocale } from './i18n';
import type { SupportedLocale } from '@neko/shared';
import './i18n';

export interface AudioWebviewRootProps {
  readonly locale?: SupportedLocale;
}

export function AudioWebviewRoot({ locale }: AudioWebviewRootProps): ReactElement {
  useEffect(() => {
    if (locale) {
      setLocale(locale);
    }
  }, [locale]);

  return <AudioEditor />;
}
