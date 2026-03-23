// frontend/src/components/TextBoxOverlay.js
// KindPDF — Text Box HTML overlay component.
//
// Renders a draggable, editable text box directly on the PDF page.
//
// Modes:
//   isNewlyPlaced  — starts immediately in edit mode (no separate popup)
//   isSelected     — shows a blue selection border; toolbar controls apply to this box
//   display mode   — shows styled text; drag to move, double-click to edit
//   edit mode      — textarea at correct font/size/color; Enter commits, Esc cancels

import React, { useState, useRef, useEffect, useCallback } from 'react';

// CSS font stacks for every font name exposed in the UI
export const FONT_FAMILY_MAP = {
  'Arial':                  'Arial, Helvetica, sans-serif',
  'Helvetica':              '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Times New Roman':        '"Times New Roman", Times, serif',
  'Georgia':                'Georgia, "Times New Roman", serif',
  'Verdana':                'Verdana, Geneva, Tahoma, sans-serif',
  'Tahoma':                 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS':           '"Trebuchet MS", Helvetica, sans-serif',
  'Impact':                 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  'Comic Sans MS':          '"Comic Sans MS", "Comic Sans", cursive',
  'Courier New':            '"Courier New", Courier, monospace',
  'Palatino Linotype':      '"Palatino Linotype", "Book Antiqua", Palatino, serif',
  'Garamond':               'Garamond, "Times New Roman", serif',
  'Arial Black':            '"Arial Black", "Arial Bold", Gadget, sans-serif',
  'Century Gothic':         '"Century Gothic", CenturyGothic, AppleGothic, sans-serif',
  'Calibri':                'Calibri, Candara, Segoe, "Segoe UI", Optima, Arial, sans-serif',
  'Cambria':                'Cambria, "Hoefler Text", "Liberation Serif", Times, serif',
  'Gill Sans MT':           '"Gill Sans MT", "Gill Sans", "Gill Sans Nova", Calibri, sans-serif',
  'Franklin Gothic Medium': '"Franklin Gothic Medium", "Arial Narrow Bold", Arial, sans-serif',
  'Lucida Sans':            '"Lucida Sans", "Lucida Grande", "Lucida Sans Unicode", sans-serif',
  'Segoe UI':               '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  // Legacy values kept for backward compatibility with annotations saved in older format
  'sans-serif': 'Arial, Helvetica, sans-serif',
  'serif':      '"Times New Roman", Times, serif',
  'monospace':  '"Courier New", Courier, monospace',
  'cursive':    '"Comic Sans MS", cursive',
};

export default function TextBoxOverlay({
  ann,                 // { id, x, y, text, fontSize, fontFamily, color }
  scale,
  onDelete,
  onUpdate,            // called with { x, y } | { text } | { fontFamily } etc.
  onSelect,            // called when box is clicked (not dragging)
  isSelected,
  isNewlyPlaced,       // if true, start immediately in edit mode
  eraserActive,
  interactionDisabled, // disable pointer events when a non-eraser tool is active
}) {
  const [isEditing, setIsEditing]   = useState(isNewlyPlaced || false);
  const [editText, setEditText]     = useState(ann.text || '');
  const [hovered, setHovered]       = useState(false);

  const containerRef      = useRef(null);
  const textareaRef       = useRef(null);
  const isDraggingRef     = useRef(false);
  const localPosRef       = useRef({ x: ann.x, y: ann.y });
  const isNewlyPlacedRef  = useRef(isNewlyPlaced);
  const isEditingRef      = useRef(isEditing);

  // Keep isEditingRef in sync so the blur handler captures the current value
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);

  // Sync position when parent changes ann (e.g. undo)
  useEffect(() => {
    localPosRef.current = { x: ann.x, y: ann.y };
    if (containerRef.current && !isDraggingRef.current) {
      containerRef.current.style.left = `${ann.x * scale}px`;
      containerRef.current.style.top  = `${ann.y * scale}px`;
    }
  }, [ann.x, ann.y, scale]);

  // Sync edit text when parent changes ann.text (e.g. undo)
  useEffect(() => {
    if (!isEditing) setEditText(ann.text || '');
  }, [ann.text, isEditing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // ── Drag to move ──────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (eraserActive) { onDelete(); return; }
    if (isEditing) return; // let clicks fall through to the textarea
    e.preventDefault();
    e.stopPropagation();

    isDraggingRef.current = false;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX      = localPosRef.current.x;
    const startY      = localPosRef.current.y;

    const onMouseMove = (moveEvt) => {
      const dx = (moveEvt.clientX - startMouseX) / scale;
      const dy = (moveEvt.clientY - startMouseY) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDraggingRef.current = true;
      if (isDraggingRef.current && containerRef.current) {
        localPosRef.current = { x: startX + dx, y: startY + dy };
        containerRef.current.style.left = `${localPosRef.current.x * scale}px`;
        containerRef.current.style.top  = `${localPosRef.current.y * scale}px`;
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      if (isDraggingRef.current) {
        onUpdate({ x: localPosRef.current.x, y: localPosRef.current.y });
      } else {
        // Pure click — select this text box
        if (onSelect) onSelect();
      }
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }, [eraserActive, isEditing, scale, onDelete, onUpdate, onSelect]);

  // ── Edit mode ────────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    const trimmed = editText.trim();
    setIsEditing(false);
    isNewlyPlacedRef.current = false;
    if (!trimmed) {
      onDelete();
    } else {
      onUpdate({ text: trimmed });
    }
  }, [editText, onDelete, onUpdate]);

  const handleDoubleClick = (e) => {
    if (eraserActive) return;
    e.stopPropagation();
    setEditText(ann.text || '');
    setIsEditing(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      isNewlyPlacedRef.current = false;
      setEditText(ann.text || '');
      if (!ann.text) onDelete();
      return;
    }
    // Shift+Enter = newline; plain Enter = commit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    }
  };

  const handleBlur = () => {
    // If this is a brand-new, still-empty textbox, don't auto-commit on blur.
    // The user might be clicking the font/size/color controls in the toolbar to
    // configure the text BEFORE they start typing. Auto-committing here would
    // immediately delete the empty box and make it impossible to change the font.
    // They can still cancel with Esc or close by clicking elsewhere after typing.
    if (isNewlyPlacedRef.current && !editText.trim()) return;

    // Small timeout so "Done" button onMouseDown fires first
    setTimeout(() => {
      if (isEditingRef.current) commitEdit();
    }, 120);
  };

  // ── Styles ───────────────────────────────────────────────────────
  const cssFontFamily = FONT_FAMILY_MAP[ann.fontFamily] || ann.fontFamily || 'Arial, Helvetica, sans-serif';
  const fontSize      = (ann.fontSize || 14) * scale;
  const color         = ann.color || '#1a1a1a';
  const fontWeight    = ann.isBold ? 'bold' : 'normal';
  const textDecoration = ann.isUnderline ? 'underline' : 'none';

  // Size the textarea generously based on current text
  const lines       = (editText || ' ').split('\n');
  const maxLineLen  = Math.max(...lines.map(l => l.length), 12);
  const textareaW   = Math.max(160, maxLineLen * (ann.fontSize || 14) * 0.58 * scale + 32);
  const textareaH   = Math.max(40,  lines.length * (ann.fontSize || 14) * 1.5 * scale + 16);

  return (
    <div
      ref={containerRef}
      className="absolute z-20"
      style={{
        left: ann.x * scale,
        top:  ann.y * scale,
        pointerEvents: interactionDisabled ? 'none' : 'auto',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isEditing ? (
        // ── Edit mode ────────────────────────────────────────────
        <div className="flex flex-col gap-0.5">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onClick={e => e.stopPropagation()}
            className="border-2 border-blue-400 rounded outline-none resize bg-white bg-opacity-95 px-1.5 py-1 shadow-lg"
            style={{
              fontSize,
              fontFamily: cssFontFamily,
              fontWeight,
              textDecoration,
              color,
              minWidth: textareaW,
              minHeight: textareaH,
              lineHeight: 1.4,
            }}
          />
          <div className="flex gap-1">
            <button
              onMouseDown={e => { e.preventDefault(); commitEdit(); }}
              className="flex-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded py-0.5 font-medium transition-colors shadow-sm"
            >
              ✓ Done
            </button>
            <button
              onMouseDown={e => {
                e.preventDefault();
                setIsEditing(false);
                isNewlyPlacedRef.current = false;
                setEditText(ann.text || '');
                if (!ann.text) onDelete();
              }}
              className="px-2 text-xs text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400" style={{ fontSize: 10, margin: 0 }}>
            Enter to finish · Shift+Enter for new line · Esc to cancel
          </p>
        </div>
      ) : (
        // ── Display mode ─────────────────────────────────────────
        <div
          className={`relative cursor-move px-1 py-0.5 rounded transition-all select-none ${
            eraserActive
              ? 'outline outline-2 outline-red-400 bg-red-50 bg-opacity-60 cursor-crosshair'
              : isSelected
              ? 'outline outline-2 outline-blue-500 shadow-sm'
              : hovered
              ? 'outline outline-1 outline-blue-200'
              : ''
          }`}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onClick={e => e.stopPropagation()}  // prevent page-container deselect on same click
          title={
            eraserActive
              ? 'Click to delete this text'
              : isSelected
              ? 'Drag to move · Double-click to edit · Change style in toolbar above'
              : 'Click to select · Drag to move · Double-click to edit'
          }
        >
          <p
            style={{
              fontSize,
              fontFamily: cssFontFamily,
              fontWeight,
              textDecoration,
              color,
              lineHeight: 1.4,
              margin: 0,
              whiteSpace: 'pre-wrap',
              pointerEvents: 'none',
            }}
          >
            {ann.text || '\u00A0' /* non-breaking space keeps height */}
          </p>

          {/* ✕ delete button — visible on hover or when selected */}
          {(hovered || isSelected) && !eraserActive && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onDelete(); }}
              title="Delete this text box"
              aria-label="Delete text box"
              className="absolute -top-2.5 -right-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-600 text-gray-500 text-xs shadow transition-colors z-30"
              style={{ lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
