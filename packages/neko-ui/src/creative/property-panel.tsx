import type React from 'react';
import type { ReactNode } from 'react';
import { getKeyboardBoundaryMetadata } from '../keyboard';
import { Button, Select, TooltipProvider } from '../primitives';
import { cn } from '../utils';
import { ColorPicker } from './color-picker';
import { KeyframeButton } from './keyframe-button';
import type {
  PropertyGroupDefinition,
  PropertyPanelProps,
  PropertyRowProps,
} from './property-panel-types';
import { assertNever } from './property-types';
import type { PropertyDefinition } from './property-types';
import { NumberInput } from './number-input';
import { NumberSlider } from './number-slider';

export function PropertyPanel({
  emptyState,
  groups,
  onCommit,
  onPreviewChange,
  onReset,
  onToggleKeyframe,
  properties,
  renderRow,
}: PropertyPanelProps): React.ReactElement {
  if (properties.length === 0) {
    return (
      <div className="rounded-[var(--neko-radius-sm,6px)] border border-dashed border-[var(--neko-border)] p-3 text-xs text-[var(--vscode-descriptionForeground)]">
        {emptyState ?? 'No editable properties'}
      </div>
    );
  }

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const rowProps = { onCommit, onPreviewChange, onReset, onToggleKeyframe };

  if (groups && groups.length > 0) {
    return (
      <TooltipProvider>
        <div className="grid gap-3">
          {groups.map((group) => (
            <PropertyGroup key={group.id} group={group}>
              {group.propertyIds
                .map((propertyId) => propertyById.get(propertyId))
                .filter((property): property is PropertyDefinition => property !== undefined)
                .map((property) =>
                  renderPropertyRow({
                    property,
                    renderRow,
                    rowProps,
                  }),
                )}
            </PropertyGroup>
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid gap-1.5">
        {properties.map((property) =>
          renderPropertyRow({
            property,
            renderRow,
            rowProps,
          }),
        )}
      </div>
    </TooltipProvider>
  );
}

export interface PropertyGroupProps {
  readonly group: PropertyGroupDefinition;
  readonly children: ReactNode;
}

export function PropertyGroup({ children, group }: PropertyGroupProps): React.ReactElement {
  return (
    <section
      aria-label={group.label}
      className="grid gap-1.5 border-t border-[var(--neko-border)] pt-2 first:border-t-0 first:pt-0"
    >
      <h3 className="px-1 text-[11px] font-semibold uppercase text-[var(--vscode-descriptionForeground)]">
        {group.label}
      </h3>
      {group.collapsed ? null : <div className="grid gap-1.5">{children}</div>}
    </section>
  );
}

export function PropertyRow({
  onCommit,
  onPreviewChange,
  onReset,
  onToggleKeyframe,
  property,
}: PropertyRowProps): React.ReactElement {
  return (
    <div
      className={cn(
        'grid min-h-8 grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.4fr)_auto] items-center gap-2',
        'rounded-[var(--neko-radius-sm,6px)] px-1 py-1 text-xs',
        'hover:bg-[var(--neko-hover)]',
        property.disabled ? 'opacity-60' : null,
      )}
      data-property-id={property.id}
    >
      <span className="min-w-0 truncate text-[var(--vscode-descriptionForeground)]">
        {property.label}
      </span>
      <div className="min-w-0">{renderPropertyControl(property, onPreviewChange, onCommit)}</div>
      <div className="flex items-center justify-end gap-1">
        {onReset ? (
          <Button
            disabled={property.disabled}
            onClick={() => onReset(property.id)}
            size="xs"
            variant="ghost"
          >
            Reset
          </Button>
        ) : null}
        {property.animatable ? (
          <KeyframeButton
            animatable={property.animatable}
            disabled={property.disabled}
            hasKeyframes={property.hasKeyframes}
            isAtKeyframe={property.isAtKeyframe}
            onToggleKeyframe={onToggleKeyframe}
            propertyId={property.id}
          />
        ) : null}
      </div>
    </div>
  );
}

function renderPropertyRow({
  property,
  renderRow,
  rowProps,
}: {
  readonly property: PropertyDefinition;
  readonly renderRow?: PropertyPanelProps['renderRow'];
  readonly rowProps: Omit<PropertyRowProps, 'property'>;
}): ReactNode {
  const props = { ...rowProps, property };
  return <div key={property.id}>{renderRow ? renderRow(props) : <PropertyRow {...props} />}</div>;
}

function renderPropertyControl(
  property: PropertyDefinition,
  onPreviewChange: PropertyRowProps['onPreviewChange'],
  onCommit: PropertyRowProps['onCommit'],
): ReactNode {
  switch (property.kind) {
    case 'number':
      return (
        <NumberInput
          disabled={property.disabled}
          id={property.id}
          max={property.max}
          min={property.min}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          step={property.step}
          unit={property.unit}
          value={property.value}
        />
      );
    case 'slider':
      return (
        <NumberSlider
          disabled={property.disabled}
          id={property.id}
          max={property.max}
          min={property.min}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          step={property.step}
          unit={property.unit}
          value={property.value}
        />
      );
    case 'text':
      return (
        <input
          aria-label={property.label}
          className={cn(
            'h-7 w-full rounded-[var(--neko-radius-sm,6px)] border border-[var(--neko-border)]',
            'bg-[var(--vscode-input-background)] px-2 text-xs text-[var(--vscode-input-foreground)]',
            'outline-none focus-visible:border-[var(--vscode-focusBorder)] disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={property.disabled}
          {...getKeyboardBoundaryMetadata({
            scope: 'text-input',
            ownerId: `property-text:${property.id}`,
            ownedKeys: ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          })}
          onBlur={(event) => onCommit?.(property.id, event.currentTarget.value)}
          onChange={(event) => onPreviewChange?.(property.id, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onCommit?.(property.id, event.currentTarget.value);
            }
          }}
          type="text"
          value={property.value}
        />
      );
    case 'color':
      return (
        <ColorPicker
          alpha={property.alpha}
          disabled={property.disabled}
          id={property.id}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          value={property.value}
        />
      );
    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2 text-xs text-[var(--vscode-foreground)]">
          <input
            aria-label={property.label}
            checked={property.value}
            className="h-4 w-4 accent-[var(--neko-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={property.disabled}
            onChange={(event) => {
              onPreviewChange?.(property.id, event.currentTarget.checked);
              onCommit?.(property.id, event.currentTarget.checked);
            }}
            type="checkbox"
          />
          <span>{property.value ? 'On' : 'Off'}</span>
        </label>
      );
    case 'select':
      return (
        <Select
          disabled={property.disabled}
          label={property.label}
          onValueChange={(value) => {
            onPreviewChange?.(property.id, value);
            onCommit?.(property.id, value);
          }}
          options={property.options}
          value={property.value}
        />
      );
    default:
      return assertNever(property);
  }
}
