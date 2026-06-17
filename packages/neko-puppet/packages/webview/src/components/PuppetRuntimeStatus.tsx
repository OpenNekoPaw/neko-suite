import type React from 'react';
import type { PuppetDocumentContext } from '../types';
import { useTranslation } from '../i18n/I18nContext';

interface PuppetRuntimeStatusProps {
  readonly context: PuppetDocumentContext | null;
}

export function PuppetRuntimeStatus({
  context,
}: PuppetRuntimeStatusProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!context) return null;

  const adapterId = context.runtimeAdapter?.id ?? 'live2d-moc3-compat';
  return (
    <section
      className="sketch-panel"
      data-puppet-document-owner={context.owner}
      data-puppet-document-kind={context.documentKind}
      data-puppet-profile={context.profile}
      data-puppet-runtime-adapter={adapterId}
    >
      <h3 className="sketch-panel-title m-0 mb-1">{t('puppet.panel.runtime')}</h3>
      <dl className="puppet-runtime-status">
        <div>
          <dt>{t('puppet.runtime.profile')}</dt>
          <dd>
            {context.profile === 'neko-puppet'
              ? t('puppet.runtime.profile.native')
              : t('puppet.runtime.profile.live2d')}
          </dd>
        </div>
        <div>
          <dt>{t('puppet.runtime.adapter')}</dt>
          <dd>{adapterId}</dd>
        </div>
      </dl>
    </section>
  );
}
