import type { AvatarType } from '../types/tracking';
import { t } from '../i18n';
import { PuppetViewer } from '../components/PuppetViewer';
import { Viewport3D } from '../components/Viewport3D';

export interface LiveLocalFallbackSurfaceProps {
  readonly avatarType?: AvatarType;
}

export function LiveLocalFallbackSurface({ avatarType }: LiveLocalFallbackSurfaceProps) {
  return (
    <div
      className="live-local-fallback-surface"
      data-authority="local-fallback"
      data-non-authoritative-preview="live-local-renderer-fallback"
    >
      {avatarType === 'puppet' ? <PuppetViewer /> : <Viewport3D />}
      <div className="live-local-fallback-diagnostics">{t('diagnostics.localFallback')}</div>
    </div>
  );
}
