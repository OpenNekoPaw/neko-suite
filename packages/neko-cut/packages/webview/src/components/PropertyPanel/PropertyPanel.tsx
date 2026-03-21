/**
 * PropertyPanel Component
 * 属性面板组件 - 显示和编辑选中元素的属性
 */

import { memo, useCallback, useMemo } from 'react';
import { CollapsibleSection } from '@neko/shared/components';
import { PropertyRow, type PropertyDefinition } from './PropertyRow';
import { NormalizeLoudnessButton } from './NormalizeLoudnessButton';
import { AIActionsButton } from './AIActionsButton';
import { SpeedControl } from '../SpeedControl';
import { TransitionPicker } from '../TransitionPicker';
import { ColorCorrectionPanel } from '../ColorCorrection';
import { EffectsPanel } from '../Effects';
import { MaskPanel } from '../Mask';
import { useTranslation } from '../../i18n/I18nContext';
import type {
  TimelineElement,
  AnimatableProperty,
  EasingType,
  SpeedProperties,
  Transition,
  ColorCorrection,
  EffectInstance,
  ProjectDefaults,
  MaskInstance,
} from '../../types';
import { getKeyframeAtTime, hasKeyframes } from '../../utils/animation';
import { createAnimatableProperty, createDefaultElementTransform } from '../../types/animation';
import { hasMediaSource } from '../../types/capabilities';
import { mergeColorCorrectionEffect } from '../../utils/composite-helpers';
import { BLEND_MODE_DEFINITIONS, BLEND_MODE_CATEGORY_I18N_KEYS } from '../../types/blendModes';
import type { BlendModeCategory } from '../../types/blendModes';

// =============================================================================
// Property Definitions
// =============================================================================

const TRANSFORM_PROPERTIES: PropertyDefinition[] = [
  {
    key: 'x',
    labelKey: 'propertyPanel.transform.x',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'y',
    labelKey: 'propertyPanel.transform.y',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'scaleX',
    labelKey: 'propertyPanel.transform.scaleX',
    type: 'slider',
    animatable: true,
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    key: 'scaleY',
    labelKey: 'propertyPanel.transform.scaleY',
    type: 'slider',
    animatable: true,
    min: 0.1,
    max: 3,
    step: 0.01,
  },
  {
    key: 'rotation',
    labelKey: 'propertyPanel.transform.rotation',
    type: 'number',
    animatable: true,
    min: -360,
    max: 360,
    step: 1,
    unit: '°',
  },
  {
    key: 'opacity',
    labelKey: 'propertyPanel.transform.opacity',
    type: 'slider',
    animatable: true,
    min: 0,
    max: 1,
    step: 0.01,
  },
];

const TEXT_PROPERTIES: PropertyDefinition[] = [
  { key: 'content', labelKey: 'propertyPanel.text.content', type: 'string', animatable: false },
  {
    key: 'fontSize',
    labelKey: 'propertyPanel.text.fontSize',
    type: 'number',
    animatable: false,
    min: 8,
    max: 200,
    step: 1,
    unit: 'px',
  },
  {
    key: 'fontFamily',
    labelKey: 'propertyPanel.text.fontFamily',
    type: 'string',
    animatable: false,
  },
  { key: 'color', labelKey: 'propertyPanel.text.color', type: 'color', animatable: false },
  {
    key: 'backgroundColor',
    labelKey: 'propertyPanel.text.backgroundColor',
    type: 'color',
    animatable: false,
  },
  {
    key: 'textAlign',
    labelKey: 'propertyPanel.text.textAlign',
    type: 'select',
    animatable: false,
    options: [
      { value: 'left', labelKey: 'propertyPanel.text.alignLeft' },
      { value: 'center', labelKey: 'propertyPanel.text.alignCenter' },
      { value: 'right', labelKey: 'propertyPanel.text.alignRight' },
    ],
  },
  {
    key: 'fontWeight',
    labelKey: 'propertyPanel.text.fontWeight',
    type: 'select',
    animatable: false,
    options: [
      { value: 'normal', labelKey: 'propertyPanel.text.weightNormal' },
      { value: 'bold', labelKey: 'propertyPanel.text.weightBold' },
    ],
  },
  {
    key: 'fontStyle',
    labelKey: 'propertyPanel.text.fontStyle',
    type: 'select',
    animatable: false,
    options: [
      { value: 'normal', labelKey: 'propertyPanel.text.styleNormal' },
      { value: 'italic', labelKey: 'propertyPanel.text.styleItalic' },
    ],
  },
  {
    key: 'textDecoration',
    labelKey: 'propertyPanel.text.textDecoration',
    type: 'select',
    animatable: false,
    options: [
      { value: 'none', labelKey: 'propertyPanel.text.decorationNone' },
      { value: 'underline', labelKey: 'propertyPanel.text.decorationUnderline' },
      { value: 'line-through', labelKey: 'propertyPanel.text.decorationLineThrough' },
    ],
  },
];

const AUDIO_PROPERTIES: PropertyDefinition[] = [
  {
    key: 'volume',
    labelKey: 'propertyPanel.audio.volume',
    type: 'slider',
    animatable: false,
    min: 0,
    max: 2,
    step: 0.01,
  },
  {
    key: 'pan',
    labelKey: 'propertyPanel.audio.pan',
    type: 'slider',
    animatable: false,
    min: -1,
    max: 1,
    step: 0.01,
  },
  { key: 'muted', labelKey: 'propertyPanel.audio.muted', type: 'boolean', animatable: false },
  {
    key: 'fadeIn',
    labelKey: 'propertyPanel.audio.fadeIn',
    type: 'number',
    animatable: false,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
  {
    key: 'fadeOut',
    labelKey: 'propertyPanel.audio.fadeOut',
    type: 'number',
    animatable: false,
    min: 0,
    max: 10,
    step: 0.1,
    unit: 's',
  },
  {
    key: 'gain',
    labelKey: 'propertyPanel.audio.gain',
    type: 'slider',
    animatable: false,
    min: -20,
    max: 20,
    step: 0.5,
    unit: 'dB',
  },
];

const BASIC_PROPERTIES: PropertyDefinition[] = [
  { key: 'name', labelKey: 'propertyPanel.basic.name', type: 'string', animatable: false },
  {
    key: 'startTime',
    labelKey: 'propertyPanel.basic.startTime',
    type: 'number',
    animatable: false,
    min: 0,
    step: 0.01,
    unit: 's',
  },
  {
    key: 'duration',
    labelKey: 'propertyPanel.basic.duration',
    type: 'number',
    animatable: false,
    min: 0.1,
    step: 0.01,
    unit: 's',
  },
];

// =============================================================================
// Helper Functions
// =============================================================================

// =============================================================================
// Property Group Component
// =============================================================================

interface PropertyGroupProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  disabled?: boolean;
}

const PropertyGroup = memo(function PropertyGroup({
  titleKey,
  children,
  defaultExpanded = true,
  disabled = false,
}: PropertyGroupProps) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection
      title={t(titleKey)}
      defaultExpanded={defaultExpanded}
      disabled={disabled}
    >
      {/* Preserve horizontal padding matching the original .nk-prop-group-body */}
      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {children}
      </div>
    </CollapsibleSection>
  );
});

// =============================================================================
// Main PropertyPanel Component
// =============================================================================

interface PropertyPanelProps {
  element: TimelineElement | null;
  projectDefaults: ProjectDefaults | null;
  currentTime: number;
  /** Real-time preview update (raw set, no undo history) */
  onElementChange: (elementId: string, changes: Partial<TimelineElement>) => void;
  /** Finalized commit (pushed to undo history). Called on slider release / input blur. */
  onElementCommit?: (elementId: string, changes: Partial<TimelineElement>) => void;
  onDefaultsChange: (changes: Partial<ProjectDefaults>) => void;
  onAddKeyframe: (
    elementId: string,
    propertyPath: string,
    value: number,
    easing?: EasingType,
  ) => void;
  onRemoveKeyframe: (elementId: string, propertyPath: string) => void;
  onExecuteAIAction?: (actionId: string, elementIds: string[]) => void;
}

export const PropertyPanel = memo(function PropertyPanel({
  element,
  projectDefaults,
  currentTime,
  onElementChange,
  onElementCommit,
  onDefaultsChange,
  onAddKeyframe,
  onRemoveKeyframe,
  onExecuteAIAction,
}: PropertyPanelProps) {
  const { t } = useTranslation();

  // Determine if we're editing defaults or an element
  const isEditingDefaults = !element;

  // Get the data source (element or defaults)
  const dataSource = element || projectDefaults;

  // Calculate local time for the element
  const localTime = useMemo(() => {
    if (!element) return 0;
    return currentTime - element.startTime + element.trimStart;
  }, [element, currentTime]);

  // Get property value (considering keyframes for animatable properties)
  const getPropertyValue = useCallback(
    (
      propertyPath: string,
      definition: PropertyDefinition,
    ): number | string | boolean | undefined => {
      if (!dataSource) return undefined;

      // Element-specific properties - return default values when no element selected
      if (!element) {
        if (propertyPath === 'name') return '';
        if (propertyPath === 'startTime') return 0;
        if (propertyPath === 'duration') return 0;
      }

      // Special handling for duration - show effective duration instead of source duration
      if (propertyPath === 'duration' && element) {
        const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
        return Math.max(0.1, effectiveDuration);
      }

      // Handle nested paths (e.g., 'animTransform.x', 'audio.volume')
      const parts = propertyPath.split('.');
      let current: unknown = dataSource;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          // Special handling for animTransform - return default values if not initialized
          if (parts[0] === 'animTransform' && definition.animatable) {
            const defaultTransform = createDefaultElementTransform();
            const subKey = parts[1];
            if (subKey && subKey in defaultTransform) {
              const animProp = defaultTransform[subKey as keyof typeof defaultTransform];
              if (typeof animProp === 'object' && 'baseValue' in animProp) {
                return animProp.baseValue;
              }
            }
          }
          return undefined;
        }
      }

      // For animatable properties, check if it's an AnimatableProperty object
      if (
        definition.animatable &&
        current &&
        typeof current === 'object' &&
        'baseValue' in current
      ) {
        const animProp = current as AnimatableProperty;
        // Return base value for now (animation interpolation handled elsewhere)
        return animProp.baseValue;
      }

      return current as number | string | boolean;
    },
    [dataSource, element],
  );

  // Check if a property has keyframes
  const propertyHasKeyframes = useCallback(
    (propertyPath: string): boolean => {
      if (!element) return false;

      const parts = propertyPath.split('.');
      let current: unknown = element;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return false;
        }
      }

      if (current && typeof current === 'object' && 'keyframes' in current) {
        return hasKeyframes(current as AnimatableProperty);
      }

      return false;
    },
    [element],
  );

  // Check if at a keyframe
  const isAtKeyframe = useCallback(
    (propertyPath: string): boolean => {
      if (!element) return false;

      const parts = propertyPath.split('.');
      let current: unknown = element;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return false;
        }
      }

      if (current && typeof current === 'object' && 'keyframes' in current) {
        return getKeyframeAtTime(current as AnimatableProperty, localTime) !== undefined;
      }

      return false;
    },
    [element, localTime],
  );

  // Handle property value change
  const handlePropertyChange = useCallback(
    (propertyPath: string, value: number | string | boolean, definition: PropertyDefinition) => {
      if (!dataSource) return;

      // Route to appropriate handler
      if (isEditingDefaults) {
        // Editing global defaults
        const parts = propertyPath.split('.');
        if (parts.length === 1) {
          // Direct property (shouldn't happen for defaults)
          return;
        } else {
          // Nested property (e.g., 'text.fontSize', 'transform.x')
          const rootKey = parts[0] as keyof ProjectDefaults;
          const subKey = parts[1];

          onDefaultsChange({
            [rootKey]: {
              ...(projectDefaults?.[rootKey] as object),
              [subKey]: value,
            },
          } as Partial<ProjectDefaults>);
        }
      } else {
        // Editing element
        if (!element) return;

        // Special handling for duration - convert effective duration change to actual duration change
        if (propertyPath === 'duration' && typeof value === 'number') {
          const newEffectiveDuration = Math.max(0.1, value);
          // New duration = newEffectiveDuration + trimStart + trimEnd
          const newDuration = newEffectiveDuration + element.trimStart + element.trimEnd;
          onElementChange(element.id, { duration: newDuration } as Partial<TimelineElement>);
          return;
        }

        const parts = propertyPath.split('.');

        if (parts.length === 1) {
          // Direct property
          onElementChange(element.id, { [propertyPath]: value } as Partial<TimelineElement>);
        } else {
          // Nested property - reconstruct the object
          const rootKey = parts[0] as keyof TimelineElement;
          const subKey = parts[1];
          let existingValue = element[rootKey];

          // Special handling for animTransform - initialize if it doesn't exist
          if (rootKey === 'animTransform' && !existingValue) {
            existingValue = createDefaultElementTransform();
          }

          if (definition.animatable && typeof value === 'number') {
            // For animatable properties, update the baseValue
            const existingObj = existingValue as Record<string, unknown> | undefined;
            const animProp = existingObj?.[subKey] as AnimatableProperty | undefined;
            const newAnimProp: AnimatableProperty = animProp
              ? { ...animProp, baseValue: value }
              : createAnimatableProperty(value);

            onElementChange(element.id, {
              [rootKey]: {
                ...(existingValue as object),
                [subKey]: newAnimProp,
              },
            } as Partial<TimelineElement>);
          } else {
            onElementChange(element.id, {
              [rootKey]: {
                ...(existingValue as object),
                [subKey]: value,
              },
            } as Partial<TimelineElement>);
          }
        }
      }
    },
    [dataSource, isEditingDefaults, element, projectDefaults, onDefaultsChange, onElementChange],
  );

  // Handle property commit (finalized value → undo history)
  // Mirrors handlePropertyChange logic but routes to onElementCommit
  const handlePropertyCommit = useCallback(
    (propertyPath: string, value: number | string | boolean, definition: PropertyDefinition) => {
      if (!element || isEditingDefaults || !onElementCommit) return;

      // Special handling for duration
      if (propertyPath === 'duration' && typeof value === 'number') {
        const newEffectiveDuration = Math.max(0.1, value);
        const newDuration = newEffectiveDuration + element.trimStart + element.trimEnd;
        onElementCommit(element.id, { duration: newDuration } as Partial<TimelineElement>);
        return;
      }

      const parts = propertyPath.split('.');

      if (parts.length === 1) {
        onElementCommit(element.id, { [propertyPath]: value } as Partial<TimelineElement>);
      } else {
        const rootKey = parts[0] as keyof TimelineElement;
        const subKey = parts[1];
        let existingValue = element[rootKey];

        if (rootKey === 'animTransform' && !existingValue) {
          existingValue = createDefaultElementTransform();
        }

        if (definition.animatable && typeof value === 'number') {
          const existingObj = existingValue as Record<string, unknown> | undefined;
          const animProp = existingObj?.[subKey] as AnimatableProperty | undefined;
          const newAnimProp: AnimatableProperty = animProp
            ? { ...animProp, baseValue: value }
            : createAnimatableProperty(value);

          onElementCommit(element.id, {
            [rootKey]: {
              ...(existingValue as object),
              [subKey]: newAnimProp,
            },
          } as Partial<TimelineElement>);
        } else {
          onElementCommit(element.id, {
            [rootKey]: {
              ...(existingValue as object),
              [subKey]: value,
            },
          } as Partial<TimelineElement>);
        }
      }
    },
    [element, isEditingDefaults, onElementCommit],
  );

  // Handle add keyframe
  const handleAddKeyframe = useCallback(
    (propertyPath: string, definition: PropertyDefinition) => {
      if (!element) return;

      const value = getPropertyValue(propertyPath, definition);
      if (typeof value === 'number') {
        onAddKeyframe(element.id, propertyPath, value);
      }
    },
    [element, getPropertyValue, onAddKeyframe],
  );

  // Handle speed change
  const handleSpeedChange = useCallback(
    (speed: SpeedProperties) => {
      if (!element) return;
      onElementChange(element.id, { speed } as Partial<TimelineElement>);
      onElementCommit?.(element.id, { speed } as Partial<TimelineElement>);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle in-transition change
  const handleInTransitionChange = useCallback(
    (transition: Transition | null) => {
      if (!element) return;
      const changes = { inTransition: transition ?? undefined } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle out-transition change
  const handleOutTransitionChange = useCallback(
    (transition: Transition | null) => {
      if (!element) return;
      const changes = { outTransition: transition ?? undefined } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle remove keyframe
  const handleRemoveKeyframe = useCallback(
    (propertyPath: string) => {
      if (!element) return;
      onRemoveKeyframe(element.id, propertyPath);
    },
    [element, onRemoveKeyframe],
  );

  // Handle color correction change — also sync to element.effects for engine rendering
  const handleColorCorrectionChange = useCallback(
    (colorCorrection: ColorCorrection) => {
      if (!element) return;
      // Merge color correction as a synthetic effect in element.effects
      // so it flows through the element.update → engine streaming path
      const currentEffects = element.effects ?? [];
      const mergedEffects = mergeColorCorrectionEffect(currentEffects, colorCorrection);
      const changes = { colorCorrection, effects: mergedEffects } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle effects change
  const handleEffectsChange = useCallback(
    (effects: EffectInstance[]) => {
      if (!element) return;
      const changes = { effects } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  const handleMasksChange = useCallback(
    (masks: MaskInstance[]) => {
      if (!element) return;
      const changes = { masks } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle blend mode change (discrete value, commit immediately)
  const handleBlendModeChange = useCallback(
    (blendMode: string) => {
      if (!element) return;
      const changes = { blendMode } as Partial<TimelineElement>;
      onElementChange(element.id, changes);
      onElementCommit?.(element.id, changes);
    },
    [element, onElementChange, onElementCommit],
  );

  // Handle loudness normalization - apply recommended gain
  const handleApplyNormalizedGain = useCallback(
    (gain: number) => {
      if (!element) return;
      const gainDef = AUDIO_PROPERTIES.find((d) => d.key === 'gain');
      if (gainDef) {
        handlePropertyChange('audio.gain', gain, gainDef);
      }
    },
    [element, handlePropertyChange],
  );

  // Render property rows for a group
  const renderPropertyRows = useCallback(
    (properties: PropertyDefinition[], pathPrefix: string = '') => {
      return properties.map((def) => {
        const fullPath = pathPrefix ? `${pathPrefix}.${def.key}` : def.key;
        const value = getPropertyValue(fullPath, def);

        return (
          <PropertyRow
            key={fullPath}
            definition={def}
            value={value}
            hasKeyframes={propertyHasKeyframes(fullPath)}
            isAtKeyframe={isAtKeyframe(fullPath)}
            onChange={(val) => handlePropertyChange(fullPath, val, def)}
            onCommit={(val) => handlePropertyCommit(fullPath, val, def)}
            onAddKeyframe={() => handleAddKeyframe(fullPath, def)}
            onRemoveKeyframe={() => handleRemoveKeyframe(fullPath)}
            disabled={!element}
          />
        );
      });
    },
    [
      element,
      dataSource,
      getPropertyValue,
      propertyHasKeyframes,
      isAtKeyframe,
      handlePropertyChange,
      handlePropertyCommit,
      handleAddKeyframe,
      handleRemoveKeyframe,
      isEditingDefaults,
    ],
  );

  // Determine if property editing is disabled
  const isDisabled = !element;

  return (
    <div className="nk-prop-panel">
      {/* AI Actions Button - show when element is selected */}
      {element && onExecuteAIAction && (
        <div className="px-2 py-2 border-b border-[var(--nk-border)]">
          <AIActionsButton element={element} onExecuteAction={onExecuteAIAction} />
        </div>
      )}

      {/* Basic Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.basic"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderPropertyRows(BASIC_PROPERTIES)}
      </PropertyGroup>

      {/* Transform Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.transform"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderPropertyRows(TRANSFORM_PROPERTIES, 'animTransform')}
        {/* Blend Mode selector */}
        <div className="nk-prop-row">
          <label className="nk-prop-label">{t('blendMode.title')}</label>
          <select
            className="nk-prop-input"
            value={element?.blendMode ?? 'normal'}
            onChange={(e) => handleBlendModeChange(e.target.value)}
            disabled={isDisabled}
          >
            {(
              [
                'normal',
                'darken',
                'lighten',
                'contrast',
                'inversion',
                'component',
              ] as BlendModeCategory[]
            ).map((cat) => (
              <optgroup key={cat} label={t(BLEND_MODE_CATEGORY_I18N_KEYS[cat])}>
                {BLEND_MODE_DEFINITIONS.filter((d) => d.category === cat).map((d) => (
                  <option key={d.mode} value={d.mode}>
                    {t(d.nameKey)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </PropertyGroup>

      {/* Text Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.text"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderPropertyRows(TEXT_PROPERTIES, 'text')}
      </PropertyGroup>

      {/* Audio Properties - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.audio"
        disabled={isDisabled}
        defaultExpanded={!isDisabled}
      >
        {renderPropertyRows(AUDIO_PROPERTIES, 'audio')}
        {element && hasMediaSource(element) && (
          <NormalizeLoudnessButton
            source={element.src}
            onApplyGain={handleApplyNormalizedGain}
            disabled={isDisabled}
          />
        )}
      </PropertyGroup>

      {/* Speed Control - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.speed"
        defaultExpanded={false}
        disabled={isDisabled}
      >
        <SpeedControl
          speed={element?.speed}
          originalDuration={element?.duration ?? 0}
          onChange={handleSpeedChange}
          disabled={isDisabled}
        />
      </PropertyGroup>

      {/* Entry Transition - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.inTransition"
        defaultExpanded={false}
        disabled={isDisabled}
      >
        <TransitionPicker
          transition={element?.transitionIn ?? null}
          onChange={handleInTransitionChange}
          showDuration={true}
          disabled={isDisabled}
        />
      </PropertyGroup>

      {/* Exit Transition - always show */}
      <PropertyGroup
        titleKey="propertyPanel.group.outTransition"
        defaultExpanded={false}
        disabled={isDisabled}
      >
        <TransitionPicker
          transition={element?.transitionOut ?? null}
          onChange={handleOutTransitionChange}
          showDuration={true}
          disabled={isDisabled}
        />
      </PropertyGroup>

      {/* Color Correction - always show */}
      <PropertyGroup titleKey="colorCorrection.title" defaultExpanded={false} disabled={isDisabled}>
        <ColorCorrectionPanel
          colorCorrection={element?.colorCorrection}
          onChange={handleColorCorrectionChange}
          disabled={isDisabled}
        />
      </PropertyGroup>

      {/* Effects - always show */}
      <PropertyGroup titleKey="effects.title" defaultExpanded={false} disabled={isDisabled}>
        <EffectsPanel
          effects={element?.effects}
          onChange={handleEffectsChange}
          disabled={isDisabled}
        />
      </PropertyGroup>

      {/* Masks - always show */}
      <PropertyGroup titleKey="masks.title" defaultExpanded={false} disabled={isDisabled}>
        <MaskPanel masks={element?.masks} onChange={handleMasksChange} disabled={isDisabled} />
      </PropertyGroup>
    </div>
  );
});

export default PropertyPanel;
