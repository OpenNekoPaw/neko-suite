/**
 * ReferenceOverlay - floating reference image panel
 *
 * Displays reference images as draggable, resizable overlays on top of the canvas.
 * Does NOT participate in layer compositing — purely visual aid.
 */
import { useState, useCallback, useRef } from 'react';

export interface ReferenceImage {
  readonly id: string;
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
}

interface ReferenceOverlayProps {
  images: ReferenceImage[];
  onUpdate: (id: string, updates: Partial<ReferenceImage>) => void;
  onRemove: (id: string) => void;
}

export function ReferenceOverlay({ images, onUpdate, onRemove }: ReferenceOverlayProps) {
  return (
    <>
      {images.map((img) => (
        <ReferenceItem key={img.id} image={img} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </>
  );
}

function ReferenceItem({
  image,
  onUpdate,
  onRemove,
}: {
  image: ReferenceImage;
  onUpdate: (id: string, updates: Partial<ReferenceImage>) => void;
  onRemove: (id: string) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; imgX: number; imgY: number } | null>(
    null,
  );
  const [hovered, setHovered] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, imgX: image.x, imgY: image.y };
    },
    [image.x, image.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      onUpdate(image.id, { x: dragRef.current.imgX + dx, y: dragRef.current.imgY + dy });
    },
    [image.id, onUpdate],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      className="absolute"
      style={{
        left: image.x,
        top: image.y,
        width: image.width,
        height: image.height,
        opacity: image.opacity,
        pointerEvents: 'auto',
        outline: hovered ? '1px solid rgba(59,130,246,0.6)' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <img
        src={image.src}
        alt="Reference"
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {/* Controls visible on hover */}
      {hovered && (
        <div
          className="absolute top-0 right-0 flex gap-0.5 p-0.5"
          style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '0 0 0 4px' }}
        >
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(image.opacity * 100)}
            onChange={(e) => onUpdate(image.id, { opacity: Number(e.target.value) / 100 })}
            className="w-12 h-3"
            title="Opacity"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <button
            className="text-red-400 text-[10px] px-1"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(image.id);
            }}
            title="Remove"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
