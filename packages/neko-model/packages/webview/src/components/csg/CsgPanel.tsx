import React, { useState, useCallback } from 'react';
import { useModelStore } from '../../stores/modelStore';
import { postMessage } from '@neko/shared/vscode';

type CsgOperation = 'union' | 'difference' | 'intersection';

const OPERATIONS: { value: CsgOperation; label: string; icon: string }[] = [
  { value: 'union', label: 'Union', icon: '\u222A' },
  { value: 'difference', label: 'Difference', icon: '\u2216' },
  { value: 'intersection', label: 'Intersection', icon: '\u2229' },
];

/**
 * CSG Boolean Panel - Constructive Solid Geometry operations.
 *
 * Select two mesh operands and apply union/difference/intersection.
 */
export function CsgPanel(): React.JSX.Element {
  const [operation, setOperation] = useState<CsgOperation>('union');
  const [operandA, setOperandA] = useState<string | null>(null);
  const [operandB, setOperandB] = useState<string | null>(null);
  const [selectingFor, setSelectingFor] = useState<'A' | 'B' | null>(null);

  const selectedNodeId = useModelStore((s) => s.selectedNodeId);
  const sceneNodes = useModelStore((s) => s.sceneNodes);

  const getNodeName = useCallback(
    (id: string | null): string => {
      if (!id) return '(none)';
      const node = sceneNodes.find((n) => n.id === id);
      return node?.name ?? id;
    },
    [sceneNodes],
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
    postMessage({
      type: 'csgBoolean',
      entityA: operandA,
      entityB: operandB,
      operation,
    });
  }, [operandA, operandB, operation]);

  const canExecute = operandA !== null && operandB !== null && operandA !== operandB;

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">CSG Boolean</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Operation Selector */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">
            Operation
          </div>
          <div className="flex gap-1">
            {OPERATIONS.map((op) => (
              <button
                key={op.value}
                onClick={() => setOperation(op.value)}
                className={`flex-1 px-1 py-1.5 text-xs rounded transition-colors text-center ${
                  operation === op.value
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                    : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
                }`}
                title={op.label}
              >
                <span className="block text-base">{op.icon}</span>
                <span className="block text-[10px] mt-0.5">{op.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Operand A */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-1">
            Operand A
          </div>
          <div className="flex items-center gap-1">
            <span
              className="flex-1 text-xs px-2 py-1 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] truncate"
              title={getNodeName(operandA)}
            >
              {getNodeName(operandA)}
            </span>
            <button
              onClick={() => handleSelect('A')}
              className={`px-2 py-1 text-xs rounded transition-colors shrink-0 ${
                selectingFor === 'A'
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                  : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
              }`}
            >
              {selectingFor === 'A' ? 'Confirm' : 'Select'}
            </button>
          </div>
        </div>

        {/* Operand B */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-1">
            Operand B
          </div>
          <div className="flex items-center gap-1">
            <span
              className="flex-1 text-xs px-2 py-1 rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] truncate"
              title={getNodeName(operandB)}
            >
              {getNodeName(operandB)}
            </span>
            <button
              onClick={() => handleSelect('B')}
              className={`px-2 py-1 text-xs rounded transition-colors shrink-0 ${
                selectingFor === 'B'
                  ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                  : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
              }`}
            >
              {selectingFor === 'B' ? 'Confirm' : 'Select'}
            </button>
          </div>
        </div>

        {/* Execute */}
        <div className="px-3 py-3">
          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className="w-full px-2 py-1.5 text-xs rounded transition-colors
                       bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]
                       hover:bg-[var(--vscode-button-hoverBackground)]
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Execute {operation.charAt(0).toUpperCase() + operation.slice(1)}
          </button>
          {operandA && operandB && operandA === operandB && (
            <p className="text-[10px] text-[var(--vscode-errorForeground)] mt-1">
              Operands must be different nodes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
