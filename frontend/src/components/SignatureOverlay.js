// frontend/src/components/SignatureOverlay.js
// KindPDF — Signature HTML Overlay
//
// Renders a placed signature as a draggable, resizable <img> element
// positioned absolutely over the PDF page canvas.
//
// Features:
//   - Drag the signature to reposition it
//   - 4 corner handles to resize it (maintains aspect ratio)
//   - Delete button (top-right ✕)
//   - Eraser mode: click to delete instantly
//   - interactionDisabled: pointer-events off when another tool is active
//
// Props:
//   ann               — { id, page, x, y, width, height, dataUrl }
//   scale             — current zoom scale (px per PDF point)
//   onUpdate(patch)   — called with { x, y } or { width, height } or both after drag/resize
//   onDelete()        — called when deleted
//   eraserActive      — boolean
//   interactionDisabled — boolean
//
// Coordinate system: x, y, width, height are in PDF points at scale=1.
// On screen: multiply by scale to get pixels.

import React, { useRef, useCallback, useEffect, useState } from 'react';

const MIN_SIZE = 40; // minimum signature width/height in PDF points

export default function SignatureOverlay({
  ann,
  scale,
  onUpdate,
  onDelete,
  eraserActive,
  interactionDisabled,
}) {
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  // Keep DOM position in sync with ann.x / ann.y / ann.width / ann.height
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isDraggingRef.current) return;
    el.style.left   = `${ann.x      * scale}px`;
    el.style.top    = `${ann.y      * scale}px`;
    el.style.width  = `${ann.width  * scale}px`;
    el.style.height = `${ann.height * scale}px`;
  }, [ann.x, ann.y, ann.width, ann.height, scale]);

  // ── Drag to move ────────────────────────────────────────────────────────────

  const handleDragMouseDown = useCallback((e) => {
    if (eraserActive || e.target.dataset.resize) return;
    e.preventDefault();
    e.stopPropagation();

    isDraggingRef.current = false;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startAnnX   = ann.x;
    const startAnnY   = ann.y;

    const onMouseMove = (moveEvt) => {
      const dx = (moveEvt.clientX - startMouseX) / scale;
      const dy = (moveEvt.clientY - startMouseY) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDraggingRef.current = true;
      if (isDraggingRef.current && containerRef.current) {
        containerRef.current.style.left = `${(startAnnX + dx) * scale}px`;
        containerRef.current.style.top  = `${(startAnnY + dy) * scale}px`;
      }
    };

    const onMouseUp = (upEvt) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      if (isDraggingRef.current) {
        const dx = (upEvt.clientX - startMouseX) / scale;
        const dy = (upEvt.clientY - startMouseY) / scale;
        onUpdate({ x: startAnnX + dx, y: startAnnY + dy });
      }
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }, [eraserActive, ann.x, ann.y, scale, onUpdate]);

  // ── Resize handles ──────────────────────────────────────────────────────────
  // corner: 'nw' | 'ne' | 'sw' | 'se'

  const handleResizeMouseDown = useCallback((e, corner) => {
    e.preventDefault();
    e.stopPropagation();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX      = ann.x;
    const startY      = ann.y;
    const startW      = ann.width;
    const startH      = ann.height;
    const aspect      = startH / startW; // preserve aspect ratio

    const onMouseMove = (moveEvt) => {
      const rawDx = (moveEvt.clientX - startMouseX) / scale;
      const rawDy = (moveEvt.clientY - startMouseY) / scale;

      let newX = startX, newY = startY, newW = startW, newH = startH;

      // For each corner, adjust the relevant edges and clamp to MIN_SIZE
      if (corner === 'se') {
        newW = Math.max(MIN_SIZE, startW + rawDx);
        newH = newW * aspect;
      } else if (corner === 'sw') {
        newW = Math.max(MIN_SIZE, startW - rawDx);
        newH = newW * aspect;
        newX = startX + startW - newW;
      } else if (corner === 'ne') {
        newW = Math.max(MIN_SIZE, startW + rawDx);
        newH = newW * aspect;
        newY = startY + startH - newH;
      } else if (corner === 'nw') {
        newW = Math.max(MIN_SIZE, startW - rawDx);
        newH = newW * aspect;
        newX = startX + startW - newW;
        newY = startY + startH - newH;
      }

      // Update DOM immediately for smooth feedback
      if (containerRef.current) {
        containerRef.current.style.left   = `${newX * scale}px`;
        containerRef.current.style.top    = `${newY * scale}px`;
        containerRef.current.style.width  = `${newW * scale}px`;
        containerRef.current.style.height = `${newH * scale}px`;
      }
    };

    const onMouseUp = (upEvt) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);

      const rawDx = (upEvt.clientX - startMouseX) / scale;
      const rawDy = (upEvt.clientY - startMouseY) / scale;

      let newX = startX, newY = startY, newW = startW, newH = startH;

      if (corner === 'se') {
        newW = Math.max(MIN_SIZE, startW + rawDx);
        newH = newW * aspect;
      } else if (corner === 'sw') {
        newW = Math.max(MIN_SIZE, startW - rawDx);
        newH = newW * aspect;
        newX = startX + startW - newW;
      } else if (corner === 'ne') {
        newW = Math.max(MIN_SIZE, startW + rawDx);
        newH = newW * aspect;
        newY = startY + startH - newH;
      } else if (corner === 'nw') {
        newW = Math.max(MIN_SIZE, startW - rawDx);
        newH = newW * aspect;
        newX = startX + startW - newW;
        newY = startY + startH - newH;
      }

      onUpdate({ x: newX, y: newY, width: newW, height: newH });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }, [ann.x, ann.y, ann.width, ann.height, scale, onUpdate]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const showHandles = hovered && !eraserActive;

  // Resize handle visual: small square at each corner
  const ResizeHandle = ({ corner }) => {
    const posStyle = {
      nw: { top: -5, left: -5, cursor: 'nw-resize' },
      ne: { top: -5, right: -5, cursor: 'ne-resize' },
      sw: { bottom: -5, left: -5, cursor: 'sw-resize' },
      se: { bottom: -5, right: -5, cursor: 'se-resize' },
    }[corner];

    return (
      <div
        data-resize={corner}
        onMouseDown={(e) => handleResizeMouseDown(e, corner)}
        className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-sm z-10"
        style={{ ...posStyle, position: 'absolute' }}
        title={`Drag to resize`}
        aria-label={`Resize handle (${corner})`}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={`absolute z-20 ${eraserActive ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        left:         ann.x      * scale,
        top:          ann.y      * scale,
        width:        ann.width  * scale,
        height:       ann.height * scale,
        pointerEvents: interactionDisabled ? 'none' : 'auto',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={eraserActive ? undefined : handleDragMouseDown}
      onClick={eraserActive ? (e) => { e.stopPropagation(); onDelete(); } : undefined}
      title={eraserActive ? 'Click to delete this signature' : 'Drag to move · Use corners to resize'}
    >
      {/* Signature image */}
      <img
        src={ann.dataUrl}
        alt="Placed signature"
        draggable={false}
        className={`w-full h-full object-contain select-none block ${eraserActive ? 'opacity-60' : ''}`}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      />

      {/* Hover border + controls */}
      {showHandles && (
        <>
          {/* Blue selection border */}
          <div
            className="absolute inset-0 border-2 border-blue-500 rounded pointer-events-none"
            aria-hidden="true"
          />

          {/* Delete button — top right */}
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete this signature"
            aria-label="Delete signature"
            className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold z-20 shadow transition-colors"
            style={{ fontSize: 11 }}
          >
            ✕
          </button>

          {/* Corner resize handles */}
          <ResizeHandle corner="nw" />
          <ResizeHandle corner="ne" />
          <ResizeHandle corner="sw" />
          <ResizeHandle corner="se" />
        </>
      )}

      {/* Eraser-mode red tint ring */}
      {eraserActive && (
        <div
          className="absolute inset-0 border-2 border-red-400 bg-red-100/30 rounded pointer-events-none"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
