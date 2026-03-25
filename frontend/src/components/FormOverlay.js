// frontend/src/components/FormOverlay.js
// KindPDF — Phase 1.4: Form Filling
//
// Renders interactive HTML form-field overlays on top of the PDF canvas for
// one page, matching the same absolute-positioning pattern used by
// StickyNoteOverlay and TextBoxOverlay.
//
// Coordinate conversion:
//   The backend normalizes every field rect to 0–1 fractions of the page's
//   point dimensions (pyMuPDF page.rect.width / height).  To convert back to
//   pixel positions for the overlay we multiply by the same page dimensions
//   (in PDF points, obtained from PDF.js getViewport({scale:1})) and then by
//   the current render scale:
//
//     pixelX = field.rect.x0 * pageDim.width  * scale
//     pixelY = field.rect.y0 * pageDim.height * scale
//     pixelW = (field.rect.x1 - field.rect.x0) * pageDim.width  * scale
//     pixelH = (field.rect.y1 - field.rect.y0) * pageDim.height * scale
//
// Props:
//   fields         — full formFields array (all pages); this component filters
//   pageIndex      — 0-based page index for this page (matches field.page)
//   scale          — current render scale (1.0 = 100 %)
//   pageDimensions — { width, height } in PDF points at scale=1
//   formValues     — { fieldName: value } controlled state from PDFViewer
//   onFieldChange  — (fieldName, newValue) => void

import React from 'react';

// ── Shared input style helpers ────────────────────────────────────────────────

// Base inline style for every field overlay element.
function baseStyle(x, y, w, h, readonly) {
  return {
    position:     'absolute',
    left:         x,
    top:          y,
    width:        w,
    height:       h,
    boxSizing:    'border-box',
    pointerEvents: readonly ? 'none' : 'auto',
    cursor:        readonly ? 'default' : undefined,
  };
}

// Light blue tint shown at rest; white on focus — gives a clear visual cue
// that the field is editable without hiding the PDF content underneath.
const IDLE_BG      = 'rgba(219, 234, 254, 0.35)';  // tailwind blue-100 at 35 %
const FOCUS_BG     = 'rgba(239, 246, 255, 0.92)';  // tailwind blue-50  at 92 %
const FOCUS_BORDER = '1.5px solid #3b82f6';         // tailwind blue-500
// Calculated fields: light green tint so the user can see they're auto-filled.
const CALC_BG      = 'rgba(220, 252, 231, 0.45)';  // tailwind green-100 at 45 %

function handleFocus(e) {
  e.target.style.background    = FOCUS_BG;
  e.target.style.border        = FOCUS_BORDER;
  e.target.style.outline       = 'none';
}
function handleBlur(e) {
  e.target.style.background = IDLE_BG;
  e.target.style.border     = '1px solid transparent';
  e.target.style.outline    = 'none';
}

// ── Main component ────────────────────────────────────────────────────────────

function FormOverlay({ fields, pageIndex, scale, pageDimensions, formValues, onFieldChange }) {
  if (!fields || !pageDimensions) return null;

  // Only render fields that belong to this page
  const pageFields = fields.filter(f => f.page === pageIndex);
  if (pageFields.length === 0) return null;

  const { width: pgW, height: pgH } = pageDimensions;

  return (
    // The overlay fills the page div exactly.  pointer-events:none on the
    // container means only the individual field elements capture events.
    <div
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         pgW * scale,
        height:        pgH * scale,
        pointerEvents: 'none',
        zIndex:        30,
      }}
      aria-label="Form fields overlay"
    >
      {pageFields.map((field, idx) => {
        // Convert normalised 0–1 fractions → pixel positions
        const x = field.rect.x0 * pgW * scale;
        const y = field.rect.y0 * pgH * scale;
        const w = (field.rect.x1 - field.rect.x0) * pgW * scale;
        const h = (field.rect.y1 - field.rect.y0) * pgH * scale;

        // Use the controlled formValues value if present, otherwise the
        // field's default value from the PDF.
        const value = Object.prototype.hasOwnProperty.call(formValues, field.name)
          ? formValues[field.name]
          : (field.value ?? '');

        // Key: combine name + idx in case duplicate field names exist
        const key = `${field.name}__${idx}`;

        // ── Text field ──────────────────────────────────────────────────────
        // Calculated fields (script_calc !== null) are rendered as read-only:
        // their value is managed by the calculation engine in PDFViewer.js and
        // shown with a green tint so the user knows it's auto-filled.
        if (field.type === 'text') {
          const isCalc   = !!field.script_calc;
          const isReadonly = field.readonly || isCalc;
          const fontSize = Math.max(8, Math.min(h * 0.65, 14));
          return (
            <input
              key={key}
              type="text"
              value={value}
              onChange={e => { if (!isCalc) onFieldChange(field.name, e.target.value); }}
              readOnly={isReadonly}
              disabled={field.readonly}   // grey-out truly read-only PDF fields
              title={isCalc ? `${field.name} (auto-calculated)` : field.name}
              aria-label={isCalc ? `${field.name} — automatically calculated` : field.name}
              style={{
                ...baseStyle(x, y, w, h, isReadonly),
                background:   isCalc ? CALC_BG : IDLE_BG,
                border:       '1px solid transparent',
                borderRadius: 2,
                padding:      '0 3px',
                fontSize:     fontSize,
                fontFamily:   'Helvetica, Arial, sans-serif',
                color:        '#1a1a1a',
                lineHeight:   `${h}px`,
                overflow:     'hidden',
                whiteSpace:   'nowrap',
              }}
              onFocus={isCalc ? undefined : handleFocus}
              onBlur={isCalc  ? undefined : handleBlur}
            />
          );
        }

        // ── Checkbox ────────────────────────────────────────────────────────
        if (field.type === 'checkbox') {
          const isChecked = value === true || value === 'true'
                         || value === '1'   || value === 'Yes'
                         || value === 'On'  || value === 'on';
          const cbSize = Math.min(w, h) * 0.75;
          return (
            <div
              key={key}
              style={{
                ...baseStyle(x, y, w, h, field.readonly),
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     IDLE_BG,
                border:         '1px solid transparent',
                borderRadius:   2,
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={e => onFieldChange(field.name, e.target.checked)}
                disabled={field.readonly}
                title={field.name}
                aria-label={field.name}
                style={{
                  width:         cbSize,
                  height:        cbSize,
                  pointerEvents: field.readonly ? 'none' : 'auto',
                  cursor:        field.readonly ? 'default' : 'pointer',
                }}
              />
            </div>
          );
        }

        // ── Radio button ────────────────────────────────────────────────────
        // In a PDF radio group every widget shares the same field name but has
        // a unique export value.  The group's current value is the export value
        // of the selected button.  We check this button by comparing formValues
        // for the group name against this button's exportValue.
        if (field.type === 'radio') {
          const isChecked = value === field.exportValue;
          const rbSize = Math.min(w, h) * 0.75;
          return (
            <div
              key={key}
              style={{
                ...baseStyle(x, y, w, h, field.readonly),
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     IDLE_BG,
                border:         '1px solid transparent',
                borderRadius:   '50%',
              }}
            >
              <input
                type="radio"
                name={field.name}
                value={field.exportValue}
                checked={isChecked}
                onChange={e => {
                  if (e.target.checked) onFieldChange(field.name, field.exportValue);
                }}
                disabled={field.readonly}
                title={field.name}
                aria-label={`${field.name}: ${field.exportValue}`}
                style={{
                  width:         rbSize,
                  height:        rbSize,
                  pointerEvents: field.readonly ? 'none' : 'auto',
                  cursor:        field.readonly ? 'default' : 'pointer',
                }}
              />
            </div>
          );
        }

        // ── Dropdown / listbox ──────────────────────────────────────────────
        if (field.type === 'dropdown' || field.type === 'listbox') {
          const fontSize = Math.max(8, Math.min(h * 0.65, 13));
          return (
            <select
              key={key}
              value={value}
              onChange={e => onFieldChange(field.name, e.target.value)}
              disabled={field.readonly}
              title={field.name}
              aria-label={field.name}
              size={field.type === 'listbox' ? Math.min(field.options.length, 5) : 1}
              style={{
                ...baseStyle(x, y, w, h, field.readonly),
                background:   IDLE_BG,
                border:       '1px solid transparent',
                borderRadius: 2,
                padding:      '0 2px',
                fontSize:     fontSize,
                fontFamily:   'Helvetica, Arial, sans-serif',
                color:        '#1a1a1a',
                cursor:       field.readonly ? 'default' : 'pointer',
                appearance:   'auto',
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            >
              {/* Empty option so unset fields show as blank */}
              {!field.readonly && <option value="">— select —</option>}
              {field.options.map((opt, i) => (
                <option key={i} value={opt}>{opt}</option>
              ))}
            </select>
          );
        }

        // Unknown type — render nothing
        return null;
      })}
    </div>
  );
}

export default FormOverlay;
