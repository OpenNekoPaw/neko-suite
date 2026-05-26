import { RightPanelIcon, RightPanelOffIcon } from '@neko/ui/icons';
import {
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
  VerticalToolbar,
} from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';

export interface CutSideToolbarProps {
  readonly propertyPanelVisible: boolean;
  readonly onTogglePropertyPanel: () => void;
}

export function CutSideToolbar({
  propertyPanelVisible,
  onTogglePropertyPanel,
}: CutSideToolbarProps) {
  const { t } = useTranslation();

  return (
    <VerticalToolbar className="cut-left-toolbar" width={48}>
      <ToolbarSpacer />
      <ToolbarSeparator />
      <ToolbarButton
        aria-controls="cut-property-panel"
        aria-expanded={propertyPanelVisible}
        data-cut-toolbar-action="toggle-property-panel"
        icon={propertyPanelVisible ? <RightPanelIcon size={18} /> : <RightPanelOffIcon size={18} />}
        title={
          propertyPanelVisible ? t('preview.hidePropertyPanel') : t('preview.showPropertyPanel')
        }
        active={propertyPanelVisible}
        onClick={onTogglePropertyPanel}
      />
    </VerticalToolbar>
  );
}
