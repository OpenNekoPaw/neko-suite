import React, { useCallback, useState } from 'react';

export interface DroppedPuppetFile {
  readonly name: string;
  readonly data: string;
}

export interface PuppetEmptyStateProps {
  readonly onDropMoc3: (file: DroppedPuppetFile) => void;
}

export function PuppetEmptyState({ onDropMoc3 }: PuppetEmptyStateProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const file = event.dataTransfer.files[0];
      if (!file || !file.name.toLowerCase().endsWith('.moc3')) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const data = reader.result.split(',')[1] ?? '';
        onDropMoc3({ name: file.name, data });
      };
      reader.readAsDataURL(file);
    },
    [onDropMoc3],
  );

  return (
    <section
      className="puppet-empty-state"
      data-drag-over={isDragOver ? 'true' : 'false'}
      data-puppet-empty-state="true"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-hidden="true"
    />
  );
}
