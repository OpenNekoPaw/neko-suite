import { RightPanelIcon, RightPanelOffIcon, SettingsIcon } from '@neko/ui/icons';
import { CreativeLeftRail } from '@neko/ui/workbench';
import { useTranslation } from '../i18n/I18nContext';

export interface CutSideToolbarProps {
  readonly mainPanelToolsVisible: boolean;
  readonly propertyPanelVisible: boolean;
  readonly onToggleMainPanelTools: () => void;
  readonly onTogglePropertyPanel: () => void;
}

export function CutSideToolbar({
  mainPanelToolsVisible,
  propertyPanelVisible,
  onToggleMainPanelTools,
  onTogglePropertyPanel,
}: CutSideToolbarProps) {
  const { t } = useTranslation();

  return (
    <CreativeLeftRail
      className="cut-left-toolbar"
      width={48}
      label={t('preview.leftRail')}
      bottomActions={[
        {
          id: 'toggle-main-panel-tools',
          kind: 'visibility-toggle',
          visibilityTarget: 'main-panel',
          label: mainPanelToolsVisible
            ? t('preview.hideMainPanelTools')
            : t('preview.showMainPanelTools'),
          icon: <SettingsIcon size={18} />,
          controls: 'cut-main-panel-tools',
          active: mainPanelToolsVisible,
          expanded: mainPanelToolsVisible,
          onClick: onToggleMainPanelTools,
        },
        {
          id: 'toggle-property-panel',
          kind: 'visibility-toggle',
          visibilityTarget: 'right-panel',
          label: propertyPanelVisible
            ? t('preview.hidePropertyPanel')
            : t('preview.showPropertyPanel'),
          icon: propertyPanelVisible ? (
            <RightPanelIcon size={18} />
          ) : (
            <RightPanelOffIcon size={18} />
          ),
          controls: 'cut-property-panel',
          active: propertyPanelVisible,
          expanded: propertyPanelVisible,
          onClick: onTogglePropertyPanel,
        },
      ]}
    />
  );
}
