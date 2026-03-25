// frontend/src/components/ButtonOverlay.js
// KindPDF — Phase 1.4 extension: Push-button overlays
//
// Renders HTML buttons over the PDF canvas for every push-button widget
// found in the PDF's AcroForm.  Because KindPDF uses annotationMode: 0
// when rendering pages (to avoid double-drawing form widgets), all PDF
// annotation appearance streams — including button graphics — are
// suppressed in the main view.  This overlay draws them back as real
// HTML <button> elements so the user can see and click them.
//
// Coordinate system: same as FormOverlay — the backend normalises every
// widget rect to 0–1 fractions of the page's point dimensions.  We
// convert back to pixels: pixelX = rect.x0 * pageWidth * scale.
//
// Props:
//   buttons        — array of button objects from /api/form-fields
//   pageIndex      — 0-based index of this page
//   scale          — current render scale
//   pageDimensions — { width, height } in PDF points at scale=1
//   onButtonClick  — (button) => void  called when the user clicks a button

import React from 'react';

function ButtonOverlay({ buttons, pageIndex, scale, pageDimensions, onButtonClick }) {
  if (!buttons || !pageDimensions) return null;

  // Only the buttons that live on this page
  const pageButtons = buttons.filter(b => b.page === pageIndex);
  if (pageButtons.length === 0) return null;

  const { width: pgW, height: pgH } = pageDimensions;

  return (
    // Container fills the page exactly; pointer-events:none on the container
    // so only the individual <button> elements capture clicks.
    <div
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         pgW * scale,
        height:        pgH * scale,
        pointerEvents: 'none',
        zIndex:        31,   // one above FormOverlay (30)
      }}
      aria-label="PDF button overlay"
    >
      {pageButtons.map((btn, idx) => {
        const x = btn.rect.x0 * pgW * scale;
        const y = btn.rect.y0 * pgH * scale;
        const w = (btn.rect.x1 - btn.rect.x0) * pgW * scale;
        const h = (btn.rect.y1 - btn.rect.y0) * pgH * scale;

        // Scale font size to fit inside the button height
        const fontSize = Math.max(8, Math.min(h * 0.50, 13));

        // Choose a subtle tooltip describing what will happen
        let tooltip = '';
        if (btn.action_type === 'print') {
          tooltip = 'Print this PDF';
        } else if (btn.action_type === 'submit') {
          tooltip = `Submit form (this PDF uses email: ${btn.action_target || 'unknown'})`;
        } else if (btn.action_type === 'uri') {
          tooltip = `Open link: ${btn.action_target}`;
        } else if (btn.action_type === 'javascript') {
          tooltip = `Run script — not supported in KindPDF`;
        } else if (btn.action_type === 'named') {
          tooltip = `PDF action: ${btn.action_target}`;
        } else {
          tooltip = `Button action — KindPDF may not support this`;
        }

        return (
          <button
            key={`${btn.name}__${idx}`}
            title={tooltip}
            aria-label={btn.label || btn.name || 'PDF button'}
            onClick={() => onButtonClick(btn)}
            style={{
              position:        'absolute',
              left:            x,
              top:             y,
              width:           w,
              height:          h,
              boxSizing:       'border-box',
              pointerEvents:   'auto',
              // Mimic a basic PDF push-button appearance:
              // grey gradient matching what most PDF viewers render
              background:      'linear-gradient(180deg, #f0f0f0 0%, #d8d8d8 100%)',
              border:          '1px solid #999',
              borderRadius:    2,
              boxShadow:       '0 1px 2px rgba(0,0,0,0.25)',
              cursor:          'pointer',
              fontSize:        fontSize,
              fontFamily:      'Helvetica, Arial, sans-serif',
              fontWeight:      '600',
              color:           '#1a1a1a',
              padding:         '0 4px',
              overflow:        'hidden',
              whiteSpace:      'nowrap',
              textOverflow:    'ellipsis',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background =
                'linear-gradient(180deg, #e0e8ff 0%, #c8d8f8 100%)';
              e.currentTarget.style.borderColor = '#4a7fd4';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background =
                'linear-gradient(180deg, #f0f0f0 0%, #d8d8d8 100%)';
              e.currentTarget.style.borderColor = '#999';
            }}
            onMouseDown={e => {
              e.currentTarget.style.background =
                'linear-gradient(180deg, #c0c8e8 0%, #a8b8e0 100%)';
            }}
            onMouseUp={e => {
              e.currentTarget.style.background =
                'linear-gradient(180deg, #e0e8ff 0%, #c8d8f8 100%)';
            }}
          >
            {btn.label || btn.name}
          </button>
        );
      })}
    </div>
  );
}

export default ButtonOverlay;
