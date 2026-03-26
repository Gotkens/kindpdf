// frontend/src/components/PDFViewer.js
// KindPDF — Main PDF viewer component with annotation tools.
//
// Canvas layer architecture per page:
//   1. pdf-canvas-{n}        — rendered PDF (never touched after render)
//   2. search-overlay-{n}    — search highlights (pointer-events: none)
//   3. annotation-canvas-{n} — user annotations (pointer-events: auto when tool active)
//
// Annotations stored as data objects, coordinates normalized to scale=1.
// Undo uses past/present snapshot pattern.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import AnnotationToolbar, { HIGHLIGHT_COLORS, LINE_COLORS } from './AnnotationToolbar';
import StickyNoteOverlay from './StickyNoteOverlay';
import TextBoxOverlay from './TextBoxOverlay';
import SignatureModal from './SignatureModal';
import SignatureOverlay from './SignatureOverlay';
import MergeModal from './MergeModal';
import PasswordModal from './PasswordModal';
import FormOverlay    from './FormOverlay';
import ButtonOverlay  from './ButtonOverlay';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ============================================================
// UTILITY FUNCTIONS (pure, defined outside component)
// ============================================================

// ── Form calculation helpers (Phase 1.4 patch) ──────────────────────────────
//
// Parses the Acrobat JS calculation scripts that PDF widgets carry.
// Two formats appear in the wild — both are handled:
//
//  1. Standard AFSimple_Calculate (simple PDFs):
//       AFSimple_Calculate("PRD", new Array("qty", "unit_price"))
//
//  2. Custom event.value / getField pattern (most real-world order forms):
//       event.value = AFMakeNumber(getField("QuantityRow1").value)
//                   * AFMakeNumber(getField("UnitPriceRow1").value)
//     or summing several fields:
//       event.value = AFMakeNumber(getField("fill_48").value)
//                   + AFMakeNumber(getField("fill_49").value) + ...
//
// The calculation runs client-side in a useEffect so computed fields update
// live as the user types, with no Acrobat or server-side JS engine needed.

function parseCalcScript(script) {
  if (!script || typeof script !== 'string') return null;

  // ── Format 1: AFSimple_Calculate ────────────────────────────────────────
  const simple = script.match(
    /AFSimple_Calculate\s*\(\s*["'](\w+)["']\s*,\s*new\s+Array\s*\(([^)]*)\)/i
  );
  if (simple) {
    const op = simple[1].toUpperCase();
    const sourceFields = [...simple[2].matchAll(/["']([^"']+)["']/g)].map(r => r[1]);
    if (sourceFields.length) return { op, sourceFields };
  }

  // ── Format 2: event.value = ... getField("name").value ... ──────────────
  // Extract all referenced field names, preserving order.
  const fieldRefs = [...script.matchAll(/getField\s*\(\s*["']([^"']+)["']\s*\)/g)]
    .map(m => m[1]);
  if (!fieldRefs.length) return null;

  // Infer the operator by looking at what's between the AFMakeNumber() calls.
  // Replace each AFMakeNumber(...) with a placeholder so we can read the operators.
  const skeleton = script.replace(/AFMakeNumber\s*\([^)]+\)/g, 'X');
  const hasMul  = skeleton.includes('*');
  const hasPlus = skeleton.includes('+');

  const op = (hasMul && !hasPlus) ? 'PRD' : 'SUM';  // default to SUM for + or unknown
  return { op, sourceFields: fieldRefs };
}

function runCalcOp(op, nums) {
  if (!nums.length) return '';
  switch (op) {
    case 'SUM': return nums.reduce((a, b) => a + b, 0);
    case 'PRD': return nums.reduce((a, b) => a * b, 1);
    case 'AVG': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'MIN': return Math.min(...nums);
    case 'MAX': return Math.max(...nums);
    default:    return '';
  }
}

// Format a calculation result: strip unnecessary trailing decimals,
// show up to 2 decimal places (e.g. "5.00" → "5", "5.10" → "5.1", "5.123" → "5.12").
function formatCalcResult(result) {
  if (result === '' || result === null || result === undefined) return '';
  const n = Number(result);
  if (!Number.isFinite(n)) return '';
  // Round to 2 dp then trim trailing zeros
  return parseFloat(n.toFixed(2)).toString();
}

// Shortest distance from point (px,py) to line segment (ax,ay)-(bx,by).
// Used by the fine eraser to detect proximity to stroke segments.
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Draw a single annotation onto a canvas context (all coords stored normalized, drawn at currentScale).
function drawSingleAnnotation(ctx, ann, currentScale) {
  if (!ann || !ann.type) return;
  ctx.save();

  switch (ann.type) {

    case 'highlight': {
      ctx.fillStyle = ann.color || 'rgba(255, 235, 59, 0.45)';
      (ann.rects || []).forEach(r => {
        ctx.fillRect(r.x * currentScale, r.y * currentScale, r.w * currentScale, r.h * currentScale);
      });
      break;
    }

    case 'underline': {
      ctx.strokeStyle = ann.color || '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      (ann.rects || []).forEach(r => {
        ctx.beginPath();
        ctx.moveTo(r.x * currentScale, (r.y + r.h) * currentScale);
        ctx.lineTo((r.x + r.w) * currentScale, (r.y + r.h) * currentScale);
        ctx.stroke();
      });
      break;
    }

    case 'strikethrough': {
      ctx.strokeStyle = ann.color || '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      (ann.rects || []).forEach(r => {
        ctx.beginPath();
        ctx.moveTo(r.x * currentScale, (r.y + r.h * 0.55) * currentScale);
        ctx.lineTo((r.x + r.w) * currentScale, (r.y + r.h * 0.55) * currentScale);
        ctx.stroke();
      });
      break;
    }

    case 'pen': {
      const pts = ann.points || [];
      if (pts.length < 2) break;
      ctx.strokeStyle = ann.color || '#1a1a1a';
      ctx.lineWidth = (ann.width || 2) * currentScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x * currentScale, pts[0].y * currentScale);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * currentScale, pts[i].y * currentScale);
      }
      ctx.stroke();
      break;
    }

    case 'textbox': {
      const fontSize = (ann.fontSize || 14) * currentScale;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = ann.color || '#1a1a1a';
      const lines = (ann.text || '').split('\n');
      const lineHeight = fontSize * 1.4;
      lines.forEach((line, i) => {
        ctx.fillText(line, ann.x * currentScale, ann.y * currentScale + i * lineHeight);
      });
      break;
    }

    case 'sticky': {
      const sx = ann.x * currentScale;
      const sy = ann.y * currentScale;
      const padding = 8 * currentScale;
      const fontSize = 12 * currentScale;
      const lineHeight = fontSize * 1.4;

      ctx.font = `${fontSize}px sans-serif`;
      const lines = (ann.text || '(empty note)').split('\n');
      const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width), 60 * currentScale);
      const boxW = maxLineWidth + padding * 2;
      const headerH = 18 * currentScale;
      const boxH = headerH + lines.length * lineHeight + padding;

      ctx.fillStyle = 'rgba(254, 249, 195, 0.97)';
      ctx.fillRect(sx, sy, boxW, boxH);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, boxW, boxH);

      ctx.fillStyle = 'rgba(253, 230, 138, 0.9)';
      ctx.fillRect(sx, sy, boxW, headerH);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy + headerH);
      ctx.lineTo(sx + boxW, sy + headerH);
      ctx.stroke();

      ctx.fillStyle = '#92400e';
      ctx.font = `bold ${10 * currentScale}px sans-serif`;
      ctx.fillText('NOTE', sx + 4 * currentScale, sy + headerH - 4 * currentScale);

      ctx.fillStyle = '#1c1917';
      ctx.font = `${fontSize}px sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillText(line, sx + padding * 0.5, sy + headerH + padding * 0.5 + (i + 1) * lineHeight);
      });
      break;
    }

    default: break;
  }
  ctx.restore();
}

// Merge individual word-level rects into continuous line spans.
// Words on the same line (similar y & h) are merged from leftmost to rightmost x,
// filling the gaps between words so highlighting looks solid and continuous.
function mergeRectsIntoLines(rects) {
  if (!rects || rects.length === 0) return rects;
  // Sort: top-to-bottom, then left-to-right within each line
  const sorted = [...rects].sort((a, b) => {
    const yDiff = a.y - b.y;
    return Math.abs(yDiff) < 4 ? a.x - b.x : yDiff;
  });
  const merged = [];
  let cur = null;
  for (const r of sorted) {
    if (!cur || Math.abs(r.y - cur.y) > 4 || Math.abs(r.h - cur.h) > 4) {
      // New line
      cur = { x: r.x, y: r.y, w: r.w, h: r.h };
      merged.push(cur);
    } else {
      // Same line — extend to cover this word
      const right = Math.max(cur.x + cur.w, r.x + r.w);
      cur.x = Math.min(cur.x, r.x);
      cur.w = right - cur.x;
    }
  }
  return merged;
}

// Module-level reusable canvas for highlight rendering (avoids creating DOM elements on every draw).
let _hlTempCanvas = null;

// Redraw all annotations for a page.
// Highlights use an offscreen canvas technique so that multiple overlapping passes
// render at a fixed opacity (binary: either highlighted or not). This prevents the
// "each extra pass darkens the highlight" problem.
// Sticky and textbox are rendered as HTML overlays — skip them here.
function drawAnnotationsOnCanvas(ctx, pageAnnotations, currentScale) {
  if (!pageAnnotations || pageAnnotations.length === 0) return;

  // ── Highlights: collect all rects per color, render on temp canvas, composite once ──
  const hlByColor = new Map();
  pageAnnotations.forEach(ann => {
    if (ann.type === 'highlight') {
      const col = ann.color || 'rgba(255,235,59,0.45)';
      if (!hlByColor.has(col)) hlByColor.set(col, []);
      hlByColor.get(col).push(...(ann.rects || []));
    }
  });

  if (hlByColor.size > 0 && ctx.canvas.width > 0 && ctx.canvas.height > 0) {
    // Create (or resize) the temp canvas
    if (!_hlTempCanvas) _hlTempCanvas = document.createElement('canvas');
    if (_hlTempCanvas.width !== ctx.canvas.width)  _hlTempCanvas.width  = ctx.canvas.width;
    if (_hlTempCanvas.height !== ctx.canvas.height) _hlTempCanvas.height = ctx.canvas.height;
    const tempCtx = _hlTempCanvas.getContext('2d');

    hlByColor.forEach((rects, color) => {
      // Parse the target alpha out of the rgba string; draw as fully opaque on temp canvas
      const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      let rgbColor = color;
      let targetAlpha = 1.0;
      if (rgbaMatch) {
        rgbColor = `rgb(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]})`;
        targetAlpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0;
      }
      tempCtx.clearRect(0, 0, _hlTempCanvas.width, _hlTempCanvas.height);
      tempCtx.fillStyle = rgbColor;
      rects.forEach(r => {
        tempCtx.fillRect(r.x * currentScale, r.y * currentScale, r.w * currentScale, r.h * currentScale);
      });
      // Composite the temp canvas onto the main canvas at the desired highlight opacity.
      // Because we drew fully opaque on the temp canvas first, overlapping passes from
      // multiple annotations produce the same opacity as a single pass — true binary behavior.
      ctx.save();
      ctx.globalAlpha = targetAlpha;
      ctx.drawImage(_hlTempCanvas, 0, 0);
      ctx.restore();
    });
  }

  // ── All other annotations (skip sticky and textbox — they are HTML overlays) ──
  pageAnnotations.forEach(ann => {
    if (ann.type === 'sticky' || ann.type === 'textbox' || ann.type === 'highlight') return;
    drawSingleAnnotation(ctx, ann, currentScale);
  });
}

// Check if eraser cursor hits an annotation (for "Whole" brush mode).
function annotationHitTest(ann, normX, normY, normRadius) {
  switch (ann.type) {
    case 'highlight':
    case 'underline':
    case 'strikethrough':
      return (ann.rects || []).some(r =>
        normX >= r.x - normRadius && normX <= r.x + r.w + normRadius &&
        normY >= r.y - normRadius && normY <= r.y + r.h + normRadius
      );
    case 'pen':
      return (ann.points || []).some(p => Math.hypot(p.x - normX, p.y - normY) <= normRadius * 2);
    case 'textbox':
    case 'sticky':
      return normX >= ann.x - normRadius && normX <= ann.x + 200 + normRadius &&
             normY >= ann.y - 30 - normRadius && normY <= ann.y + 100 + normRadius;
    default: return false;
  }
}


// ============================================================
// COMPONENT
// ============================================================

export default function PDFViewer({ pdfUrl, pdfName, pdfFilename, onClose }) {

  // ── Internal copies of props so that merge can reload the PDF without
  //    requiring the parent (App.js) to change. After a merge the viewer
  //    updates activePdfUrl/activePdfFilename to point at the merged file.
  const [activePdfUrl,      setActivePdfUrl]      = useState(pdfUrl);
  const [activePdfFilename, setActivePdfFilename] = useState(pdfFilename);

  // Sync internal URL/filename if parent prop changes (e.g. user opens new file)
  useEffect(() => { setActivePdfUrl(pdfUrl);           }, [pdfUrl]);
  useEffect(() => { setActivePdfFilename(pdfFilename); }, [pdfFilename]);

  // --- Core viewer state ---
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Phase 1.6: PDF open-password prompt ──────────────────────────────────
  //
  // When PDF.js encounters a password-protected PDF it calls loadingTask.onPassword.
  // We store the updatePassword callback here so the user can type a password and
  // we can pass it back to PDF.js to retry opening.
  //
  // pdfOpenPasswordCallback — the updatePassword fn supplied by PDF.js, or null when no prompt
  // pdfOpenPasswordError    — true when the last attempt used the wrong password
  // pdfOpenPasswordValue    — controlled input value for the prompt
  const [pdfOpenPasswordCallback, setPdfOpenPasswordCallback] = useState(null);
  const [pdfOpenPasswordError,    setPdfOpenPasswordError]    = useState(false);
  const [pdfOpenPasswordValue,    setPdfOpenPasswordValue]    = useState('');

  // ── Phase 1.5: Page management state ─────────────────────────────────────
  //
  // pageHistory uses the same past/present/future undo pattern as annotationHistory.
  //   present.pageOrder    — array of original 1-based page numbers in display order.
  //                          Deletions are reflected as missing entries.
  //   present.pageRotations — { origPageNum: additionalDegrees } — additional rotation
  //                           (0 / 90 / 180 / 270) applied at save time via PyMuPDF.
  //                           Thumbnails + main render also apply this visually.
  const EMPTY_PAGE_STATE = { pageOrder: [], pageRotations: {} };
  const [pageHistory, setPageHistory] = useState({
    past: [], present: EMPTY_PAGE_STATE, future: []
  });

  // Convenience aliases
  const pageOrder     = pageHistory.present.pageOrder;
  const pageRotations = pageHistory.present.pageRotations;
  const canPageUndo   = pageHistory.past.length > 0;
  const canPageRedo   = pageHistory.future.length > 0;

  // Whether the sidebar is in page management mode
  const [pageManagementMode, setPageManagementMode] = useState(false);

  // Set of original page numbers checked for extraction
  const [selectedPages, setSelectedPages] = useState(new Set());

  // Whether the Merge PDF modal is open
  const [mergeModalOpen, setMergeModalOpen] = useState(false);

  // Whether the Password Settings modal is open (Phase 1.6)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // ── Phase 1.4: Form filling ────────────────────────────────────────────────
  //
  // formFields    — null = not yet checked; [] = PDF has no fillable fields;
  //                 [...] = array of field objects from /api/form-fields
  // formValues    — controlled state: { fieldName: currentValue }
  //                 seeded from each field's existing PDF value on load,
  //                 updated live as the user types / checks / selects.
  //                 Included in the Save As PDF payload so values are written
  //                 as live (non-flattened) AcroForm fields → editable on re-open.
  // hasCalculations — true when any field has a script_calc string.
  //                 When true: a banner is shown and a useEffect re-runs
  //                 AFSimple_Calculate logic whenever formValues changes.
  // xfaBanner     — true when the PDF is XFA-only (shows the warning banner)
  // pageDimensions— { [pageNum]: { width, height } } in PDF points at scale=1.
  //                 Used by FormOverlay to convert normalised 0–1 rects back
  //                 to pixel positions at any zoom level.
  const [formFields,       setFormFields]       = useState(null);
  const [formValues,       setFormValues]       = useState({});
  const [hasCalculations,  setHasCalculations]  = useState(false);
  const [xfaBanner,        setXfaBanner]        = useState(false);
  const [pageDimensions,   setPageDimensions]   = useState({});

  // pdfButtons — push-button widgets extracted from AcroForm.
  // Rendered by ButtonOverlay as HTML buttons over the page canvas.
  // null = not yet fetched; [] = PDF has no buttons; [...] = button list.
  const [pdfButtons,       setPdfButtons]       = useState(null);

  // buttonModal — controls the honest "what this button would do" dialog.
  // null = closed; { btn } = open and showing info about `btn`.
  const [buttonModal,      setButtonModal]      = useState(null);

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [allMatches, setAllMatches] = useState([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  // ── Phase 1.4 patch: Form calculation engine ──────────────────────────────
  // Whenever formValues changes (user types in a source field), re-run all
  // AFSimple_Calculate scripts and update formValues for every calculated field.
  // Calculated fields are identified by having a non-null script_calc string.
  //
  // To avoid an infinite update loop, values are only set when they differ from
  // the current computed result — so the effect settles in at most two renders.
  useEffect(() => {
    if (!formFields || !hasCalculations) return;

    // Build { calculatedFieldName: { op, sourceFields } } from the fields list.
    // This is cheap to rebuild on each effect run (field list is stable).
    const calcMap = {};
    formFields.forEach(f => {
      if (f.script_calc) {
        const parsed = parseCalcScript(f.script_calc);
        if (parsed) calcMap[f.name] = parsed;
      }
    });
    if (!Object.keys(calcMap).length) return;

    const updates = {};
    for (const [fieldName, { op, sourceFields }] of Object.entries(calcMap)) {
      const nums = sourceFields.map(src => {
        const raw = formValues[src];
        const n   = parseFloat(raw);
        return Number.isFinite(n) ? n : 0;
      });
      const result  = runCalcOp(op, nums);
      const display = formatCalcResult(result);
      // Only update if the stored value differs from the newly computed one.
      if ((formValues[fieldName] ?? '') !== display) {
        updates[fieldName] = display;
      }
    }

    if (Object.keys(updates).length > 0) {
      setFormValues(prev => ({ ...prev, ...updates }));
    }
  }, [formValues, formFields, hasCalculations]);

  // --- Annotation state (past/present/future pattern for undo + redo) ---
  const [annotationHistory, setAnnotationHistory] = useState({ past: [], present: {}, future: [] });

  // Annotation tool settings
  const [activeTool, setActiveTool] = useState(null);
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [penSize, setPenSize] = useState(3);
  const [eraserMode, setEraserMode] = useState('brush');
  const [eraserSize, setEraserSize] = useState(20);
  const [isSaving, setIsSaving] = useState(false);

  // Text box font settings
  const [textFontFamily, setTextFontFamily] = useState('Arial');
  const [textFontSize, setTextFontSize] = useState(14);
  const [isBold, setIsBold] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const textFontFamilyRef = useRef('Arial');
  const textFontSizeRef = useRef(14);
  const isBoldRef = useRef(false);
  const isUnderlineRef = useRef(false);

  // Selected text box — { pageNum, id } — drives toolbar values
  const [selectedTextBox, setSelectedTextBox] = useState(null);
  // ID of the most recently placed text box (starts in edit mode)
  const [newTextBoxId, setNewTextBoxId] = useState(null);

// Which sticky note (by id) should open in edit mode — set when user clicks
// an existing note while the sticky tool is active. Resets after the overlay handles it.
const [openStickyId, setOpenStickyId] = useState(null);

  // ── Signature state ──────────────────────────────────────────────────────
  // signatureModalOpen: shows the 3-step signature creation wizard
  // pendingSignature: holds { dataUrl, width, height } while the user is picking
  //   where to place it on the page. Cleared after placement.
  const [signatureModalOpen, setSignatureModalOpen]   = useState(false);
  const [pendingSignature, setPendingSignature]       = useState(null);
  // Ref mirror — lets handleAnnotationMouseDown (a useCallback) access pendingSignature
  // without needing it in its dependency array (avoids re-binding on every render).
  const pendingSignatureRef = useRef(null);
  useEffect(() => { pendingSignatureRef.current = pendingSignature; }, [pendingSignature]);

  // Active text input overlay (sticky note only)
  const [activeInput, setActiveInput] = useState(null);

  // --- Core refs ---
  const pageRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const renderTasksRef = useRef({});

  // --- Annotation / drawing refs ---
  const annotationsRef = useRef({});           // mirrors annotationHistory.present
  const scaleRef = useRef(scale);              // mirrors scale
  const activeColorRef = useRef(activeColor);  // mirrors activeColor (for use in stable callbacks)
  const penSizeRef = useRef(penSize);          // mirrors penSize
  const eraserModeRef = useRef(eraserMode);    // mirrors eraserMode (avoids stale closures)
  const eraserSizeRef = useRef(eraserSize);    // mirrors eraserSize (avoids stale closures)
  const activeInputRef = useRef(null);         // mirrors activeInput (fixes stale closure in blur handler)
  const applyEraserRef = useRef(null);         // always points to latest applyEraser function
  const isDrawingRef = useRef(false);
  const activePageRef = useRef(null);
  const currentStrokeRef = useRef([]);
  // For range-based text selection (replaces accumulation approach):
  const selectionStartRef = useRef(null);      // { canvasX, canvasY } when mouse button pressed
  const textContentCacheRef = useRef({});       // PDF.js text content per page
  const pageViewportsRef = useRef({});          // PDF.js viewport per page (updated on each render)

  // Keep mirrors in sync
  useEffect(() => { annotationsRef.current = annotationHistory.present; }, [annotationHistory]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { penSizeRef.current = penSize; }, [penSize]);
  useEffect(() => { eraserModeRef.current = eraserMode; }, [eraserMode]);
  useEffect(() => { eraserSizeRef.current = eraserSize; }, [eraserSize]);
  useEffect(() => { activeInputRef.current = activeInput; }, [activeInput]);
  useEffect(() => { textFontFamilyRef.current = textFontFamily; }, [textFontFamily]);
  useEffect(() => { textFontSizeRef.current = textFontSize; }, [textFontSize]);
  useEffect(() => { isBoldRef.current = isBold; }, [isBold]);
  useEffect(() => { isUnderlineRef.current = isUnderline; }, [isUnderline]);

  const annotations = annotationHistory.present;


  // ============================================================
  // PDF LOADING
  // ============================================================

  useEffect(() => {
    if (!activePdfUrl) return;
    setIsLoading(true);
    setError(null);
    textContentCacheRef.current = {};
    pageViewportsRef.current = {};

    // Reset page management state whenever a new PDF loads
    setPageHistory({ past: [], present: EMPTY_PAGE_STATE, future: [] });
    setSelectedPages(new Set());
    setPageManagementMode(false);

    let cancelled = false;

    // Reset any leftover password-prompt state from a previous file
    setPdfOpenPasswordCallback(null);
    setPdfOpenPasswordError(false);
    setPdfOpenPasswordValue('');

    // Reset form-filling and button state from any previously open file
    setFormFields(null);
    setFormValues({});
    setPdfButtons(null);
    setButtonModal(null);
    setHasCalculations(false);
    setXfaBanner(false);
    setPageDimensions({});

    const loadingTask = pdfjsLib.getDocument(activePdfUrl);

    // ── Handle password-protected PDFs ──────────────────────────────────────
    // PDF.js calls this whenever a password is needed (first attempt) or was
    // wrong (subsequent attempt). We surface a prompt instead of the generic
    // "damaged file" error screen. Once the user types a password and submits
    // we call updatePassword() and PDF.js retries automatically.
    loadingTask.onPassword = (updatePassword, reason) => {
      if (cancelled) return;
      const isWrong = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
      setPdfOpenPasswordError(isWrong);
      setPdfOpenPasswordValue('');
      // Store the callback — calling it will resume PDF.js's open attempt
      setPdfOpenPasswordCallback(() => updatePassword);
      // Make sure the loading spinner is hidden so the prompt is visible
      setIsLoading(false);
    };

    loadingTask.promise
      .then(async doc => {
        if (cancelled) return;
        // Password was accepted (or file was not protected) — dismiss any prompt
        setPdfOpenPasswordCallback(null);
        setPdfOpenPasswordError(false);
        setPdfOpenPasswordValue('');
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);

        // ── Initialize pageOrder to [1, 2, 3, … N] in original document order ──
        const initialOrder = Array.from({ length: doc.numPages }, (_, i) => i + 1);
        setPageHistory({
          past:    [],
          present: { pageOrder: initialOrder, pageRotations: {} },
          future:  [],
        });

        // ── Annotation round-trip: load existing native PDF annotations ──
        // After the PDF is ready, ask the backend to read any native annotation
        // objects that were previously saved (e.g. sticky notes saved by KindPDF,
        // or annotations added in Acrobat / Preview). If any come back, seed the
        // annotation history so they appear as fully editable annotations immediately.
        // A fetch failure is silently ignored — the PDF simply opens clean.
        if (activePdfFilename) {
          try {
            const res = await fetch(
              `/api/annotations/${encodeURIComponent(activePdfFilename)}`
            );
            if (cancelled) return;
            if (res.ok) {
              const loaded = await res.json();
              if (cancelled) return;
              if (Array.isArray(loaded) && loaded.length > 0) {
                // Group annotations by 1-based page number to match annotationHistory.present
                // format: { pageNum: [annotation, annotation, ...] }
                const grouped = {};
                loaded.forEach(ann => {
                  const p = ann.page;
                  if (!grouped[p]) grouped[p] = [];
                  grouped[p].push(ann);
                });
                setAnnotationHistory({ past: [], present: grouped, future: [] });
              }
            }
          } catch (err) {
            // Silently ignore — the PDF opens clean if annotations can't be loaded
            console.warn('KindPDF: could not load saved annotations:', err);
          }
        }

        // ── Phase 1.4: Page dimensions + form fields ───────────────────────
        // Collect the natural (scale=1, rotation=0) dimensions for every page.
        // FormOverlay multiplies these by the current scale to convert the
        // backend's normalised 0–1 rects into pixel positions.
        const dims = {};
        for (let i = 1; i <= doc.numPages; i++) {
          try {
            const pg = await doc.getPage(i);
            const vp = pg.getViewport({ scale: 1, rotation: 0 });
            dims[i] = { width: vp.width, height: vp.height };
          } catch (_) { /* skip — FormOverlay silently skips pages without dims */ }
        }
        if (!cancelled) setPageDimensions(dims);

        // Fetch form field and button definitions from the backend.
        // Failures are silently ignored — the PDF just opens without form mode.
        if (activePdfFilename && !cancelled) {
          try {
            const formRes = await fetch(
              `/api/form-fields/${encodeURIComponent(activePdfFilename)}`
            );
            if (!cancelled && formRes.ok) {
              const formData = await formRes.json();
              if (!cancelled) {
                if (formData.xfa) {
                  // XFA dynamic form — show warning banner, no overlay
                  setXfaBanner(true);
                  setPdfButtons([]);
                } else {
                  // New response shape: { fields: [...], buttons: [...] }
                  // We also accept the old shape (plain array) for safety.
                  const fieldsArr  = Array.isArray(formData)
                    ? formData                         // legacy
                    : (formData.fields  || []);
                  const buttonsArr = Array.isArray(formData)
                    ? []                               // legacy — no buttons
                    : (formData.buttons || []);

                  // ── Fillable fields ──
                  setFormFields(fieldsArr.length > 0 ? fieldsArr : []);
                  if (fieldsArr.length > 0) {
                    // Seed formValues from each field's existing PDF value so
                    // pre-filled forms (and re-opened saved forms) show their
                    // current content immediately.
                    const initial = {};
                    fieldsArr.forEach(f => { initial[f.name] = f.value ?? ''; });
                    setFormValues(initial);
                    // Detect calculated fields — any field with a script_calc string
                    setHasCalculations(fieldsArr.some(f => !!f.script_calc));
                  }

                  // ── Push-buttons ──
                  setPdfButtons(buttonsArr);
                }
              }
            }
          } catch (err) {
            console.warn('KindPDF: could not load form fields:', err);
          }
        }
      })
      .catch(err => {
        if (cancelled) return;
        // If onPassword is currently showing a prompt, the promise rejects when the
        // user cancels (we call updatePassword with an empty string). In that case
        // pdfOpenPasswordCallback is already null (we clear it on cancel) so we check
        // the error name to avoid overwriting the UI with a generic error message.
        if (err?.name === 'PasswordException') {
          // onPassword already handled the UI — nothing more to do here
          setIsLoading(false);
          return;
        }
        console.error('PDF load error:', err);
        setError('Sorry, we could not open that file. It may be damaged or in an unsupported format.');
        setIsLoading(false);
      });

    return () => { cancelled = true; loadingTask.destroy(); };
  }, [activePdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps


  // ============================================================
  // ANNOTATION CANVAS — redraw helper
  // ============================================================

  const redrawAnnotationCanvas = useCallback((pageNum, currentAnnotations, currentScale) => {
    const canvas = document.getElementById(`annotation-canvas-${pageNum}`);
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAnnotationsOnCanvas(ctx, currentAnnotations[pageNum] || [], currentScale);
  }, []);


  // ============================================================
  // PAGE RENDERING
  // ============================================================

  const renderPage = useCallback(async (pageNum, doc, currentScale, rotation = 0) => {
    if (renderTasksRef.current[pageNum]) {
      try { renderTasksRef.current[pageNum].cancel(); } catch (e) {}
      renderTasksRef.current[pageNum] = null;
    }

    try {
      const page = await doc.getPage(pageNum);
      // PDF.js getViewport({ rotation }) has default = page.rotate (intrinsic rotation).
      // BUT if you pass rotation: 0 explicitly, it overrides the intrinsic rotation to 0.
      // So we always compute totalRotation = page's own rotation + our additional rotation.
      // This ensures saved rotations (baked into the PDF by PyMuPDF) survive on re-open.
      const intrinsicRotation = page.rotate || 0;
      const totalRotation     = (intrinsicRotation + rotation) % 360;
      const viewport = page.getViewport({ scale: currentScale, rotation: totalRotation });

      // Store viewport for synchronous use in selection tool mouse handlers
      pageViewportsRef.current[pageNum] = viewport;

      const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
      if (!canvas) return;

      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      context.clearRect(0, 0, canvas.width, canvas.height);

      // annotationMode: 0 suppresses PDF.js from drawing native annotation icons
      // (e.g. the sticky-note appearance stream) onto the canvas. KindPDF loads
      // and displays all annotations itself via its own overlays, so this prevents
      // double-rendering and the "flattened yellow box" artefact on re-open.
      const renderTask = page.render({ canvasContext: context, viewport, annotationMode: 0 });
      renderTasksRef.current[pageNum] = renderTask;
      await renderTask.promise;
      renderTasksRef.current[pageNum] = null;

      // Resize search overlay to match
      const overlay = document.getElementById(`search-overlay-${pageNum}`);
      if (overlay) { overlay.width = viewport.width; overlay.height = viewport.height; }

      // Resize annotation canvas and redraw annotations
      const annCanvas = document.getElementById(`annotation-canvas-${pageNum}`);
      if (annCanvas) {
        annCanvas.width = viewport.width;
        annCanvas.height = viewport.height;
        drawAnnotationsOnCanvas(annCanvas.getContext('2d'), annotationsRef.current[pageNum] || [], currentScale);
      }

      // Resize cursor canvas (used to show eraser circle cursor)
      const cursorCanvas = document.getElementById(`cursor-canvas-${pageNum}`);
      if (cursorCanvas) {
        cursorCanvas.width = viewport.width;
        cursorCanvas.height = viewport.height;
      }

    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') console.error(`Render error page ${pageNum}:`, err);
    }
  }, []);

  useEffect(() => {
    if (!pdfDoc || pageOrder.length === 0) return;
    // Render pages in pageOrder order, passing the per-page rotation so PDF.js
    // applies it to the viewport (correct dimensions + coordinate system).
    pageOrder.forEach(origPageNum => {
      renderPage(origPageNum, pdfDoc, scale, pageRotations[origPageNum] || 0);
    });
  }, [pdfDoc, scale, renderPage, pageOrder, pageRotations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw annotation canvases when annotations change (without re-rendering PDF)
  useEffect(() => {
    if (!pdfDoc) return;
    for (let i = 1; i <= pdfDoc.numPages; i++) redrawAnnotationCanvas(i, annotations, scale);
  }, [annotations, pdfDoc, scale, redrawAnnotationCanvas]);


  // ============================================================
  // TEXT CONTENT PRELOADING
  // When a selection tool is activated, preload text content for all pages
  // so mouse-move handlers can find text items synchronously.
  // ============================================================

  useEffect(() => {
    if (!['highlight', 'underline', 'strikethrough'].includes(activeTool)) return;
    if (!pdfDoc) return;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const pageNum = i;
      if (textContentCacheRef.current[pageNum]) continue;
      pdfDoc.getPage(pageNum).then(page => {
        page.getTextContent().then(tc => {
          textContentCacheRef.current[pageNum] = tc;
        });
      });
    }
  }, [activeTool, pdfDoc]);


  // ============================================================
  // INTERSECTION OBSERVER
  // ============================================================

  useEffect(() => {
    if (!pdfDoc || !scrollContainerRef.current) return;

    const observer = new IntersectionObserver(
      entries => {
        let mostVisible = null, highestRatio = 0;
        entries.forEach(entry => {
          if (entry.intersectionRatio > highestRatio) {
            highestRatio = entry.intersectionRatio;
            mostVisible = entry;
          }
        });
        if (mostVisible) setCurrentPage(parseInt(mostVisible.target.dataset.pageNum, 10));
      },
      { root: scrollContainerRef.current, threshold: Array.from({ length: 11 }, (_, i) => i / 10) }
    );

    Object.values(pageRefs.current).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [pdfDoc, numPages]);


  // ============================================================
  // NAVIGATION
  // ============================================================

  const scrollToPage = useCallback(pageNum => {
    const el = pageRefs.current[pageNum];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const handleKey = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') scrollToPage(Math.min(currentPage + 1, numPages));
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') scrollToPage(Math.max(currentPage - 1, 1));
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') handleUndo();
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') handleRedo();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentPage, numPages, scrollToPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleCtrlF = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const input = document.querySelector('input[aria-label="Search document"]');
        if (input) { input.focus(); input.select(); }
      }
    };
    window.addEventListener('keydown', handleCtrlF);
    return () => window.removeEventListener('keydown', handleCtrlF);
  }, []);

  // ============================================================
  // ZOOM
  // ============================================================

  const fitToScreen = useCallback(async () => {
    if (!pdfDoc || !scrollContainerRef.current) return;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    setScale((scrollContainerRef.current.clientWidth - 48) / viewport.width);
  }, [pdfDoc]);

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 4.0));
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.3));

  useEffect(() => { if (pdfDoc) fitToScreen(); }, [pdfDoc, fitToScreen]);


  // ============================================================
  // SEARCH
  // ============================================================

  const drawHighlights = useCallback((pageNum, rects, activeIndex, globalMatchOffset) => {
    const overlay = document.getElementById(`search-overlay-${pageNum}`);
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    rects.forEach((rect, i) => {
      ctx.fillStyle = (globalMatchOffset + i) === activeIndex ? 'rgba(255,165,0,0.6)' : 'rgba(255,255,0,0.4)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    });
  }, []);

  const clearAllHighlights = useCallback(() => {
    for (let i = 1; i <= numPages; i++) {
      const overlay = document.getElementById(`search-overlay-${i}`);
      if (overlay) { const ctx = overlay.getContext('2d'); ctx.clearRect(0, 0, overlay.width, overlay.height); }
    }
  }, [numPages]);

  const scrollToMatch = useCallback(globalIndex => {
    let offset = 0;
    for (const { pageNum, rects } of allMatches) {
      if (globalIndex < offset + rects.length) {
        const rect = rects[globalIndex - offset];
        const overlay = document.getElementById(`search-overlay-${pageNum}`);
        if (!overlay || !scrollContainerRef.current) break;
        const containerRect = scrollContainerRef.current.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const matchTop = overlayRect.top - containerRect.top + scrollContainerRef.current.scrollTop + rect.y;
        scrollContainerRef.current.scrollTo({ top: matchTop - scrollContainerRef.current.clientHeight / 2, behavior: 'smooth' });
        break;
      }
      offset += rects.length;
    }
  }, [allMatches]);

  const runSearch = useCallback(async query => {
    if (!pdfDoc || !query.trim()) {
      clearAllHighlights(); setAllMatches([]); setSearchMatchIndex(0); return;
    }
    const lowerQuery = query.toLowerCase();
    const found = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();
      const pageRects = [];
      textContent.items.forEach(item => {
        if (!item.str) return;
        const text = item.str.toLowerCase();
        let idx = text.indexOf(lowerQuery);
        while (idx !== -1) {
          const charWidth = item.width > 0 ? (item.width / item.str.length) * scale : 8 * scale;
          const itemHeight = (item.height || 12) * scale;
          const [x, y] = viewport.convertToViewportPoint(item.transform[4] + (idx / item.str.length) * item.width, item.transform[5]);
          pageRects.push({ x, y: y - itemHeight, width: charWidth * query.length, height: itemHeight });
          idx = text.indexOf(lowerQuery, idx + 1);
        }
      });
      if (pageRects.length > 0) found.push({ pageNum, rects: pageRects });
    }
    setAllMatches(found); setSearchMatchIndex(0);
    let globalOffset = 0;
    found.forEach(({ pageNum, rects }) => { drawHighlights(pageNum, rects, 0, globalOffset); globalOffset += rects.length; });
    if (found.length > 0) setTimeout(() => scrollToMatch(0), 50);
  }, [pdfDoc, scale, drawHighlights, clearAllHighlights, scrollToMatch]);

  useEffect(() => {
    if (allMatches.length === 0) return;
    let globalOffset = 0;
    allMatches.forEach(({ pageNum, rects }) => { drawHighlights(pageNum, rects, searchMatchIndex, globalOffset); globalOffset += rects.length; });
  }, [searchMatchIndex, allMatches, drawHighlights]);

  const totalMatchCount = allMatches.reduce((sum, m) => sum + m.rects.length, 0);
  const handleSearchNext = () => { if (!totalMatchCount) return; const n = (searchMatchIndex + 1) % totalMatchCount; setSearchMatchIndex(n); scrollToMatch(n); };
  const handleSearchPrev = () => { if (!totalMatchCount) return; const p = (searchMatchIndex - 1 + totalMatchCount) % totalMatchCount; setSearchMatchIndex(p); scrollToMatch(p); };
  const handleSearchClear = () => { setSearchQuery(''); setAllMatches([]); setSearchMatchIndex(0); clearAllHighlights(); };


  // ============================================================
  // ANNOTATION — STATE MANAGEMENT
  // ============================================================

  const addAnnotation = useCallback((pageNum, annotation) => {
    // Allow caller to supply a pre-generated id (needed for direct text-box placement)
    const annId = annotation.id || `ann-${Date.now()}-${Math.random()}`;
    setAnnotationHistory(prev => ({
      past: [...prev.past, prev.present],
      present: {
        ...prev.present,
        [pageNum]: [...(prev.present[pageNum] || []), { ...annotation, id: annId }],
      },
      future: [], // Any new action clears the redo stack
    }));
    return annId; // synchronous return; setState is batched but annId is determined now
  }, []);

  const handleUndo = useCallback(() => {
    setAnnotationHistory(prev => {
      if (prev.past.length === 0) return prev;
      return {
        past:    prev.past.slice(0, -1),
        present: prev.past[prev.past.length - 1],
        future:  [prev.present, ...(prev.future || [])], // Save current state so Redo can restore it
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setAnnotationHistory(prev => {
      if (!prev.future || prev.future.length === 0) return prev;
      return {
        past:    [...prev.past, prev.present],
        present: prev.future[0],
        future:  prev.future.slice(1),
      };
    });
  }, []);

  // Update specific fields of an existing annotation (e.g. after drag-to-move or double-click edit)
  const updateAnnotation = useCallback((pageNum, annId, updates) => {
    setAnnotationHistory(prev => {
      const pageAnns = prev.present[pageNum] || [];
      const newAnns = pageAnns.map(a => a.id === annId ? { ...a, ...updates } : a);
      return {
        past:    [...prev.past, prev.present],
        present: { ...prev.present, [pageNum]: newAnns },
        future:  [], // User action clears redo stack
      };
    });
  }, []);

  // Delete a specific annotation by id
  const deleteAnnotation = useCallback((pageNum, annId) => {
    setAnnotationHistory(prev => {
      const pageAnns = prev.present[pageNum] || [];
      const newAnns = pageAnns.filter(a => a.id !== annId);
      return {
        past:    [...prev.past, prev.present],
        present: { ...prev.present, [pageNum]: newAnns },
        future:  [], // User action clears redo stack
      };
    });
  }, []);

  const canUndo = annotationHistory.past.length > 0;
  const canRedo = (annotationHistory.future || []).length > 0;


  // ============================================================
  // PAGE MANAGEMENT — handlers (Phase 1.5)
  // ============================================================

  // Internal helper: push a new present state to pageHistory (creates undo entry)
  const pushPageState = useCallback((newPresent) => {
    setPageHistory(prev => ({
      past:    [...prev.past, prev.present],
      present: newPresent,
      future:  [],
    }));
  }, []);

  // Undo the last page operation
  const handlePageUndo = useCallback(() => {
    setPageHistory(prev => {
      if (prev.past.length === 0) return prev;
      return {
        past:    prev.past.slice(0, -1),
        present: prev.past[prev.past.length - 1],
        future:  [prev.present, ...prev.future],
      };
    });
  }, []);

  // Redo the last undone page operation
  const handlePageRedo = useCallback(() => {
    setPageHistory(prev => {
      if (prev.future.length === 0) return prev;
      return {
        past:    [...prev.past, prev.present],
        present: prev.future[0],
        future:  prev.future.slice(1),
      };
    });
  }, []);

  // Delete a page: remove it from pageOrder (annotations for that page remain
  // in annotationHistory but will be excluded at save time since the page won't
  // appear in the pageOrder array sent to the backend).
  const handleDeletePage = useCallback((origPageNum) => {
    setPageHistory(prev => {
      const newOrder = prev.present.pageOrder.filter(p => p !== origPageNum);
      if (newOrder.length === prev.present.pageOrder.length) return prev; // not found
      return {
        past:    [...prev.past, prev.present],
        present: { ...prev.present, pageOrder: newOrder },
        future:  [],
      };
    });
    // Clear selection for this page if it was selected
    setSelectedPages(prev => {
      const next = new Set(prev);
      next.delete(origPageNum);
      return next;
    });
  }, []);

  // Rotate a page: add 90° (right) or -90° (left) to its current additional rotation.
  // Rotation wraps in [0, 90, 180, 270]. Applied visually via the render effect and
  // permanently saved via PyMuPDF page.set_rotation() in the backend save endpoint.
  const handleRotatePage = useCallback((origPageNum, direction) => {
    setPageHistory(prev => {
      const currentRot = prev.present.pageRotations[origPageNum] || 0;
      const delta      = direction === 'right' ? 90 : -90;
      const newRot     = ((currentRot + delta) % 360 + 360) % 360;
      return {
        past:    [...prev.past, prev.present],
        present: {
          ...prev.present,
          pageRotations: { ...prev.present.pageRotations, [origPageNum]: newRot },
        },
        future: [],
      };
    });
  }, []);

  // Reorder pages via drag-and-drop.
  // If the dragged page is in selectedPages AND multiple pages are selected, moves
  // the entire selection as a group (preserving their relative order) to the drop target.
  // Otherwise moves just the single dragged page.
  const handleReorderPages = useCallback((draggedOrigPageNum, targetOrigPageNum, currentSelectedPages) => {
    setPageHistory(prev => {
      const order = [...prev.present.pageOrder];

      // Determine which pages to move
      const isGroupMove =
        currentSelectedPages &&
        currentSelectedPages.has(draggedOrigPageNum) &&
        currentSelectedPages.size > 1;

      const pagesToMove = isGroupMove
        ? order.filter(p => currentSelectedPages.has(p))  // selected pages in current order
        : [draggedOrigPageNum];

      // Remove the pages-to-move from the array
      const withoutMoving = order.filter(p => !pagesToMove.includes(p));

      // Find where the target sits in the reduced array
      const targetIdx = withoutMoving.indexOf(targetOrigPageNum);

      let newOrder;
      if (targetIdx === -1) {
        // Target was itself in the moving set — append at end
        newOrder = [...withoutMoving, ...pagesToMove];
      } else {
        // Insert the group before the target (natural "drop onto target" feel)
        newOrder = [...withoutMoving];
        newOrder.splice(targetIdx, 0, ...pagesToMove);
      }

      if (JSON.stringify(newOrder) === JSON.stringify(order)) return prev; // no change

      return {
        past:    [...prev.past, prev.present],
        present: { ...prev.present, pageOrder: newOrder },
        future:  [],
      };
    });
  }, []);

  // Toggle selection for a page (used in management mode for extract)
  const handleSelectPage = useCallback((origPageNum) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(origPageNum)) next.delete(origPageNum);
      else next.add(origPageNum);
      return next;
    });
  }, []);

  // Extract selected pages: call backend, download the resulting PDF.
  const handleExtractPages = useCallback(async () => {
    if (selectedPages.size === 0 || !activePdfFilename) return;

    try {
      const res = await fetch('/api/extract-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activePdfFilename,
          pageNums: Array.from(selectedPages),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Could not extract pages: ${err.error || 'Unknown error.'}`);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'extracted_pages.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Clear selection after successful extract
      setSelectedPages(new Set());
    } catch (err) {
      alert(`Could not extract pages: ${err.message}`);
    }
  }, [selectedPages, activePdfFilename]);

  const handleMergeComplete = useCallback((newFilename, newNumPages) => {
    const newUrl = `/api/pdf/${encodeURIComponent(newFilename)}`;
    // Updating activePdfUrl triggers the pdfDoc load useEffect, which resets
    // pageOrder, pageRotations, annotations, and all viewer state cleanly.
    setActivePdfUrl(newUrl);
    setActivePdfFilename(newFilename);
    // Reset annotation history since we have a new document
    setAnnotationHistory({ past: [], present: {}, future: [] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ============================================================
  // ANNOTATION — TOOL SWITCHING
  // ============================================================

  const handleToolChange = useCallback(tool => {
    setActiveInput(null);
    setSelectedTextBox(null); // deselect any text box when switching tools
    setNewTextBoxId(null);
    if (tool === 'highlight') setActiveColor(HIGHLIGHT_COLORS[0].value);
    else if (tool === 'underline' || tool === 'strikethrough') setActiveColor(LINE_COLORS[0].value);
    else if (tool === 'pen' || tool === 'sticky') setActiveColor('#1a1a1a');
    else if (tool === 'textbox') setActiveColor('#1a1a1a'); // textbox color defaults to black

    // The signature "tool" immediately opens the creation wizard rather than
    // activating a persistent drawing mode. We don't set activeTool to 'signature'
    // until the user has actually created one and is ready to place it.
    if (tool === 'signature') {
      setSignatureModalOpen(true);
      setActiveTool(null); // no persistent tool mode while wizard is open
      return;
    }

    setActiveTool(tool);
  }, []);

  // Color change — for highlight tools, wrap hex colors in rgba with opacity.
  // When a text box is selected, also update that text box's color immediately.
  const handleColorChange = useCallback(color => {
    if (activeTool === 'highlight' && color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      setActiveColor(`rgba(${r}, ${g}, ${b}, 0.45)`);
    } else {
      setActiveColor(color);
      // Live-update selected text box color
      setSelectedTextBox(prev => {
        if (prev) updateAnnotation(prev.pageNum, prev.id, { color });
        return prev;
      });
    }
  }, [activeTool, updateAnnotation]);


  // ============================================================
  // ANNOTATION — WORD-BY-WORD TEXT SELECTION (highlight/underline/strikethrough)
  //
  // Instead of a rectangle-select approach, we find the text item under the
  // cursor at each mousemove step and accumulate them. This gives Word-like
  // "drag over the words you want" behavior.
  // ============================================================

  // Find all text words between two canvas positions — browser-style range selection.
  // Works like text selection in a browser: drag right selects words on the same line,
  // drag down selects from the start position to the end position across multiple lines.
  // Returns an array of normalized rects (coords at scale=1).
  const findTextInRange = useCallback((startCanvasX, startCanvasY, endCanvasX, endCanvasY, pageNum) => {
    const textContent = textContentCacheRef.current[pageNum];
    const viewport = pageViewportsRef.current[pageNum];
    if (!textContent || !viewport) return [];

    const currentScale = scaleRef.current;
    const rects = [];
    const seenKeys = new Set();

    // Normalize so we always iterate from top to bottom
    let selStartX, selStartY, selEndX, selEndY;
    if (startCanvasY < endCanvasY || (Math.abs(startCanvasY - endCanvasY) < 6 && startCanvasX <= endCanvasX)) {
      selStartX = startCanvasX; selStartY = startCanvasY;
      selEndX = endCanvasX;     selEndY = endCanvasY;
    } else {
      selStartX = endCanvasX; selStartY = endCanvasY;
      selEndX = startCanvasX; selEndY = startCanvasY;
    }

    textContent.items.forEach(item => {
      if (!item.str || !item.str.trim()) return;
      const itemH = (item.height || 12) * currentScale;
      const itemW = item.width * currentScale;
      if (itemW <= 0) return;

      const [cx, cy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const itemTop = cy - itemH;
      const itemMidY = (itemTop + cy) / 2;

      // Skip items completely outside the vertical selection range (with generous tolerance)
      if (itemMidY < selStartY - itemH && itemTop > selStartY) return;
      if (itemMidY > selEndY + itemH && cy < selEndY) return;

      // Is this text item on the start line? the end line? or a middle line?
      const lineH = itemH;
      const isOnStartLine = Math.abs(itemMidY - selStartY) < lineH * 0.8;
      const isOnEndLine   = Math.abs(itemMidY - selEndY)   < lineH * 0.8;

      const tokens = item.str.match(/\S+|\s+/g) || [];
      let charOffset = 0;

      tokens.forEach(token => {
        const tokenW = (token.length / item.str.length) * itemW;
        const tokenX = cx + (charOffset / item.str.length) * itemW;
        charOffset += token.length;

        if (!token.trim()) return; // skip whitespace tokens

        const tokenRight = tokenX + tokenW;
        let include = false;

        if (isOnStartLine && isOnEndLine) {
          // Single-line selection: include tokens between start X and end X
          include = tokenRight > selStartX - 4 && tokenX < selEndX + 4;
        } else if (isOnStartLine) {
          // First line of a multi-line selection: from start X to end of line
          include = tokenRight > selStartX - 4;
        } else if (isOnEndLine) {
          // Last line: from start of line to end X
          include = tokenX < selEndX + 4;
        } else if (itemMidY > selStartY && itemMidY < selEndY) {
          // Middle lines: select everything
          include = true;
        }

        if (include) {
          const key = `${Math.round(tokenX * 10)},${Math.round(itemTop * 10)},${Math.round(tokenW * 10)}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            rects.push({
              x: tokenX / currentScale,
              y: itemTop / currentScale,
              w: tokenW / currentScale,
              h: itemH / currentScale,
            });
          }
        }
      });
    });

    return rects;
  }, []);

  // Redraw the annotation canvas with existing annotations + live selection preview
  const drawSelectionPreviewOnCanvas = useCallback((pageNum, tool, rects, color, currentScale) => {
    const annCanvas = document.getElementById(`annotation-canvas-${pageNum}`);
    if (!annCanvas) return;
    const ctx = annCanvas.getContext('2d');
    ctx.clearRect(0, 0, annCanvas.width, annCanvas.height);
    drawAnnotationsOnCanvas(ctx, annotationsRef.current[pageNum] || [], currentScale);
    ctx.save();
    rects.forEach(r => {
      if (tool === 'highlight') {
        ctx.fillStyle = color;
        ctx.fillRect(r.x * currentScale, r.y * currentScale, r.w * currentScale, r.h * currentScale);
      } else if (tool === 'underline') {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r.x * currentScale, (r.y + r.h) * currentScale);
        ctx.lineTo((r.x + r.w) * currentScale, (r.y + r.h) * currentScale);
        ctx.stroke();
      } else if (tool === 'strikethrough') {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r.x * currentScale, (r.y + r.h * 0.55) * currentScale);
        ctx.lineTo((r.x + r.w) * currentScale, (r.y + r.h * 0.55) * currentScale);
        ctx.stroke();
      }
    });
    ctx.restore();
  }, []);


  // ============================================================
  // ANNOTATION — MOUSE EVENT HANDLERS
  // ============================================================

  const handleAnnotationMouseDown = useCallback((e, pageNum) => {
    if (!activeTool) return;
    e.preventDefault();

    const normX = e.nativeEvent.offsetX / scaleRef.current;
    const normY = e.nativeEvent.offsetY / scaleRef.current;

    if (activeTool === 'pen') {
      isDrawingRef.current = true;
      activePageRef.current = pageNum;
      currentStrokeRef.current = [{ x: normX, y: normY }];
    }

    else if (['highlight', 'underline', 'strikethrough'].includes(activeTool)) {
      isDrawingRef.current = true;
      activePageRef.current = pageNum;
      // Record the selection start position for range-based selection (browser-style)
      selectionStartRef.current = { canvasX: e.nativeEvent.offsetX, canvasY: e.nativeEvent.offsetY };
    }

else if (activeTool === 'sticky') {
  // Check if the click landed on an existing sticky note icon (26×26px hit area).
  // If so, open that note for editing instead of creating a new one.
  const ICON_SIZE = 26;
  const currentScale = scaleRef.current;
  const clickX = e.nativeEvent.offsetX / currentScale;
  const clickY = e.nativeEvent.offsetY / currentScale;
  const pageAnns = annotationsRef.current[pageNum] || [];
  const hitNote = pageAnns.find(ann => {
    if (ann.type !== 'sticky') return false;
    const iconLeft  = ann.x;
    const iconTop   = ann.y;
    const iconRight = ann.x + ICON_SIZE / currentScale;
    const iconBot   = ann.y + ICON_SIZE / currentScale;
    return clickX >= iconLeft && clickX <= iconRight &&
           clickY >= iconTop  && clickY <= iconBot;
  });

  if (hitNote) {
    // Clicked an existing note — open it for editing
    setOpenStickyId(hitNote.id);
  } else {
    // Clicked empty space — place a new sticky note
    setActiveInput({
      type: 'sticky', pageNum,
      canvasX: e.nativeEvent.offsetX, canvasY: e.nativeEvent.offsetY,
      normX, normY, value: '',
    });
  }
}

    else if (activeTool === 'textbox') {
      // Text box: place directly and enter edit mode immediately (no popup)
      const annId = addAnnotation(pageNum, {
        type: 'textbox',
        x: normX, y: normY,
        text: '',
        fontSize: textFontSizeRef.current,
        fontFamily: textFontFamilyRef.current,
        color: activeColorRef.current,
        isBold: isBoldRef.current,
        isUnderline: isUnderlineRef.current,
      });
      setNewTextBoxId(annId);
      setSelectedTextBox({ pageNum, id: annId });
      setActiveTool(null); // turn off tool so overlays receive pointer events immediately
    }

    else if (activeTool === 'eraser') {
      isDrawingRef.current = true;
      activePageRef.current = pageNum;
      if (applyEraserRef.current) applyEraserRef.current(normX, normY, pageNum);
    }

    else if (activeTool === 'signature_place') {
      // User clicked a page to place the pending signature.
      // Centre the signature on the click point.
      const sig = pendingSignatureRef.current;
      if (!sig) return;
      const halfW = sig.width  / 2;
      const halfH = sig.height / 2;
      addAnnotation(pageNum, {
        type: 'signature',
        x: normX - halfW,
        y: normY - halfH,
        width:  sig.width,
        height: sig.height,
        dataUrl: sig.dataUrl,
      });
      setPendingSignature(null);
      setActiveTool(null);
    }

}, [activeTool, findTextInRange, drawSelectionPreviewOnCanvas]);

  // Draw the eraser size circle on the cursor-canvas overlay.
  // Separate canvas layer so it doesn't interfere with annotation redraws.
  const drawEraserCursor = useCallback((pageNum, canvasX, canvasY) => {
    const cursorCanvas = document.getElementById(`cursor-canvas-${pageNum}`);
    if (!cursorCanvas || cursorCanvas.width === 0) return;
    const ctx = cursorCanvas.getContext('2d');
    ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    const radius = eraserSizeRef.current;
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 80, 220, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, []);

  const handleAnnotationMouseMove = useCallback((e, pageNum) => {
    const canvasX = e.nativeEvent.offsetX;
    const canvasY = e.nativeEvent.offsetY;

    // Always show eraser cursor circle when fine eraser is active (even without mouse held)
    if (activeTool === 'eraser' && eraserModeRef.current === 'fine') {
      drawEraserCursor(pageNum, canvasX, canvasY);
    }

    if (!isDrawingRef.current || activePageRef.current !== pageNum) return;

    const currentScale = scaleRef.current;
    const normX = canvasX / currentScale;
    const normY = canvasY / currentScale;

    if (activeTool === 'pen') {
      currentStrokeRef.current.push({ x: normX, y: normY });
      // Draw only the latest segment directly (avoids full redraw on every move)
      const annCanvas = document.getElementById(`annotation-canvas-${pageNum}`);
      if (!annCanvas) return;
      const ctx = annCanvas.getContext('2d');
      const pts = currentStrokeRef.current;
      if (pts.length >= 2) {
        const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
        ctx.strokeStyle = activeColorRef.current;
        ctx.lineWidth = penSizeRef.current * currentScale;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x * currentScale, p1.y * currentScale);
        ctx.lineTo(p2.x * currentScale, p2.y * currentScale);
        ctx.stroke();
      }
    }

    else if (['highlight', 'underline', 'strikethrough'].includes(activeTool)) {
      // Range-based selection: find all text between the start point and current cursor (browser-style)
      if (!selectionStartRef.current) return;
      const rects = findTextInRange(
        selectionStartRef.current.canvasX, selectionStartRef.current.canvasY,
        canvasX, canvasY,
        pageNum
      );
      drawSelectionPreviewOnCanvas(pageNum, activeTool, rects, activeColorRef.current, currentScale);
    }

    else if (activeTool === 'eraser') {
      if (applyEraserRef.current) applyEraserRef.current(normX, normY, pageNum);
    }
  }, [activeTool, findTextInRange, drawSelectionPreviewOnCanvas, drawEraserCursor]);

  const handleAnnotationMouseUp = useCallback((e, pageNum) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (activeTool === 'pen') {
      const points = currentStrokeRef.current;
      if (points.length >= 2) {
        addAnnotation(pageNum, { type: 'pen', points, color: activeColorRef.current, width: penSizeRef.current });
      }
      currentStrokeRef.current = [];
    }

    else if (['highlight', 'underline', 'strikethrough'].includes(activeTool)) {
      const start = selectionStartRef.current;
      const endX = e.nativeEvent.offsetX;
      const endY = e.nativeEvent.offsetY;
      const rawRects = start
        ? findTextInRange(start.canvasX, start.canvasY, endX, endY, pageNum)
        : [];
      const rects = mergeRectsIntoLines(rawRects);
      if (rects.length > 0) {
        addAnnotation(pageNum, { type: activeTool, rects, color: activeColorRef.current });
      } else {
        // Nothing selected — clear any visual artifacts
        redrawAnnotationCanvas(pageNum, annotationsRef.current, scaleRef.current);
      }
      selectionStartRef.current = null;
    }
  }, [activeTool, addAnnotation, redrawAnnotationCanvas, findTextInRange]);

  const handleAnnotationMouseLeave = useCallback((e, pageNum) => {
    // Clear eraser cursor circle when mouse leaves the canvas
    if (activeTool === 'eraser') {
      const cursorCanvas = document.getElementById(`cursor-canvas-${pageNum}`);
      if (cursorCanvas) {
        const ctx = cursorCanvas.getContext('2d');
        ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      }
    }
    // If a selection drag goes off the canvas edge, commit what was selected
    if (isDrawingRef.current && ['highlight', 'underline', 'strikethrough'].includes(activeTool)) {
      isDrawingRef.current = false;
      const start = selectionStartRef.current;
      const endX = e.nativeEvent.offsetX;
      const endY = e.nativeEvent.offsetY;
      const rawRects = start
        ? findTextInRange(start.canvasX, start.canvasY, endX, endY, pageNum)
        : [];
      const rects = mergeRectsIntoLines(rawRects);
      if (rects.length > 0) {
        addAnnotation(pageNum, { type: activeTool, rects, color: activeColorRef.current });
      } else {
        redrawAnnotationCanvas(pageNum, annotationsRef.current, scaleRef.current);
      }
      selectionStartRef.current = null;
    }
  }, [activeTool, addAnnotation, redrawAnnotationCanvas, findTextInRange]);


  // ============================================================
  // ANNOTATION — ERASER
  // ============================================================

  const applyEraser = useCallback((normX, normY, pageNum) => {
    // Use refs so this stable callback always reads the latest values without re-creating
    const normRadius = eraserSizeRef.current / scaleRef.current;

    setAnnotationHistory(prev => {
      const pageAnns = prev.present[pageNum] || [];

      if (eraserModeRef.current === 'brush') {
        // Whole mode: remove entire annotations the cursor touches
        const newAnns = pageAnns.filter(ann => !annotationHitTest(ann, normX, normY, normRadius));
        if (newAnns.length === pageAnns.length) return prev;
        return { past: [...prev.past, prev.present], present: { ...prev.present, [pageNum]: newAnns }, future: [] };

      } else {
        // Fine eraser: pixel-level erasure inside the cursor circle.
        // - Pen strokes: split strokes at erased segments.
        // - Highlight/underline/strikethrough: remove individual rects the circle overlaps.
        let changed = false;
        const newAnns = [];

        pageAnns.forEach(ann => {

          if (ann.type === 'pen') {
            const points = ann.points || [];
            if (points.length < 2) { newAnns.push(ann); return; }

            const keepPoint = new Array(points.length).fill(true);
            let localChanged = false;
            for (let i = 0; i < points.length - 1; i++) {
              const dist = distanceToSegment(
                normX, normY,
                points[i].x, points[i].y,
                points[i + 1].x, points[i + 1].y
              );
              if (dist <= normRadius) {
                keepPoint[i] = false;
                keepPoint[i + 1] = false;
                localChanged = true;
                changed = true;
              }
            }

            if (!localChanged) { newAnns.push(ann); return; }

            // Split remaining points into continuous sub-strokes
            let current = [];
            for (let i = 0; i < points.length; i++) {
              if (keepPoint[i]) {
                current.push(points[i]);
              } else {
                if (current.length >= 2) newAnns.push({ ...ann, points: current, id: `${ann.id}-s${i}` });
                current = [];
              }
            }
            if (current.length >= 2) newAnns.push({ ...ann, points: current });

          } else if (['highlight', 'underline', 'strikethrough'].includes(ann.type)) {
            // Remove individual rects whose closest point to the cursor is within the erase radius
            const remainingRects = (ann.rects || []).filter(r => {
              const closestX = Math.max(r.x, Math.min(normX, r.x + r.w));
              const closestY = Math.max(r.y, Math.min(normY, r.y + r.h));
              return Math.hypot(normX - closestX, normY - closestY) > normRadius;
            });
            if (remainingRects.length < (ann.rects || []).length) {
              changed = true;
              if (remainingRects.length > 0) newAnns.push({ ...ann, rects: remainingRects });
              // All rects erased → annotation deleted (don't push)
            } else {
              newAnns.push(ann);
            }

          } else {
            newAnns.push(ann);
          }
        });

        if (!changed) return prev;
        return { past: [...prev.past, prev.present], present: { ...prev.present, [pageNum]: newAnns }, future: [] };
      }
    });
  }, []); // No deps: reads eraserMode/eraserSize through refs

  // Keep the eraser ref current so mouse handlers always call the latest version
  useEffect(() => { applyEraserRef.current = applyEraser; }, [applyEraser]);

  // When a text box is selected, sync its font/size/color/bold/underline into the toolbar
  useEffect(() => {
    if (!selectedTextBox) return;
    const pageAnns = annotations[selectedTextBox.pageNum] || [];
    const ann = pageAnns.find(a => a.id === selectedTextBox.id);
    if (!ann) return;
    if (ann.fontFamily) { setTextFontFamily(ann.fontFamily); textFontFamilyRef.current = ann.fontFamily; }
    if (ann.fontSize)   { setTextFontSize(ann.fontSize);   textFontSizeRef.current  = ann.fontSize; }
    if (ann.color)      setActiveColor(ann.color);
    const bold = !!ann.isBold;
    const underline = !!ann.isUnderline;
    setIsBold(bold); isBoldRef.current = bold;
    setIsUnderline(underline); isUnderlineRef.current = underline;
  }, [selectedTextBox?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // ============================================================
  // ANNOTATION — TEXT INPUT (textbox and sticky note)
  // FIX: use activeInputRef/activeColorRef to avoid stale closures in blur handler
  // ============================================================

  // Commit the sticky note input popup (sticky note only — textbox now placed directly)
  const commitActiveInput = useCallback(() => {
    const input = activeInputRef.current;
    if (!input || !input.value.trim()) {
      setActiveInput(null);
      return;
    }
    addAnnotation(input.pageNum, {
      type: 'sticky',
      x: input.normX,
      y: input.normY,
      text: input.value,
      fontSize: 12,
      color: activeColorRef.current,
    });
    setActiveInput(null);
  }, [addAnnotation]);

  const handleInputKeyDown = useCallback(e => {
    if (e.key === 'Escape') { setActiveInput(null); return; }
    // Shift+Enter = newline; Enter does NOT auto-commit sticky (user hits button)
  }, []);

  // Font family/size changes: update state AND live-update selected text box
  const handleTextFontFamilyChange = useCallback(family => {
    setTextFontFamily(family);
    textFontFamilyRef.current = family;
    setSelectedTextBox(prev => {
      if (prev) updateAnnotation(prev.pageNum, prev.id, { fontFamily: family });
      return prev;
    });
  }, [updateAnnotation]);

  const handleTextFontSizeChange = useCallback(size => {
    setTextFontSize(size);
    textFontSizeRef.current = size;
    setSelectedTextBox(prev => {
      if (prev) updateAnnotation(prev.pageNum, prev.id, { fontSize: size });
      return prev;
    });
  }, [updateAnnotation]);

  const handleBoldChange = useCallback(bold => {
    setIsBold(bold);
    isBoldRef.current = bold;
    setSelectedTextBox(prev => {
      if (prev) updateAnnotation(prev.pageNum, prev.id, { isBold: bold });
      return prev;
    });
  }, [updateAnnotation]);

  const handleUnderlineChange = useCallback(underline => {
    setIsUnderline(underline);
    isUnderlineRef.current = underline;
    setSelectedTextBox(prev => {
      if (prev) updateAnnotation(prev.pageNum, prev.id, { isUnderline: underline });
      return prev;
    });
  }, [updateAnnotation]);


  // ============================================================
  // FORM — PUSH-BUTTON HANDLER
  // ============================================================
  //
  // Called when the user clicks a ButtonOverlay button.  We handle the
  // actions KindPDF can perform natively (print) and show an honest,
  // plain-English dialog for everything else rather than silently failing.

  // Print the raw PDF in a hidden iframe so only the document itself goes to
  // the printer — not the KindPDF toolbar, annotations canvas, or Chrome UI.
  //
  // WHY blob: URL instead of setting iframe.src = activePdfUrl directly:
  //   Setting a relative /api/pdf/... path as the iframe src can cause Chrome
  //   to render it as HTML (React app) rather than invoking its PDF plugin,
  //   because the Content-Type from the iframe request may not be explicit
  //   enough for Chrome to route it to the PDF renderer.  Fetching first and
  //   converting to a blob: URL guarantees the iframe receives typed binary
  //   PDF data — Chrome always opens blob: PDFs with its native PDF viewer.
  const handlePrint = useCallback(async () => {
    try {
      const response = await fetch(activePdfUrl);
      if (!response.ok) throw new Error('Could not fetch PDF for printing.');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);   // free memory
          }, 1000);
        }, 500);
      };
    } catch (err) {
      // Fallback: open the PDF in a new tab where the user can print manually.
      window.open(activePdfUrl, '_blank', 'noopener,noreferrer');
    }
  }, [activePdfUrl]);

  // handlePrint is listed as a dependency so the embedded Print button always
  // calls the current version of handlePrint (i.e. with the latest activePdfUrl).
  const handleButtonClick = useCallback((btn) => {
    if (btn.action_type === 'print') {
      // Use the blob-based print so embedded Print buttons also print only
      // the PDF document, consistent with the toolbar Print button behaviour.
      handlePrint();
      return;
    }
    // For all other action types, open the informational dialog so the user
    // knows what the button *would* do and what to do instead.
    setButtonModal({ btn });
  }, [handlePrint]);

  // Intercept Ctrl+P / Cmd+P so it prints only the PDF document (via the
  // blob-iframe method) instead of Chrome's default "print the whole page".
  // Placed here — after handlePrint is declared — to avoid the temporal dead
  // zone error that occurs when a useEffect dependency array references a
  // const that hasn't been initialised yet.
  useEffect(() => {
    const handleCtrlP = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleCtrlP);
    return () => window.removeEventListener('keydown', handleCtrlP);
  }, [handlePrint]);


  // ============================================================
  // ANNOTATION — SAVE PDF (with native Save As dialog)
  // ============================================================

  const handleSavePdf = useCallback(async () => {
    if (!activePdfFilename) {
      alert('Cannot save: the original filename is not available. Please re-open the file and try again.');
      return;
    }

    setIsSaving(true);
    try {
      // Include pageOrder and pageRotations so the backend can apply page operations
      // (reorder, delete, rotate) before embedding annotations.
      const response = await fetch('/api/save-annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename:      activePdfFilename,
          annotations,
          pageOrder:     pageOrder.length > 0 ? pageOrder : undefined,
          pageRotations: Object.keys(pageRotations).length > 0 ? pageRotations : undefined,
          // Form field values — included whenever the PDF has fillable fields.
          // Backend writes them as live (non-flattened) AcroForm fields so they
          // remain editable when the saved PDF is re-opened.
          formValues:    Object.keys(formValues).length > 0 ? formValues : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save annotations.');
      }

      const blob = await response.blob();
      const suggestedName = `annotated_${pdfName || 'document.pdf'}`;

      // Try the native "Save As" dialog (works in Chrome; falls back to download in other browsers)
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'PDF file', accept: { 'application/pdf': ['.pdf'] } }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // User cancelled the dialog
          // If any other error, fall through to the download fallback below
          console.warn('showSaveFilePicker failed, falling back to download:', err);
        }
      }

      // Fallback for browsers that don't support File System Access API
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Save error:', err);
      alert(`Could not save the PDF: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  }, [activePdfFilename, pdfName, annotations, pageOrder, pageRotations, formValues]); // eslint-disable-line react-hooks/exhaustive-deps


  // ============================================================
  // CURSOR based on active tool
  // ============================================================

  const getCursor = () => {
    if (!activeTool) return 'default';
    if (activeTool === 'pen') return 'crosshair';
    if (activeTool === 'eraser') return eraserMode === 'fine' ? 'none' : 'cell';
    if (activeTool === 'textbox' || activeTool === 'sticky') return 'text';
    if (activeTool === 'signature_place') return 'copy'; // crosshair-ish "place here" cursor
    if (['highlight', 'underline', 'strikethrough'].includes(activeTool)) return 'text';
    return 'default';
  };


  // ============================================================
  // LOADING / ERROR STATES
  // ============================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Opening your document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md p-8">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Could not open this file</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={onClose} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">← Go Back</button>
        </div>
      </div>
    );
  }


  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      <Toolbar
        // Show display position (1-based index in pageOrder) rather than raw original page number,
        // so the toolbar reads "Page 2 of 5" after deleting page 1 — not "Page 2 of 6".
        currentPage={pageOrder.length > 0 ? (pageOrder.indexOf(currentPage) + 1 || 1) : currentPage}
        numPages={pageOrder.length > 0 ? pageOrder.length : numPages}
        // onPageChange receives a display position; convert it back to original page num for scrollToPage
        onPageChange={displayPos => {
          const origPageNum = pageOrder.length > 0 ? pageOrder[displayPos - 1] : displayPos;
          if (origPageNum) scrollToPage(origPageNum);
        }}
        scale={scale}
        onZoomIn={zoomIn} onZoomOut={zoomOut} onFitToScreen={fitToScreen}
        onZoomTo={v => setScale(Math.min(Math.max(v, 0.1), 4.0))}
        onToggleSidebar={() => setSidebarOpen(o => !o)} onClose={onClose} pdfName={pdfName}
        onProtectUnlock={() => setPasswordModalOpen(true)}
        onPrint={handlePrint}
        searchQuery={searchQuery} onSearchChange={setSearchQuery}
        onSearchSubmit={() => allMatches.length > 0 ? handleSearchNext() : runSearch(searchQuery)}
        searchMatchCount={totalMatchCount} searchMatchIndex={searchMatchIndex}
        onSearchNext={handleSearchNext} onSearchPrev={handleSearchPrev} onSearchClear={handleSearchClear}
      />

      <AnnotationToolbar
        activeTool={activeTool} onToolChange={handleToolChange}
        activeColor={activeColor} onColorChange={handleColorChange}
        penSize={penSize} onPenSizeChange={setPenSize}
        eraserMode={eraserMode} onEraserModeChange={setEraserMode}
        eraserSize={eraserSize} onEraserSizeChange={setEraserSize}
        canUndo={canUndo} onUndo={handleUndo}
        canRedo={canRedo} onRedo={handleRedo}
        onSave={handleSavePdf} isSaving={isSaving}
        textFontFamily={textFontFamily} onTextFontFamilyChange={handleTextFontFamilyChange}
        textFontSize={textFontSize} onTextFontSizeChange={handleTextFontSizeChange}
        isBold={isBold} onBoldChange={handleBoldChange}
        isUnderline={isUnderline} onUnderlineChange={handleUnderlineChange}
        hasSelectedTextBox={!!selectedTextBox}
      />

      {/* ── Page management mode banner ─────────────────────────────────────
          Shown while pageManagementMode is true. Tells the user what they can do
          and where to find the controls (in the left sidebar).
      ── */}
      {pageManagementMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <span className="text-sm font-medium text-amber-800">
              Page management mode — use the sidebar to reorder, rotate, remove, or extract pages.
              Changes are saved when you click <strong>Save As PDF</strong>.
            </span>
          </div>
          <button
            onClick={() => setPageManagementMode(false)}
            title="Exit page management mode"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-900 text-sm font-medium transition-colors flex-shrink-0"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* ── Signature placement banner ──────────────────────────────────────
          Shown while activeTool === 'signature_place'. Prompts the user to
          click on the document to position their signature.
      ── */}
      {activeTool === 'signature_place' && pendingSignature && (
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">✍️</span>
            <span className="text-sm font-medium">
              Click anywhere on the document to place your signature
            </span>
          </div>
          <button
            onClick={() => { setPendingSignature(null); setActiveTool(null); }}
            title="Cancel — go back without placing the signature"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
          >
            ✕ Cancel
          </button>
        </div>
      )}

      {/* ── XFA form warning banner (Phase 1.4) ──────────────────────────────
          Shown when the opened PDF uses an XFA form format that KindPDF cannot
          render interactively.
      ── */}
      {xfaBanner && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">⚠️</span>
            <span className="text-sm font-medium text-amber-800">
              This PDF uses a form format that KindPDF does not yet support. You can view
              and print the PDF, but the form fields cannot be filled in KindPDF at this time.
            </span>
          </div>
          <button
            onClick={() => setXfaBanner(false)}
            title="Dismiss this message"
            aria-label="Dismiss XFA warning"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-900 text-sm font-medium transition-colors flex-shrink-0"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* ── Form calculations info banner (Phase 1.4 patch) ────────────────────
          Shown when the PDF has computed fields (qty × price = total, etc.).
          Lets the user know values will update automatically as they type.
      ── */}
      {hasCalculations && formFields && formFields.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-2.5">
          <span className="text-base" aria-hidden="true">🧮</span>
          <span className="text-sm text-blue-800">
            This form has automatic calculations — totals will update as you type.
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {sidebarOpen && (
          <Sidebar
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            onGoToPage={scrollToPage}
            pageOrder={pageOrder}
            pageRotations={pageRotations}
            pageManagementMode={pageManagementMode}
            onToggleManageMode={() => setPageManagementMode(m => !m)}
            onDeletePage={handleDeletePage}
            onRotatePage={handleRotatePage}
            onReorderPages={handleReorderPages}
            onSelectPage={handleSelectPage}
            selectedPages={selectedPages}
            onExtractPages={handleExtractPages}
            onMergePdf={() => setMergeModalOpen(true)}
            canPageUndo={canPageUndo}
            canPageRedo={canPageRedo}
            onPageUndo={handlePageUndo}
            onPageRedo={handlePageRedo}
          />
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto bg-gray-200">
          {/*
            min-w-max is the fix for the "can't scroll to the left when zoomed in" bug.
            Without it, the inner div's width equals the scroll container's width, and
            items-center positions wide pages at a negative x offset that is unreachable
            (scrollLeft cannot go below 0). min-w-max expands the inner div to at least
            the widest page's pixel width, so scrollLeft=0 lands at the LEFT edge of the
            page and the full document width is scrollable. When pages are narrower than
            the viewport, min-w-max has no effect and items-center centres them normally.
          */}
          <div className="flex flex-col items-center py-6 gap-6 min-w-max">
            {/* Render pages in pageOrder order. Each pageNum here is the original
                1-based page number from the PDF — unchanged by reordering/deletion,
                so all canvas IDs, annotation lookups, and refs remain stable. */}
            {(pageOrder.length > 0 ? pageOrder : Array.from({ length: numPages }, (_, i) => i + 1)).map(pageNum => (
              <div
                key={pageNum}
                ref={el => { pageRefs.current[pageNum] = el; }}
                data-page-num={pageNum}
                className="relative shadow-md"
                onClick={() => setSelectedTextBox(null)} // clicking page bg deselects text box
              >
                {/* Layer 1: PDF canvas */}
                <canvas id={`pdf-canvas-${pageNum}`} className="block" />

                {/* Layer 2: Search highlights (never captures events) */}
                <canvas id={`search-overlay-${pageNum}`} className="absolute top-0 left-0 pointer-events-none" />

                {/* Layer 3: Annotation canvas */}
                <canvas
                  id={`annotation-canvas-${pageNum}`}
                  className="absolute top-0 left-0"
                  style={{ pointerEvents: activeTool ? 'auto' : 'none', cursor: getCursor() }}
                  onMouseDown={e => handleAnnotationMouseDown(e, pageNum)}
                  onMouseMove={e => handleAnnotationMouseMove(e, pageNum)}
                  onMouseUp={e => handleAnnotationMouseUp(e, pageNum)}
                  onMouseLeave={e => handleAnnotationMouseLeave(e, pageNum)}
                />

                {/* Layer 4: Cursor overlay — shows eraser circle when fine eraser is active */}
                <canvas
                  id={`cursor-canvas-${pageNum}`}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ zIndex: 25 }}
                />

                {/* ── Text input popup for new textbox / sticky note ── */}
                {activeInput && activeInput.pageNum === pageNum && (
                  <div
                    className="absolute z-30 shadow-2xl rounded-lg overflow-hidden"
                    style={{ left: Math.min(activeInput.canvasX, 380), top: activeInput.canvasY }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <textarea
                      autoFocus
                      value={activeInput.value}
                      onChange={e => setActiveInput(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onKeyDown={handleInputKeyDown}
                      rows={activeInput.type === 'sticky' ? 4 : 2}
                      placeholder={activeInput.type === 'sticky' ? 'Type your note...' : 'Type your text...'}
                      className={`w-56 p-2 text-sm resize-none focus:outline-none ${
                        activeInput.type === 'sticky'
                          ? 'bg-yellow-50 border-2 border-amber-400'
                          : 'bg-white border-2 border-blue-400'
                      }`}
                      style={{ minHeight: activeInput.type === 'sticky' ? '80px' : '48px', display: 'block' }}
                    />
                    {/* Explicit action buttons — no blur-based commit */}
                    <div className={`flex gap-1 px-2 py-1.5 ${
                      activeInput.type === 'sticky' ? 'bg-amber-50 border-t border-amber-200' : 'bg-blue-50 border-t border-blue-200'
                    }`}>
                      <button
                        onMouseDown={e => { e.preventDefault(); commitActiveInput(); }}
                        className={`flex-1 text-xs font-semibold py-1 rounded transition-colors ${
                          activeInput.type === 'sticky'
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {activeInput.type === 'sticky' ? '📌 Add Note' : '✓ Place Text'}
                      </button>
                      <button
                        onMouseDown={e => { e.preventDefault(); setActiveInput(null); }}
                        className="px-2 text-xs text-gray-500 hover:text-red-500 rounded hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 px-2 pb-1 bg-white">
                      {activeInput.type === 'sticky' ? 'Shift+Enter for new line · Esc to cancel' : 'Enter to place · Esc to cancel'}
                    </p>
                  </div>
                )}

                {/* ── Sticky note HTML overlays (hover to read, drag to move, ✕ to delete) ── */}
                {(annotations[pageNum] || [])
                  .filter(ann => ann.type === 'sticky')
                  .map(ann => (
                    <StickyNoteOverlay
  key={ann.id}
  ann={ann}
  scale={scale}
  eraserActive={activeTool === 'eraser'}
  interactionDisabled={!!(activeTool && activeTool !== 'eraser' && activeTool !== 'sticky')}
  onDelete={() => deleteAnnotation(pageNum, ann.id)}
  onUpdate={updates => updateAnnotation(pageNum, ann.id, updates)}
  openForEdit={openStickyId === ann.id}
  onOpenHandled={() => setOpenStickyId(null)}
/>
                  ))
                }

                {/* ── Text box HTML overlays (click to select, drag to move, dbl-click to edit) ── */}
                {(annotations[pageNum] || [])
                  .filter(ann => ann.type === 'textbox')
                  .map(ann => (
                    <TextBoxOverlay
                      key={ann.id}
                      ann={ann}
                      scale={scale}
                      eraserActive={activeTool === 'eraser'}
                      interactionDisabled={!!(activeTool && activeTool !== 'eraser' && activeTool !== 'textbox')}
                      isSelected={selectedTextBox?.id === ann.id}
                      isNewlyPlaced={ann.id === newTextBoxId}
                      onSelect={() => setSelectedTextBox({ pageNum, id: ann.id })}
                      onDelete={() => {
                        deleteAnnotation(pageNum, ann.id);
                        if (ann.id === newTextBoxId) setNewTextBoxId(null);
                        if (selectedTextBox?.id === ann.id) setSelectedTextBox(null);
                      }}
                      onUpdate={updates => {
                        updateAnnotation(pageNum, ann.id, updates);
                        // Clear "newly placed" state once the text is committed
                        if (ann.id === newTextBoxId && updates.text !== undefined) setNewTextBoxId(null);
                      }}
                    />
                  ))
                }

                {/* ── Signature HTML overlays (drag to move, corner handles to resize) ── */}
                {(annotations[pageNum] || [])
                  .filter(ann => ann.type === 'signature')
                  .map(ann => (
                    <SignatureOverlay
                      key={ann.id}
                      ann={ann}
                      scale={scale}
                      eraserActive={activeTool === 'eraser'}
                      interactionDisabled={!!(activeTool && activeTool !== 'eraser' && activeTool !== 'signature_place')}
                      onDelete={() => deleteAnnotation(pageNum, ann.id)}
                      onUpdate={updates => updateAnnotation(pageNum, ann.id, updates)}
                    />
                  ))
                }

                {/* ── Form field HTML overlays (Phase 1.4) ───────────────────────────
                    Always rendered whenever the PDF has fillable fields.
                    pageDimensions[pageNum] must exist (set after PDF loads) so that
                    coordinate conversion from normalised 0–1 rects is accurate.
                ── */}
                {formFields && formFields.length > 0 && pageDimensions[pageNum] && (
                  <FormOverlay
                    fields={formFields}
                    pageIndex={pageNum - 1}
                    scale={scale}
                    pageDimensions={pageDimensions[pageNum]}
                    formValues={formValues}
                    onFieldChange={(name, value) =>
                      setFormValues(prev => ({ ...prev, [name]: value }))
                    }
                  />
                )}

                {/* ── Push-button HTML overlays (Phase 1.4 extension) ────────────
                    Renders PDF push-button widgets (Print, Submit, etc.) as HTML
                    buttons. These are hidden by annotationMode:0 in the main render
                    so we recreate them here. pageDimensions must exist first.
                ── */}
                {pdfButtons && pdfButtons.length > 0 && pageDimensions[pageNum] && (
                  <ButtonOverlay
                    buttons={pdfButtons}
                    pageIndex={pageNum - 1}
                    scale={scale}
                    pageDimensions={pageDimensions[pageNum]}
                    onButtonClick={handleButtonClick}
                  />
                )}

              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Button action info dialog ──────────────────────────────────── */}
      {/* Shown when a user clicks a PDF push-button whose action KindPDF  */}
      {/* cannot perform automatically (email submit, unknown, etc.).      */}
      {/* We are honest about what the button would do and tell the user   */}
      {/* what to do instead rather than silently failing.                 */}
      {buttonModal && (() => {
        const { btn } = buttonModal;
        let title   = 'About this button';
        let icon    = '🔘';
        let message = null;
        let instruction = null;

        if (btn.action_type === 'submit') {
          icon    = '📧';
          title   = 'This button would send an email';
          const mailto = btn.action_target || '';
          const email  = mailto.replace(/^mailto:/i, '');
          message = (
            <>
              Clicking <strong>{btn.label || 'this button'}</strong> would send the filled
              form to <strong>{email || 'the address in the PDF'}</strong> by email.
            </>
          );
          instruction = (
            <>
              This feature is not yet supported in KindPDF.{' '}
              <strong>Save your filled PDF</strong> using the{' '}
              <em>Save As PDF</em> button, then attach it to an email yourself.
            </>
          );
        } else if (btn.action_type === 'javascript') {
          icon    = '⚠️';
          title   = 'This button runs a script';
          message = (
            <>
              <strong>{btn.label || 'This button'}</strong> runs a JavaScript script
              embedded in the PDF.
            </>
          );
          instruction = (
            <>
              This feature is not yet supported in KindPDF. Save your filled PDF using the{' '}
              <em>Save As PDF</em> button and use the script through another means if needed.
            </>
          );
        } else if (btn.action_type === 'uri') {
          icon    = '🔗';
          title   = 'This button opens a link';
          message = (
            <>
              <strong>{btn.label || 'This button'}</strong> would open:{' '}
              <span className="break-all font-mono text-sm text-blue-700">{btn.action_target}</span>
            </>
          );
          instruction = (
            <>
              Click{' '}
              <button
                className="text-blue-600 underline"
                onClick={() => { window.open(btn.action_target, '_blank', 'noopener,noreferrer'); }}
              >
                here to open the link
              </button>
              {' '}in a new tab.
            </>
          );
        } else if (btn.action_type === 'named') {
          icon    = '⚙️';
          title   = `PDF action: ${btn.action_target}`;
          message = (
            <>
              <strong>{btn.label || 'This button'}</strong> triggers the built-in PDF
              action <em>{btn.action_target}</em>.
            </>
          );
          instruction = (
            <>
              This feature is not yet supported in KindPDF. Save your PDF using the{' '}
              <em>Save As PDF</em> button to use it elsewhere.
            </>
          );
        } else {
          icon    = '❓';
          title   = 'This button\'s action is not supported';
          message = (
            <>
              <strong>{btn.label || 'This button'}</strong> has an action that
              KindPDF can't perform.
            </>
          );
          instruction = (
            <>
              This feature is not yet supported in KindPDF. Save your PDF using the{' '}
              <em>Save As PDF</em> button to use it elsewhere.
            </>
          );
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={e => { if (e.target === e.currentTarget) setButtonModal(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              </div>

              {/* What the button would do */}
              <p className="text-gray-700 text-base mb-3">{message}</p>

              {/* What to do instead */}
              {instruction && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-base text-blue-900 mb-5">
                  {instruction}
                </div>
              )}

              {/* Close button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setButtonModal(null)}
                  className="px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium text-base transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PDF open-password prompt (Phase 1.6) ─────────────────────── */}
      {/* Shows when PDF.js encounters a password-protected PDF on open.  */}
      {/* Replaces the generic "damaged file" error with a friendly prompt */}
      {pdfOpenPasswordCallback && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          role="dialog"
          aria-modal="true"
          aria-label="This file is password-protected"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">This file is password-protected</h2>
                <p className="text-sm text-gray-500">Enter the password to open it</p>
              </div>
            </div>

            {/* Wrong-password feedback */}
            {pdfOpenPasswordError && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-base">That password is incorrect — please try again.</p>
              </div>
            )}

            {/* Password input */}
            <div className="mb-4">
              <label htmlFor="pdf-open-pw" className="block text-base font-medium text-gray-800 mb-1">
                Password
              </label>
              <input
                id="pdf-open-pw"
                type="password"
                value={pdfOpenPasswordValue}
                onChange={e => setPdfOpenPasswordValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && pdfOpenPasswordValue) {
                    const cb = pdfOpenPasswordCallback;
                    setPdfOpenPasswordCallback(null);
                    cb(pdfOpenPasswordValue);
                  }
                  if (e.key === 'Escape') {
                    // User cancelled — clear prompt and go back to home
                    setPdfOpenPasswordCallback(null);
                    setPdfOpenPasswordError(false);
                    setPdfOpenPasswordValue('');
                    if (onClose) onClose();
                  }
                }}
                placeholder="Enter the file's password"
                title="Type the password for this PDF file"
                aria-label="Password for this PDF file"
                autoFocus
                autoComplete="current-password"
                className="w-full border border-gray-300 rounded-lg py-2.5 px-3 text-base
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setPdfOpenPasswordCallback(null);
                  setPdfOpenPasswordError(false);
                  setPdfOpenPasswordValue('');
                  if (onClose) onClose();
                }}
                title="Cancel and go back to the file picker"
                aria-label="Cancel"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300
                           text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!pdfOpenPasswordValue) return;
                  const cb = pdfOpenPasswordCallback;
                  setPdfOpenPasswordCallback(null);
                  cb(pdfOpenPasswordValue);
                }}
                disabled={!pdfOpenPasswordValue}
                title="Submit this password and open the file"
                aria-label="Open file"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white
                           text-base font-medium hover:bg-blue-700
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Open File
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Signature creation wizard modal ──────────────────────────── */}
      {signatureModalOpen && (
        <SignatureModal
          onComplete={sig => {
            // sig = { dataUrl, width, height }
            // Store the signature and switch to placement mode
            setSignatureModalOpen(false);
            setPendingSignature(sig);
            setActiveTool('signature_place');
          }}
          onCancel={() => {
            setSignatureModalOpen(false);
          }}
        />
      )}

      {/* ── Merge PDF modal (Phase 1.5) ──────────────────────────────── */}
      {mergeModalOpen && (
        <MergeModal
          isOpen={mergeModalOpen}
          currentNumPages={pageOrder.length || numPages}
          currentFilename={activePdfFilename}
          onClose={() => setMergeModalOpen(false)}
          onMergeComplete={handleMergeComplete}
        />
      )}

      {/* ── Password Settings modal (Phase 1.6) ──────────────────────── */}
      {passwordModalOpen && (
        <PasswordModal
          filename={activePdfFilename}
          onClose={() => setPasswordModalOpen(false)}
        />
      )}

    </div>
  );
}
