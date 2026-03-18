/**
 * EmptyProject - Placeholder UI for .nka projects without an audio source.
 *
 * Renders a centered call-to-action prompting the user to import an audio file.
 * Sends 'project:importSource' to the extension host on click.
 */

import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

export function EmptyProject() {
  const handleImport = () => {
    postMessage({ type: 'project:importSource' });
  };

  return (
    <div className="audio-editor__empty">
      <div className="audio-editor__empty-icon">&#9835;</div>
      <div className="audio-editor__empty-text">{t('audio.import.empty')}</div>
      <button className="btn" onClick={handleImport}>
        {t('audio.import.button')}
      </button>
    </div>
  );
}
