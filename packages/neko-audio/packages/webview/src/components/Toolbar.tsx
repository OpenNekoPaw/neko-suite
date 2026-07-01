/**
 * Toolbar surfaces for the audio editor.
 *
 * The left rail owns global workbench visibility.
 */

import { RightPanelIcon, RightPanelOffIcon } from '@neko/ui/icons';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '@neko/ui/primitives';
import { CreativeLeftRail } from '@neko/ui/workbench';
import { t } from '../i18n';

interface ToolbarProps {
  readonly className?: string;
  readonly sidePanelVisible: boolean;
  readonly onToggleSidePanel: () => void;
}

export function Toolbar({ className, sidePanelVisible, onToggleSidePanel }: ToolbarProps) {
  return (
    <CreativeLeftRail
      className={className ?? 'audio-left-toolbar'}
      width={48}
      label={t('audio.toolbar.leftRail')}
    >
      <ToolbarSpacer />
      <ToolbarSeparator />

      <ToolbarButton
        aria-controls="audio-side-panel"
        aria-expanded={sidePanelVisible}
        data-creative-left-rail-action="toggle-side-panel"
        data-creative-left-rail-kind="visibility-toggle"
        data-creative-left-rail-target="right-panel"
        icon={sidePanelVisible ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />}
        title={sidePanelVisible ? t('audio.sidePanel.hide') : t('audio.sidePanel.show')}
        active={sidePanelVisible}
        onClick={onToggleSidePanel}
      />
    </CreativeLeftRail>
  );
}
