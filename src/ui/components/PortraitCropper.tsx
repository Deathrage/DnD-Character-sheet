import { useRef, useState, type KeyboardEvent } from 'react';
import type { Crop } from '../portrait.js';

const MAX_ZOOM = 4;

interface Size {
  width: number;
  height: number;
}

/** The largest square the image holds, centred: what the cropper starts from. */
export function centred({ width, height }: Size): Crop {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

function clamp(crop: Crop, { width, height }: Size): Crop {
  return {
    side: crop.side,
    x: Math.min(Math.max(crop.x, 0), width - crop.side),
    y: Math.min(Math.max(crop.y, 0), height - crop.side),
  };
}

export function pan(crop: Crop, dx: number, dy: number, size: Size): Crop {
  return clamp({ ...crop, x: crop.x + dx, y: crop.y + dy }, size);
}

/** `zoom` 1 is the largest square; the square shrinks about its own centre. */
export function zoomTo(crop: Crop, zoom: number, size: Size): Crop {
  const side = Math.min(size.width, size.height) / zoom;
  const grow = (crop.side - side) / 2;
  return clamp({ x: crop.x + grow, y: crop.y + grow, side }, size);
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

interface Props {
  /** An object URL of the picked file; the parent owns and revokes it. */
  src: string;
  onChange(crop: Crop): void;
  /** The browser could not decode the file. */
  onError(): void;
}

/**
 * Drag the picture (or use the arrow keys) to move it, the slider to zoom. The square window is
 * exactly what is stored; the ring inside it is the round token the header shows.
 */
export function PortraitCropper({ src, onChange, onError }: Props) {
  const [size, setSize] = useState<Size | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const update = (next: Crop) => {
    setCrop(next);
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const arrow = ARROWS[event.key];
    if (!arrow || !crop || !size) return;
    event.preventDefault();
    // The picture moves the way the arrow points, as it does under a dragging finger.
    const step = crop.side * 0.05;
    update(pan(crop, arrow[0] * step, arrow[1] * step, size));
  };

  return (
    <>
      <div
        className="cropper"
        tabIndex={0}
        aria-label="Portrait crop: drag or use the arrow keys to move the picture"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current || !crop || !size) return;
          // Screen pixels to image pixels: the window's width shows `crop.side` of them.
          const scale = crop.side / event.currentTarget.clientWidth;
          const dx = (drag.current.x - event.clientX) * scale;
          const dy = (drag.current.y - event.clientY) * scale;
          drag.current = { x: event.clientX, y: event.clientY };
          update(pan(crop, dx, dy, size));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onError={onError}
          onLoad={(event) => {
            const loaded = {
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            };
            setSize(loaded);
            update(centred(loaded));
          }}
          style={
            crop && size
              ? {
                  width: `${(size.width / crop.side) * 100}%`,
                  left: `${(-crop.x / crop.side) * 100}%`,
                  top: `${(-crop.y / crop.side) * 100}%`,
                }
              : { visibility: 'hidden' }
          }
        />
      </div>
      <input
        type="range"
        className="zoom"
        aria-label="Zoom"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        disabled={!crop || !size}
        value={crop && size ? Math.min(size.width, size.height) / crop.side : 1}
        onChange={(event) => {
          if (crop && size) update(zoomTo(crop, Number(event.currentTarget.value), size));
        }}
      />
    </>
  );
}
