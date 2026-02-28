/**
 * DropZone - 拖拽上传组件
 * P2: 支持文件/图片拖拽到聊天区域
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AttachedFile } from './InputArea/types';
import { getLogger } from '../../utils/logger';

const logger = getLogger('DropZone');

interface DropZoneProps {
  children: React.ReactNode;
  onFilesDropped: (files: AttachedFile[]) => void;
  disabled?: boolean;
  acceptedTypes?: string[];
  maxSize?: number; // in bytes
}

// Accepted file types by category
const FILE_TYPE_MAP: Record<string, 'image' | 'video' | 'audio' | 'file'> = {
  'image/': 'image',
  'video/': 'video',
  'audio/': 'audio',
};

function getFileType(mimeType: string): 'image' | 'video' | 'audio' | 'file' {
  for (const [prefix, type] of Object.entries(FILE_TYPE_MAP)) {
    if (mimeType.startsWith(prefix)) {
      return type;
    }
  }
  return 'file';
}

export function DropZone({
  children,
  onFilesDropped,
  disabled = false,
  acceptedTypes = ['image/*', 'video/*', 'audio/*'],
  maxSize = 50 * 1024 * 1024, // 50MB default
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Check if file type is accepted
  const isAcceptedType = useCallback((file: File): boolean => {
    return acceptedTypes.some(type => {
      if (type.endsWith('/*')) {
        const prefix = type.slice(0, -1);
        return file.type.startsWith(prefix);
      }
      return file.type === type;
    });
  }, [acceptedTypes]);

  // Process dropped files
  const processFiles = useCallback(async (fileList: FileList): Promise<AttachedFile[]> => {
    const files: AttachedFile[] = [];
    const validFiles = Array.from(fileList).filter(file => {
      if (!isAcceptedType(file)) {
        logger.warn(`File type not accepted: ${file.type}`);
        return false;
      }
      if (file.size > maxSize) {
        logger.warn(`File too large: ${file.name} (${file.size} bytes)`);
        return false;
      }
      return true;
    });

    for (const file of validFiles) {
      const fileType = getFileType(file.type);
      const attachedFile: AttachedFile = {
        id: `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: fileType,
        size: file.size,
      };

      // Create preview for media files
      if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
        try {
          const preview = await readFileAsDataURL(file);
          attachedFile.preview = preview;
        } catch (err) {
          logger.error('Failed to read file preview:', err);
        }
      }

      files.push(attachedFile);
    }

    return files;
  }, [isAcceptedType, maxSize]);

  // Read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle drag enter
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [disabled]);

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    dragCounterRef.current = 0;

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const processedFiles = await processFiles(files);
      if (processedFiles.length > 0) {
        onFilesDropped(processedFiles);
      }
    }
  }, [disabled, processFiles, onFilesDropped]);

  // Reset drag counter on mount
  useEffect(() => {
    dragCounterRef.current = 0;
  }, []);

  return (
    <div
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)] bg-opacity-90 border-2 border-dashed border-[var(--vscode-focusBorder)] rounded-lg">
          <div className="text-center">
            <UploadIcon className="w-12 h-12 mx-auto mb-3 text-[var(--vscode-focusBorder)]" />
            <p className="text-[14px] font-medium text-[var(--vscode-foreground)]">
              Drop files here
            </p>
            <p className="text-[12px] text-[var(--vscode-descriptionForeground)] mt-1">
              Images, videos, and audio files
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Upload icon
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}
