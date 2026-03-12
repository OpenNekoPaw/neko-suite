import React from 'react';

/**
 * Root application component for the 3D Model Editor webview.
 * Will be expanded with R3F viewport, panels, and scene tree.
 */
export function App(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] flex items-center justify-center">
      <p className="text-sm opacity-60">3D Model Editor — Loading viewport...</p>
    </div>
  );
}
