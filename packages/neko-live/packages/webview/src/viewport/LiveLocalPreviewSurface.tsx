import type { AvatarType } from '../types/tracking';
import { t } from '../i18n';
import { PuppetViewer } from '../components/PuppetViewer';
import { Viewport3D } from '../components/Viewport3D';

export interface LiveLocalPreviewSurfaceProps {
  readonly avatarType?: AvatarType;
}

export function LiveLocalPreviewSurface({ avatarType }: LiveLocalPreviewSurfaceProps) {
  return (
    <div
      className="live-local-preview-surface"
      data-authority="local-preview"
      data-non-authoritative-preview="live-local-renderer-preview"
    >
      {avatarType === 'puppet' ? <PuppetViewer /> : <Viewport3D />}
      <div className="live-local-preview-diagnostics">{t('diagnostics.localPreview')}</div>
    </div>
  );
}
