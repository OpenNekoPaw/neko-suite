/**
 * SkillSearchBar — Search input for skill marketplace.
 */

import React, { useCallback, useRef } from 'react';
import { VSCodeMessages } from '../../messages';
import { useSkillMarket } from './useSkillMarket';

export const SkillSearchBar: React.FC = () => {
  const { searchText, setSearchText, setSearching } = useSkillMarket();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setSearchText(text);

      // Debounce search
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setSearching(true);
        VSCodeMessages.marketSearch({ text: text || undefined });
      }, 300);
    },
    [setSearchText, setSearching],
  );

  return (
    <div className="px-3 py-2">
      <input
        type="text"
        value={searchText}
        onChange={handleChange}
        placeholder="Search skills..."
        className="w-full px-3 py-1.5 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
      />
    </div>
  );
};
