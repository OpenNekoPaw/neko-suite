import React, { useCallback, useState } from 'react';
import { UploadIcon } from '@neko/ui/icons';
import { useTranslation } from '../../i18n/I18nContext';

export interface DroppedPuppetFile {
  readonly name: string;
  readonly data: string;
}

export interface PuppetEmptyStateProps {
  readonly onDropMoc3: (file: DroppedPuppetFile) => void;
  readonly onImportMoc3: () => void;
}

export function PuppetEmptyState({
  onDropMoc3,
  onImportMoc3,
}: PuppetEmptyStateProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);
  const { t } = useTranslation();

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
      aria-label={t('puppet.import.dropHint')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="puppet-empty-state-panel" data-puppet-empty-panel="true">
        <div className="puppet-empty-state-icon" aria-hidden="true">
          <UploadIcon size={22} />
        </div>
        <div className="puppet-empty-state-title">{t('puppet.import.title')}</div>
        <p className="puppet-empty-state-hint">{t('puppet.empty.hint')}</p>
        <button type="button" className="puppet-empty-state-import-button" onClick={onImportMoc3}>
          <UploadIcon size={14} />
          <span>{t('puppet.empty.import')}</span>
        </button>
      </div>
    </section>
  );
}
