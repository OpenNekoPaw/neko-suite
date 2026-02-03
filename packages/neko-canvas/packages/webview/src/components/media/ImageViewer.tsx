/**
 * ImageViewer - 图片查看器组件
 * 支持图片显示、点击放大、缩放
 */

import { useState, useCallback } from 'react';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  enableZoom?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ImageViewer({
  src,
  alt = 'Image',
  className,
  objectFit = 'contain',
  enableZoom = true,
  onLoad,
  onError,
}: ImageViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setError(true);
    onError?.();
  }, [onError]);

  const openFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (enableZoom) {
      setIsFullscreen(true);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [enableZoom]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.max(0.5, Math.min(5, prev + delta)));
  }, []);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (e.buttons !== 1) return;
    setPosition((prev) => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY,
    }));
  }, []);

  const resetView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return (
    <>
      {/* 缩略图/预览 */}
      <div
        className={clsx(
          'relative bg-black/20 overflow-hidden',
          enableZoom && 'cursor-zoom-in',
          className
        )}
        onClick={openFullscreen}
      >
        {/* 加载指示器 */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
            <span className="text-2xl mb-1">🖼️</span>
            <span className="text-xs">加载失败</span>
          </div>
        )}

        {/* 图片 */}
        <img
          src={src}
          alt={alt}
          className={clsx(
            'w-full h-full transition-opacity duration-200',
            isLoading ? 'opacity-0' : 'opacity-100',
            objectFit === 'contain' && 'object-contain',
            objectFit === 'cover' && 'object-cover',
            objectFit === 'fill' && 'object-fill'
          )}
          onLoad={handleLoad}
          onError={handleError}
          draggable={false}
        />

        {/* 放大提示 */}
        {enableZoom && !isLoading && !error && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
            点击放大
          </div>
        )}
      </div>

      {/* 全屏查看器 */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
          onClick={closeFullscreen}
          onWheel={handleWheel}
        >
          {/* 工具栏 */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <span className="text-white/60 text-sm mr-2">
              {Math.round(scale * 100)}%
            </span>
            <button
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
              onClick={(e) => {
                e.stopPropagation();
                setScale((prev) => Math.min(5, prev + 0.25));
              }}
              title="放大"
            >
              +
            </button>
            <button
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
              onClick={(e) => {
                e.stopPropagation();
                setScale((prev) => Math.max(0.5, prev - 0.25));
              }}
              title="缩小"
            >
              −
            </button>
            <button
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
              onClick={resetView}
              title="重置"
            >
              ↺
            </button>
            <button
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white ml-2"
              onClick={closeFullscreen}
              title="关闭"
            >
              ✕
            </button>
          </div>

          {/* 图片 */}
          <img
            src={src}
            alt={alt}
            className="max-w-none cursor-move select-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: 'transform 0.1s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseMove={handleDrag}
            draggable={false}
          />

          {/* 提示 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-sm">
            滚轮缩放 · 拖拽移动 · 点击背景关闭
          </div>
        </div>
      )}
    </>
  );
}
