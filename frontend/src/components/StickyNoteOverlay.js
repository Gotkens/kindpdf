// frontend/src/components/StickyNoteOverlay.js
// KindPDF — Sticky Note HTML overlay component.
//
// Renders a small 📝 icon on the PDF page. Hovering reveals a popup card
// with the full note text and a ✕ delete button. Dragging the icon moves it.
//
// Hover behaviour: 400ms delay before the popup hides, so the user can move
// the mouse from the icon to the popup card without it vanishing.

import React, { useState, useRef, useCallback, useEffect } from 'react';

const ICON_SIZE = 26;

export default function StickyNoteOverlay({
  ann,                 // { id, x, y, text }
  scale,
  onDelete,
  onUpdate,            // called with { x, y } after a drag, or { text } after edit
  eraserActive,
  interactionDisabled, // disable pointer events when another tool is active
  openForEdit,         // if true, open popup in edit mode immediately (controlled by parent)
  onOpenHandled,       // called after we've opened, so parent can reset the flag
}) {
  const [popupVisible, setPopupVisible] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNoteText, setEditNoteText] = useState('');
  const hideTimerRef  = useRef(null);
  const containerRef  = useRef(null);
  const isDraggingRef = useRef(false);

  // ── Hover delay helpers ───────────────────────────────────────────
  const cancelHide = () => clearTimeout(hideTimerRef.current);

  const scheduleHide = () => {
    hideTimerRef.current = setTimeout(() => setPopupVisible(false), 400);
  };

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  // When parent sets openForEdit=true (user clicked existing note with sticky tool active),
  // open the popup in edit mode and tell the parent we've handled it.
  useEffect(() => {
    if (openForEdit) {
      cancelHide();
      setEditNoteText(ann.text || '');
      setPopupVisible(true);
      setIsEditingNote(true);
      if (onOpenHandled) onOpenHandled();
    }
  }, [openForEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep container DOM position in sync when parent updates ann.x / ann.y
  useEffect(() => {
    if (containerRef.current && !isDraggingRef.current) {
      containerRef.current.style.left = `${ann.x * scale}px`;
      containerRef.current.style.top  = `${ann.y * scale}px`;
    }
  }, [ann.x, ann.y, scale]);

  // ── Drag to move ──────────────────────────────────────────────────
  const handleIconMouseDown = useCallback((e) => {
    if (eraserActive) { onDelete(); return; }
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
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingRef.current = true;
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
  }, [eraserActive, onDelete, onUpdate, scale, ann.x, ann.y]);

  // Show popup to the left if icon is near right side of page
  const popupOnLeft = ann.x * scale > 280;

  return (
    <div
      ref={containerRef}
      className="absolute z-20"
      style={{
        left: ann.x * scale,
        top:  ann.y * scale,
        width: ICON_SIZE,
        height: ICON_SIZE,
        pointerEvents: interactionDisabled ? 'none' : 'auto',
      }}
    >
      {/* ── Icon button ── */}
      <button
        onMouseDown={handleIconMouseDown}
        onMouseEnter={() => { if (!eraserActive) { cancelHide(); setPopupVisible(true); } }}
        onMouseLeave={scheduleHide}
        title={
          eraserActive
            ? 'Click to delete this note'
            : 'Drag to move · Hover to read note'
        }
        aria-label="Sticky note"
        className={`w-full h-full flex items-center justify-center rounded transition-colors ${
          eraserActive
            ? 'bg-red-100 ring-1 ring-red-400 cursor-crosshair'
            : 'hover:bg-amber-100 cursor-grab active:cursor-grabbing'
        }`}
        style={{ fontSize: 16, lineHeight: 1 }}
      >
        📝
      </button>

      {/* ── Popup card ── */}
      {popupVisible && !eraserActive && (
        <div
          className="absolute z-30 bg-yellow-50 border border-amber-300 rounded-lg shadow-2xl overflow-hidden"
          style={{
            width: 240,
            left: popupOnLeft ? -(240 + 6) : ICON_SIZE + 6,
            top: 0,
          }}
          onMouseEnter={() => { cancelHide(); setPopupVisible(true); }}
          onMouseLeave={scheduleHide}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-amber-100 border-b border-amber-200">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              {isEditingNote ? 'Edit Note' : 'Note'}
            </span>
            <div className="flex items-center gap-1">
              {!isEditingNote && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    cancelHide();
                    setEditNoteText(ann.text || '');
                    setIsEditingNote(true);
                  }}
                  title="Edit this note"
                  aria-label="Edit note"
                  className="w-5 h-5 flex items-center justify-center rounded-full text-amber-600 hover:bg-amber-200 transition-colors text-xs"
                >
                  ✏️
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                title="Delete this note"
                aria-label="Delete note"
                className="w-5 h-5 flex items-center justify-center rounded-full text-amber-600 hover:bg-red-100 hover:text-red-600 transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          </div>

          {isEditingNote ? (
            // ── Edit mode ──
            <div className="p-2 flex flex-col gap-1.5">
              <textarea
                autoFocus
                value={editNoteText}
                onChange={e => setEditNoteText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setIsEditingNote(false); e.stopPropagation(); }
                }}
                rows={4}
                className="w-full text-sm p-1.5 rounded border border-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white resize-none"
                style={{ lineHeight: 1.4 }}
              />
              <div className="flex gap-1">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    e.stopPropagation();
                    const trimmed = editNoteText.trim();
                    if (trimmed) onUpdate({ text: trimmed });
                    setIsEditingNote(false);
                  }}
                  className="flex-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded py-1 font-medium transition-colors"
                >
                  ✓ Save
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.stopPropagation(); setIsEditingNote(false); }}
                  className="px-2 text-xs text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            // ── Read mode — double-click to edit ──
            <p
              className="px-3 py-2.5 text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed cursor-text"
              onDoubleClick={e => {
                e.stopPropagation();
                cancelHide();
                setEditNoteText(ann.text || '');
                setIsEditingNote(true);
              }}
              title="Double-click to edit this note"
            >
              {ann.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
