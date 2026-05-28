/**
 * Puppet toolbar surfaces.
 *
 * The left rail owns editor-wide commands, viewport commands, and region visibility.
 */
import type React from 'react';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '@neko/ui/primitives';
import { CreativeLeftRail } from '@neko/ui/workbench';
import { RightPanelIcon, RightPanelOffIcon, UploadIcon } from '@neko/ui/icons';
import { useTranslation } from '../i18n/I18nContext';

export interface PuppetToolbarProps {
  readonly isRightPanelVisible: boolean;
  readonly puppetLoaded: boolean;
  readonly onionSkinEnabled: boolean;
  readonly onImport: () => void;
  readonly onFitView: () => void;
  readonly onToggleOnionSkin: () => void;
  readonly onToggleRightPanel: () => void;
}

export function PuppetToolbar({
  isRightPanelVisible,
  puppetLoaded,
  onionSkinEnabled,
  onImport,
  onFitView,
  onToggleOnionSkin,
  onToggleRightPanel,
}: PuppetToolbarProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <CreativeLeftRail
      className="puppet-left-toolbar"
      width={48}
      label={t('puppet.toolbar.leftRail')}
    >
      <ToolbarButton
        data-creative-left-rail-action="import"
        data-creative-left-rail-kind="common-action"
        icon={<UploadIcon size={18} />}
        title={t('puppet.toolbar.import')}
        onClick={onImport}
      />

      <ToolbarSeparator />

      <ToolbarButton
        data-creative-left-rail-action="fit-view"
        data-creative-left-rail-kind="common-action"
        data-puppet-toolbar-action="fit-view"
        icon={<FitViewIcon />}
        title={t('puppet.toolbar.fitView')}
        disabled={!puppetLoaded}
        onClick={onFitView}
      />
      <ToolbarButton
        data-creative-left-rail-action="toggle-onion-skin"
        data-creative-left-rail-kind="common-action"
        data-puppet-toolbar-action="toggle-onion-skin"
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
        data-creative-left-rail-action="toggle-right-panel"
        data-creative-left-rail-kind="visibility-toggle"
        data-creative-left-rail-target="right-panel"
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
    </CreativeLeftRail>
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
