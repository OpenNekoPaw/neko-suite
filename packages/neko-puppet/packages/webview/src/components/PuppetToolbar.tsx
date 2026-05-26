/**
 * PuppetToolbar - left-side editor toolbar.
 *
 * Mirrors the Sketch/Model vertical toolbar structure: primary viewport actions
 * at the top, panel visibility at the bottom after a flexible spacer.
 */
import type React from 'react';
import {
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
  VerticalToolbar,
} from '@neko/ui/primitives';
import { RightPanelIcon, RightPanelOffIcon, UploadIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';

export interface PuppetToolbarProps {
  readonly puppetLoaded: boolean;
  readonly isRightPanelVisible: boolean;
  readonly onionSkinEnabled: boolean;
  readonly onImport: () => void;
  readonly onFitView: () => void;
  readonly onToggleRightPanel: () => void;
  readonly onToggleOnionSkin: () => void;
}

export function PuppetToolbar({
  puppetLoaded,
  isRightPanelVisible,
  onionSkinEnabled,
  onImport,
  onFitView,
  onToggleRightPanel,
  onToggleOnionSkin,
}: PuppetToolbarProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <VerticalToolbar className="puppet-left-toolbar" width={48}>
      <ToolbarButton
        icon={<UploadIcon size={18} />}
        title={t('puppet.toolbar.import')}
        onClick={onImport}
      />
      <ToolbarButton
        icon={<FitViewIcon />}
        title={t('puppet.toolbar.fitView')}
        disabled={!puppetLoaded}
        onClick={onFitView}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<OnionSkinIcon />}
        title={t('puppet.toolbar.onionSkin')}
        active={onionSkinEnabled}
        disabled={!puppetLoaded}
        onClick={onToggleOnionSkin}
      />

      <ToolbarSpacer />
      <ToolbarSeparator />

      <ToolbarButton
        aria-controls="puppet-right-panel"
        aria-expanded={isRightPanelVisible}
        data-puppet-toolbar-action="toggle-right-panel"
        icon={isRightPanelVisible ? <RightPanelIcon size={18} /> : <RightPanelOffIcon size={18} />}
        title={
          isRightPanelVisible
            ? t('puppet.toolbar.hideRightPanel')
            : t('puppet.toolbar.showRightPanel')
        }
        active={isRightPanelVisible}
        onClick={onToggleRightPanel}
      />
    </VerticalToolbar>
  );
}

function FitViewIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6V3h3" />
      <path d="M10 3h3v3" />
      <path d="M13 10v3h-3" />
      <path d="M6 13H3v-3" />
      <path d="M6 6h4v4H6z" />
    </svg>
  );
}

function OnionSkinIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6.5" cy="8" r="4" />
      <circle cx="9.5" cy="8" r="4" strokeDasharray="2 2" />
    </svg>
  );
}
