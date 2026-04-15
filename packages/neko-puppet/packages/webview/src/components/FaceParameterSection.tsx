/**
 * FaceParameterSection — Groups puppet parameters by standard face categories.
 *
 * Matches the puppet's ParameterInfo[] against the PUPPET_FACE_PARAMETERS
 * template by standard parameter name. Matched parameters display in
 * categorized collapsible sections. Unmatched parameters display in "Other".
 */
import { useMemo, useCallback } from 'react';
import { CollapsibleSection } from '@neko/shared/components';
import {
  PUPPET_FACE_PARAMETERS,
  PUPPET_FACE_CATEGORIES,
  PUPPET_FACE_CATEGORY_ORDER,
  type PuppetFaceCategory,
  type PuppetFaceParameter,
} from '@neko/shared';
import type { ParameterInfo } from '../animation/types';
import { useTranslation } from '../i18n/I18nContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface FaceParameterSectionProps {
  parameters: ParameterInfo[];
  onParameterChange: (name: string, value: number) => void;
}

interface MatchedParam {
  /** Standard face parameter definition */
  definition: PuppetFaceParameter;
  /** Live puppet parameter info (with current value) */
  info: ParameterInfo;
}

// ── Matching Logic ───────────────────────────────────────────────────────────

function matchParameters(parameters: ParameterInfo[]): {
  matched: Map<PuppetFaceCategory, MatchedParam[]>;
  unmatched: ParameterInfo[];
} {
  const matched = new Map<PuppetFaceCategory, MatchedParam[]>();
  const matchedNames = new Set<string>();

  // Match puppet parameters against standard template by name
  for (const def of PUPPET_FACE_PARAMETERS) {
    const info = parameters.find((p) => p.name === def.name);
    if (info) {
      const existing = matched.get(def.category) ?? [];
      existing.push({ definition: def, info });
      matched.set(def.category, existing);
      matchedNames.add(info.name);
    }
  }

  // Collect unmatched parameters
  const unmatched = parameters.filter((p) => !matchedNames.has(p.name));

  return { matched, unmatched };
}

// ── Component ────────────────────────────────────────────────────────────────

export function FaceParameterSection({ parameters, onParameterChange }: FaceParameterSectionProps) {
  const { t } = useTranslation();
  const locale = t('puppet.panel.parameters') !== 'puppet.panel.parameters' ? 'zh' : 'en';

  const { matched, unmatched } = useMemo(() => matchParameters(parameters), [parameters]);

  // Only render if at least one standard face parameter is matched
  const hasMatches = matched.size > 0;
  if (!hasMatches) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Matched face parameter categories */}
      {PUPPET_FACE_CATEGORY_ORDER.map((category) => {
        const params = matched.get(category);
        if (!params || params.length === 0) return null;

        const meta = PUPPET_FACE_CATEGORIES[category];
        const label = locale === 'zh' ? meta.zh : meta.en;

        return (
          <CollapsibleSection
            key={category}
            title={`${meta.icon} ${label}`}
            defaultExpanded={category === 'face_shape' || category === 'eyes'}
          >
            <div className="flex flex-col gap-0.5">
              {params.map(({ definition, info }) => (
                <FaceSlider
                  key={definition.id}
                  label={locale === 'zh' ? definition.label_zh : definition.label_en}
                  name={info.name}
                  min={info.min}
                  max={info.max}
                  value={info.current}
                  defaultValue={definition.default}
                  step={definition.step}
                  onChange={onParameterChange}
                />
              ))}
            </div>
          </CollapsibleSection>
        );
      })}

      {/* Unmatched (non-standard) parameters */}
      {unmatched.length > 0 && (
        <CollapsibleSection
          title={locale === 'zh' ? '📋 其他参数' : '📋 Other Parameters'}
          defaultExpanded={false}
        >
          <div className="flex flex-col gap-0.5">
            {unmatched.map((param) => (
              <FaceSlider
                key={param.name}
                label={param.name}
                name={param.name}
                min={param.min}
                max={param.max}
                value={param.current}
                defaultValue={param.default}
                step={0.01}
                onChange={onParameterChange}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ── Internal Slider ──────────────────────────────────────────────────────────

function FaceSlider(props: {
  label: string;
  name: string;
  min: number;
  max: number;
  value: number;
  defaultValue: number;
  step: number;
  onChange: (name: string, value: number) => void;
}) {
  const { label, name, min, max, value, defaultValue, step, onChange } = props;

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(name, parseFloat(e.target.value));
    },
    [name, onChange],
  );

  const handleReset = useCallback(() => {
    onChange(name, defaultValue);
  }, [name, defaultValue, onChange]);

  return (
    <div className="flex flex-col gap-0.5 px-1">
      <div className="flex items-center justify-between">
        <span className="text-xs truncate flex-1" title={name}>
          {label}
        </span>
        <button
          className="text-[10px] opacity-50 hover:opacity-100 px-1"
          onClick={handleReset}
          title="Reset to default"
          aria-label={`Reset ${label}`}
        >
          ↺
        </button>
        <span className="text-[10px] opacity-50 w-8 text-right tabular-nums">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full h-1 accent-[var(--vscode-button-background)]"
        aria-label={label}
        onInput={handleInput}
      />
    </div>
  );
}
