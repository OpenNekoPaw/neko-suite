import React, { useState, useCallback } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { useTranslation } from '../../i18n/I18nContext';

type CsgOperation = 'union' | 'difference' | 'intersection';

const OPERATIONS: { value: CsgOperation; labelKey: string; icon: string }[] = [
  { value: 'union', labelKey: 'csg.union', icon: '\u222A' },
  { value: 'difference', labelKey: 'csg.difference', icon: '\u2216' },
  { value: 'intersection', labelKey: 'csg.intersection', icon: '\u2229' },
];

interface CsgPanelProps {
  disabled?: boolean;
  onExecuteCsg: (operation: CsgOperation, operandA: string, operandB: string) => void;
}

/**
 * CSG Boolean Panel - Constructive Solid Geometry operations.
 *
 * Select two mesh operands and apply union/difference/intersection.
 */
export function CsgPanel({ disabled = false, onExecuteCsg }: CsgPanelProps): React.JSX.Element {
  const [operation, setOperation] = useState<CsgOperation>('union');
  const [operandA, setOperandA] = useState<string | null>(null);
  const [operandB, setOperandB] = useState<string | null>(null);
  const [selectingFor, setSelectingFor] = useState<'A' | 'B' | null>(null);

  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const sceneNodes = useModelStore((s) => s.sceneNodes);

  const { t } = useTranslation();

  const getNodeName = useCallback(
    (id: string | null): string => {
      if (!id) return t('csg.none');
      const node = sceneNodes.find((n) => n.nodeId === id);
      return node?.name ?? id;
    },
    [sceneNodes, t],
  );

  const handleSelect = useCallback(
    (target: 'A' | 'B') => {
      if (selectingFor === target) {
        // Confirm selection from current selectedNodeId
        if (selectedNodeId) {
          if (target === 'A') {
            setOperandA(selectedNodeId);
          } else {
            setOperandB(selectedNodeId);
          }
        }
        setSelectingFor(null);
      } else {
        setSelectingFor(target);
        // If there's already a selected node, assign it immediately
        if (selectedNodeId) {
          if (target === 'A') {
            setOperandA(selectedNodeId);
          } else {
            setOperandB(selectedNodeId);
          }
          setSelectingFor(null);
        }
      }
    },
    [selectingFor, selectedNodeId],
  );

  const handleExecute = useCallback(() => {
    if (!operandA || !operandB) return;
    onExecuteCsg(operation, operandA, operandB);
  }, [onExecuteCsg, operandA, operandB, operation]);

  const canExecute = !disabled && operandA !== null && operandB !== null && operandA !== operandB;

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('csg.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('csg.operation')}</div>
          <div className="flex gap-1">
            {OPERATIONS.map((op) => (
              <button
                key={op.value}
                onClick={() => setOperation(op.value)}
                disabled={disabled}
                className={`${operation === op.value ? 'model-btn-primary' : 'model-btn-secondary'} flex-1 px-1 py-1.5 text-xs text-center ${
                  operation === op.value ? '' : ''
                }`}
                title={t(op.labelKey)}
              >
                <span className="block text-base">{op.icon}</span>
                <span className="block text-[10px] mt-0.5">{t(op.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-1">{t('csg.operandA')}</div>
          <div className="flex items-center gap-1">
            <span className="model-input-shell flex-1 truncate" title={getNodeName(operandA)}>
              {getNodeName(operandA)}
            </span>
            <button
              onClick={() => handleSelect('A')}
              disabled={disabled}
              className={`${selectingFor === 'A' ? 'model-btn-primary' : 'model-btn-secondary'} shrink-0 px-2 py-1 text-xs ${
                selectingFor === 'A' ? '' : ''
              }`}
            >
              {selectingFor === 'A' ? t('csg.confirm') : t('csg.select')}
            </button>
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-1">{t('csg.operandB')}</div>
          <div className="flex items-center gap-1">
            <span className="model-input-shell flex-1 truncate" title={getNodeName(operandB)}>
              {getNodeName(operandB)}
            </span>
            <button
              onClick={() => handleSelect('B')}
              disabled={disabled}
              className={`${selectingFor === 'B' ? 'model-btn-primary' : 'model-btn-secondary'} shrink-0 px-2 py-1 text-xs ${
                selectingFor === 'B' ? '' : ''
              }`}
            >
              {selectingFor === 'B' ? t('csg.confirm') : t('csg.select')}
            </button>
          </div>
        </div>

        <div className="px-3 py-3">
          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className="model-btn-primary w-full"
          >
            {t('csg.execute', { operation: t('csg.' + operation) })}
          </button>
          {operandA && operandB && operandA === operandB && (
            <p className="mt-1 text-[10px] text-[var(--model-danger)]">{t('csg.sameMeshError')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
