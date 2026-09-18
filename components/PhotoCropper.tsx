"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PHOTO_CHARS } from "@/lib/types";

/**
 * Pick the square of a photo that becomes your avatar.
 *
 * The old upload took whatever square fell out of the middle of the
 * image, which is the wrong crop for most photographs of a person. This
 * lets you drag and zoom until the right part is inside the circle.
 *
 * The preview is a CSS transform and the result is a canvas draw, and the
 * two have to agree exactly or the saved picture is not the one you were
 * shown. Both are derived from the same three numbers — `scale` and the
 * offset — with the mapping written out in `crop()` below.
 *
 * No dependencies: this is a couple of pointer handlers and one
 * drawImage. An image-cropping library would be several times the weight
 * of everything else on the page.
 */

/** The circle you drag the photo around inside, in CSS pixels. */
const VIEW = 260;

/**
 * The saved square, in device pixels.
 *
 * 256 is enough for an 88px avatar on a 2× screen and keeps the data URL
 * to a few tens of kilobytes. It matters more than it looks: the photo
 * lives on the profile document, and every reader of the league table
 * downloads every player's.
 */
const OUTPUT = 256;

const MAX_ZOOM = 4;

export function PhotoCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => setError("That file could not be read as an image.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** Scale at which the image exactly covers the circle. */
  const baseScale = image ? Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight) : 1;
  const rendered = image
    ? { w: image.naturalWidth * baseScale, h: image.naturalHeight * baseScale }
    : { w: 0, h: 0 };

  /**
   * How far the photo may be dragged before an edge would show inside the
   * circle. Clamped on every change rather than only on release, so the
   * picture never leaves a gap even for a frame.
   */
  const clamp = useCallback(
    (next: { x: number; y: number }, s: number) => {
      const limitX = Math.max(0, (rendered.w * s - VIEW) / 2);
      const limitY = Math.max(0, (rendered.h * s - VIEW) / 2);
      return {
        x: Math.min(limitX, Math.max(-limitX, next.x)),
        y: Math.min(limitY, Math.max(-limitY, next.y)),
      };
    },
    [rendered.w, rendered.h],
  );

  useEffect(() => {
    setOffset((current) => clamp(current, scale));
  }, [scale, clamp]);

  function onPointerDown(event: React.PointerEvent) {
    if (!image) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = drag.current;
    if (!start) return;
    setOffset(
      clamp({ x: start.ox + (event.clientX - start.x), y: start.oy + (event.clientY - start.y) }, scale),
    );
  }

  function onPointerUp(event: React.PointerEvent) {
    drag.current = null;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
  }

  /**
   * The same mapping the preview uses, run backwards.
   *
   * On screen a point p of the original maps to
   *   centre + (p − centre) · r + offset,     r = baseScale · scale
   * so the source rectangle that lands on the circle is found by solving
   * that for the viewport's two corners.
   */
  async function crop() {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const r = baseScale * scale;
      const size = VIEW / r;
      const sx = image.naturalWidth / 2 + (-VIEW / 2 - offset.x) / r;
      const sy = image.naturalHeight / 2 + (-VIEW / 2 - offset.y) / r;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot prepare the image.");

      // A white bed, so a transparent PNG does not become black once it
      // is flattened into a JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);

      // The rules cap the stored string, so step the quality down until
      // it fits rather than failing the save at the last moment.
      let quality = 0.85;
      let url = canvas.toDataURL("image/jpeg", quality);
      while (url.length > MAX_PHOTO_CHARS && quality > 0.4) {
        quality -= 0.12;
        url = canvas.toDataURL("image/jpeg", quality);
      }
      if (url.length > MAX_PHOTO_CHARS) {
        throw new Error("That picture will not compress small enough. Try a simpler image.");
      }

      onDone(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cropper">
      <div
        className="cropper-view"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              width: rendered.w,
              height: rendered.h,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
        ) : null}
        <span className="cropper-mask" aria-hidden="true" />
      </div>

      <label className="field" htmlFor="crop-zoom" style={{ marginTop: 14 }}>
        <span>Zoom</span>
        <input
          id="crop-zoom"
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={scale}
          disabled={!image}
          onChange={(e) => setScale(Number(e.target.value))}
        />
      </label>

      <p className="hint">Drag the picture to move it. Everyone in the league can see it.</p>

      {error ? <div className="notice bad">{error}</div> : null}

      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="primary" disabled={!image || busy} onClick={() => void crop()}>
          {busy ? "Preparing…" : "Use this crop"}
        </button>
        <button type="button" className="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
