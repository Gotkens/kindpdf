// frontend/src/components/AnnotationToolbar.js
// KindPDF — Annotation Tools Toolbar
//
// Secondary toolbar with annotation tools and a full color picker.
// Design rules: every button has icon + text label, tooltip on every button.

import React from 'react';

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: 'rgba(255, 235, 59, 0.45)', solid: '#FCD34D' },
  { name: 'Green',  value: 'rgba(74, 222, 128, 0.45)', solid: '#4ADE80' },
  { name: 'Pink',   value: 'rgba(249, 168, 212, 0.55)', solid: '#F9A8D4' },
  { name: 'Blue',   value: 'rgba(147, 197, 253, 0.55)', solid: '#93C5FD' },
];

export const LINE_COLORS = [
  { name: 'Red',   value: '#ef4444' },
  { name: 'Black', value: '#1a1a1a' },
  { name: 'Blue',  value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
];

export const PEN_COLORS = [
  { name: 'Black', value: '#1a1a1a' },
  { name: 'Red',   value: '#ef4444' },
  { name: 'Blue',  value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
];

// Extract a hex color from any CSS color string (for <input type="color"> value)
function toHex(colorStr) {
  if (!colorStr) return '#000000';
  if (colorStr.startsWith('#') && colorStr.length === 7) return colorStr;
  if (colorStr.startsWith('#') && colorStr.length === 4) {
    return '#' + colorStr.slice(1).split('').map(c => c + c).join('');
  }
  const match = colorStr.match(/\d+/g);
  if (match && match.length >= 3) {
    return '#' + [match[0], match[1], match[2]]
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  return '#000000';
}

const FONT_FAMILIES = [
  { label: 'Arial',                  value: 'Arial' },
  { label: 'Helvetica',              value: 'Helvetica' },
  { label: 'Times New Roman',        value: 'Times New Roman' },
  { label: 'Georgia',                value: 'Georgia' },
  { label: 'Verdana',                value: 'Verdana' },
  { label: 'Tahoma',                 value: 'Tahoma' },
  { label: 'Trebuchet MS',           value: 'Trebuchet MS' },
  { label: 'Impact',                 value: 'Impact' },
  { label: 'Comic Sans MS',          value: 'Comic Sans MS' },
  { label: 'Courier New',            value: 'Courier New' },
  { label: 'Palatino Linotype',      value: 'Palatino Linotype' },
  { label: 'Garamond',               value: 'Garamond' },
  { label: 'Arial Black',            value: 'Arial Black' },
  { label: 'Century Gothic',         value: 'Century Gothic' },
  { label: 'Calibri',                value: 'Calibri' },
  { label: 'Cambria',                value: 'Cambria' },
  { label: 'Gill Sans MT',           value: 'Gill Sans MT' },
  { label: 'Franklin Gothic Medium', value: 'Franklin Gothic Medium' },
  { label: 'Lucida Sans',            value: 'Lucida Sans' },
  { label: 'Segoe UI',               value: 'Segoe UI' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  penSize,
  onPenSizeChange,
  eraserMode,
  onEraserModeChange,
  eraserSize,
  onEraserSizeChange,
  canUndo,
  onUndo,
  onSave,
  isSaving,
  textFontFamily,
  onTextFontFamilyChange,
  textFontSize,
  onTextFontSizeChange,
  isBold,
  onBoldChange,
  isUnderline,
  onUnderlineChange,
  hasSelectedTextBox,   // true when a text box is currently selected on the page
}) {
  const toolBtn = (tool, icon, label, tooltip) => (
    <button
      key={tool}
      onClick={() => onToolChange(activeTool === tool ? null : tool)}
      title={tooltip}
      aria-label={label}
      aria-pressed={activeTool === tool}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all select-none ${
        activeTool === tool
          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400 shadow-sm'
          : 'text-gray-700 hover:bg-white hover:shadow-sm'
      }`}
    >
      {icon}
      <span className="hidden sm:inline whitespace-nowrap">{label}</span>
    </button>
  );

  // Show text box controls whenever a text box is selected, even if no tool is active
  const showTextBoxControls = activeTool === 'textbox' || hasSelectedTextBox;

  const showHighlightColors = activeTool === 'highlight';
  const showLineColors = activeTool === 'underline' || activeTool === 'strikethrough';
  const showPenColors = activeTool === 'pen' || activeTool === 'sticky' || showTextBoxControls;

  // Is the current activeColor one of the preset colors for this tool?
  const isCustomHighlight = showHighlightColors && !HIGHLIGHT_COLORS.find(c => c.value === activeColor);
  const isCustomLine = showLineColors && !LINE_COLORS.find(c => c.value === activeColor);
  const isCustomPen = showPenColors && !PEN_COLORS.find(c => c.value === activeColor);

  // Rainbow gradient for the "More colors" button when no custom color is selected
  const rainbowGradient = 'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #8b5cf6, #ef4444)';

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center gap-1 flex-wrap shadow-sm">

      {/* ── Section label ── */}
      <span className="text-xs font-bold text-amber-700 uppercase tracking-wider mr-1 hidden lg:block">
        Annotate
      </span>
      <div className="w-px h-5 bg-amber-300 mx-1 hidden lg:block" aria-hidden="true" />

      {/* ── Highlight ── */}
      {toolBtn(
        'highlight',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          <rect x="6.5" y="8.5" width="6" height="2" opacity="0.6"/>
        </svg>,
        'Highlight',
        'Click and drag to highlight text in color. Use the Erase tool to remove highlights.'
      )}

      {/* ── Underline ── */}
      {toolBtn(
        'underline',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
        </svg>,
        'Underline',
        'Move your cursor over words to add an underline'
      )}

      {/* ── Strikethrough ── */}
      {toolBtn(
        'strikethrough',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6.85 7.08C6.85 4.37 9.45 3 12.24 3c1.64 0 3 .49 3.9 1.28.77.65 1.46 1.68 1.46 3.01h-2.85c0-.57-.17-1.03-.5-1.41-.5-.62-1.31-.93-2.02-.93-1.96 0-2.39.92-2.39 1.59 0 .42.15.78 1.01 1.06.41.14.99.29 1.72.44H4v2h16v-2h-1.73z"/>
          <path d="M13 18.96V21h-2v-2.1c-1.43-.3-2.7-1.1-3.5-2.3L9.5 17c.7 1.05 1.9 1.7 3.5 1.7 1.4 0 2.5-.65 2.5-1.7 0-.65-.4-1.15-1-1.5H17c.6.85.85 1.8.85 2.76C17.85 20.5 15.5 22 12.5 22c-2.05 0-3.95-.95-5-2.5L9 18.96z"/>
          <rect x="3" y="11" width="18" height="2"/>
        </svg>,
        'Cross Out',
        'Move your cursor over words to draw a line through them'
      )}

      <div className="w-px h-5 bg-amber-300 mx-1" aria-hidden="true" />

      {/* ── Sticky Note ── */}
      {toolBtn(
        'sticky',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h8l6-6V4a2 2 0 00-2-2z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="11" y2="17"/>
        </svg>,
        'Add Note',
        'Click anywhere on the page to add a sticky comment note'
      )}

      {/* ── Text Box ── */}
      {toolBtn(
        'textbox',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>,
        'Add Text',
        'Click anywhere to type text directly on the page'
      )}

      <div className="w-px h-5 bg-amber-300 mx-1" aria-hidden="true" />

      {/* ── Pen / Draw ── */}
      {toolBtn(
        'pen',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>,
        'Draw',
        'Draw freehand lines and shapes on the page'
      )}

      {/* Pen size slider */}
      {activeTool === 'pen' && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-amber-200 shadow-sm">
          <span className="text-xs text-amber-700 font-medium hidden sm:block">Size:</span>
          <input type="range" min="1" max="20" value={penSize}
            onChange={e => onPenSizeChange(Number(e.target.value))}
            className="w-16 accent-blue-600" title="Adjust pen line thickness" aria-label="Pen size" />
          <span className="text-xs font-medium text-gray-600 w-5 text-center">{penSize}</span>
        </div>
      )}

      {/* Font family + size + bold + underline — visible when Add Text tool is active OR a text box is selected */}
      {showTextBoxControls && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-amber-200 shadow-sm flex-wrap">
          <span className="text-xs text-amber-700 font-medium hidden sm:block">
            {hasSelectedTextBox && activeTool !== 'textbox' ? 'Selected text:' : 'Font:'}
          </span>
          <select
            value={textFontFamily}
            onChange={e => onTextFontFamilyChange(e.target.value)}
            title="Choose a font style for your text"
            aria-label="Font family"
            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {FONT_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={textFontSize}
            onChange={e => onTextFontSizeChange(Number(e.target.value))}
            title="Choose the text size in points"
            aria-label="Font size"
            className="text-xs border border-gray-200 rounded px-1 py-0.5 w-14 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {FONT_SIZES.map(s => (
              <option key={s} value={s}>{s} pt</option>
            ))}
          </select>
          {/* Bold toggle */}
          <button
            onClick={() => onBoldChange(!isBold)}
            title="Make the text bold"
            aria-label="Bold"
            aria-pressed={isBold}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm font-bold transition-colors ${
              isBold ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            B
          </button>
          {/* Underline toggle */}
          <button
            onClick={() => onUnderlineChange(!isUnderline)}
            title="Underline the text"
            aria-label="Underline"
            aria-pressed={isUnderline}
            className={`w-7 h-7 flex items-center justify-center rounded text-sm font-medium underline transition-colors ${
              isUnderline ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            U
          </button>
        </div>
      )}

      <div className="w-px h-5 bg-amber-300 mx-1" aria-hidden="true" />

      {/* ── Eraser ── */}
      {toolBtn(
        'eraser',
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20 20H7L3 16l13-13 6 6-2 11z"/>
          <path d="M6 17l5-5"/>
        </svg>,
        'Erase',
        'Remove annotations from the page'
      )}

      {/* Eraser mode + size */}
      {activeTool === 'eraser' && (
        <div className="flex items-center gap-1 bg-white rounded-lg border border-amber-200 shadow-sm px-1 py-0.5">
          <button onClick={() => onEraserModeChange('brush')}
            title="Removes the entire annotation you click on"
            aria-pressed={eraserMode === 'brush'}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${eraserMode === 'brush' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            Whole
          </button>
          <button onClick={() => onEraserModeChange('fine')}
            title="Erases pixels within the circular area — works on highlights, underlines, and drawings. A circle shows the erase area."
            aria-pressed={eraserMode === 'fine'}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${eraserMode === 'fine' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            Fine
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <input type="range" min="5" max="60" value={eraserSize}
            onChange={e => onEraserSizeChange(Number(e.target.value))}
            className="w-14 accent-blue-600" title="Adjust eraser size" aria-label="Eraser size" />
        </div>
      )}

      <div className="w-px h-5 bg-amber-300 mx-1" aria-hidden="true" />

      {/* ── Color palette — changes based on active tool ── */}

      {showHighlightColors && (
        <div className="flex items-center gap-1" role="group" aria-label="Highlight color">
          <span className="text-xs text-amber-700 font-medium hidden sm:block mr-0.5">Color:</span>
          {HIGHLIGHT_COLORS.map(c => (
            <button key={c.value} onClick={() => onColorChange(c.value)}
              title={`${c.name} highlight`} aria-label={`${c.name} highlight`} aria-pressed={activeColor === c.value}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0 ${activeColor === c.value ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
              style={{ backgroundColor: c.solid }} />
          ))}
          {/* Full color picker */}
          <label
            title="Choose any custom highlight color"
            aria-label="Custom color"
            className={`w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden flex-shrink-0 transition-all hover:scale-110 ${isCustomHighlight ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
            style={{ background: isCustomHighlight ? activeColor : rainbowGradient }}
          >
            <input type="color" className="opacity-0 w-0 h-0 absolute" value={toHex(activeColor)}
              onChange={e => onColorChange(e.target.value)} aria-hidden="true" tabIndex="-1" />
          </label>
        </div>
      )}

      {showLineColors && (
        <div className="flex items-center gap-1" role="group" aria-label="Line color">
          <span className="text-xs text-amber-700 font-medium hidden sm:block mr-0.5">Color:</span>
          {LINE_COLORS.map(c => (
            <button key={c.value} onClick={() => onColorChange(c.value)}
              title={c.name} aria-label={`${c.name} line color`} aria-pressed={activeColor === c.value}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0 ${activeColor === c.value ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
              style={{ backgroundColor: c.value }} />
          ))}
          <label
            title="Choose any custom color"
            aria-label="Custom color"
            className={`w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden flex-shrink-0 transition-all hover:scale-110 ${isCustomLine ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
            style={{ background: isCustomLine ? activeColor : rainbowGradient }}
          >
            <input type="color" className="opacity-0 w-0 h-0 absolute" value={toHex(activeColor)}
              onChange={e => onColorChange(e.target.value)} aria-hidden="true" tabIndex="-1" />
          </label>
        </div>
      )}

      {showPenColors && (
        <div className="flex items-center gap-1" role="group" aria-label="Drawing color">
          <span className="text-xs text-amber-700 font-medium hidden sm:block mr-0.5">Color:</span>
          {PEN_COLORS.map(c => (
            <button key={c.value} onClick={() => onColorChange(c.value)}
              title={c.name} aria-label={`${c.name} color`} aria-pressed={activeColor === c.value}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0 ${activeColor === c.value ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
              style={{ backgroundColor: c.value }} />
          ))}
          {/* Full color picker — the rainbow circle opens the native color picker */}
          <label
            title="Choose any color from the full color palette"
            aria-label="More colors"
            className={`w-6 h-6 rounded-full border-2 cursor-pointer overflow-hidden flex-shrink-0 transition-all hover:scale-110 ${isCustomPen ? 'border-gray-700 scale-110 shadow-sm' : 'border-gray-300 hover:border-gray-500'}`}
            style={{ background: isCustomPen ? activeColor : rainbowGradient }}
          >
            <input type="color" className="opacity-0 w-0 h-0 absolute"
              value={toHex(activeColor)}
              onChange={e => onColorChange(e.target.value)}
              aria-hidden="true" tabIndex="-1" />
          </label>
        </div>
      )}

      {/* ── Spacer ── */}
      <div className="flex-1" aria-hidden="true" />

      {/* ── Undo ── */}
      <button
        onClick={onUndo} disabled={!canUndo}
        title="Undo the last annotation you added (Ctrl+Z)"
        aria-label="Undo last annotation"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${canUndo ? 'text-gray-700 hover:bg-white hover:shadow-sm' : 'text-gray-300 cursor-not-allowed'}`}
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 7v6h6"/>
          <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
        </svg>
        <span className="hidden sm:inline">Undo</span>
      </button>

      {/* ── Save As ── */}
      <button
        onClick={onSave} disabled={isSaving}
        title="Save your annotations into the PDF — opens a Save As dialog to choose where to save"
        aria-label="Save annotated PDF"
        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        <span>{isSaving ? 'Saving...' : 'Save As...'}</span>
      </button>

    </div>
  );
}
