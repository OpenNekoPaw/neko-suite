import type { ReactNode } from 'react';
import type { PropertyDefinition, PropertyValue } from './property-types';

export type PropertyPreviewChangeHandler = (id: string, value: PropertyValue) => void;
export type PropertyCommitHandler = (id: string, value: PropertyValue) => void;
export type PropertyResetHandler = (id: string) => void;
export type PropertyKeyframeToggleHandler = (id: string) => void;

export interface PropertyPanelProps {
  readonly properties: readonly PropertyDefinition[];
  readonly groups?: readonly PropertyGroupDefinition[];
  readonly emptyState?: ReactNode;
  readonly renderRow?: PropertyRowRenderer;
  readonly onPreviewChange?: PropertyPreviewChangeHandler;
  readonly onCommit?: PropertyCommitHandler;
  readonly onReset?: PropertyResetHandler;
  readonly onToggleKeyframe?: PropertyKeyframeToggleHandler;
}

export interface PropertyGroupDefinition {
  readonly id: string;
  readonly label: string;
  readonly propertyIds: readonly string[];
  readonly collapsed?: boolean;
}

export interface PropertyRowProps {
  readonly property: PropertyDefinition;
  readonly onPreviewChange?: PropertyPreviewChangeHandler;
  readonly onCommit?: PropertyCommitHandler;
  readonly onReset?: PropertyResetHandler;
  readonly onToggleKeyframe?: PropertyKeyframeToggleHandler;
}

export type PropertyRowRenderer = (props: PropertyRowProps) => ReactNode;
