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

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ============================================================
// UTILITY FUNCTIONS (pure, defined outside component)
// ============================================================

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

  // --- Core viewer state ---
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [allMatches, setAllMatches] = useState([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

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
    if (!pdfUrl) return;
    setIsLoading(true);
    setError(null);
    textContentCacheRef.current = {};
    pageViewportsRef.current = {};

    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(pdfUrl);

    loadingTask.promise
      .then(async doc => {
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);

        // ── Annotation round-trip: load existing native PDF annotations ──
        // After the PDF is ready, ask the backend to read any native annotation
        // objects that were previously saved (e.g. sticky notes saved by KindPDF,
        // or annotations added in Acrobat / Preview). If any come back, seed the
        // annotation history so they appear as fully editable annotations immediately.
        // A fetch failure is silently ignored — the PDF simply opens clean.
        if (pdfFilename) {
          try {
            const res = await fetch(
              `http://localhost:5000/api/annotations/${encodeURIComponent(pdfFilename)}`
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
      })
      .catch(err => {
        if (cancelled) return;
        console.error('PDF load error:', err);
        setError('Sorry, we could not open that file. It may be damaged or in an unsupported format.');
        setIsLoading(false);
      });

    return () => { cancelled = true; loadingTask.destroy(); };
  }, [pdfUrl]);


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

  const renderPage = useCallback(async (pageNum, doc, currentScale) => {
    if (renderTasksRef.current[pageNum]) {
      try { renderTasksRef.current[pageNum].cancel(); } catch (e) {}
      renderTasksRef.current[pageNum] = null;
    }

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentScale });

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
    if (!pdfDoc) return;
    for (let i = 1; i <= pdfDoc.numPages; i++) renderPage(i, pdfDoc, scale);
  }, [pdfDoc, scale, renderPage]);

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
  // ANNOTATION — SAVE PDF (with native Save As dialog)
  // ============================================================

  const handleSavePdf = useCallback(async () => {
    if (!pdfFilename) {
      alert('Cannot save: the original filename is not available. Please re-open the file and try again.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('http://localhost:5000/api/save-annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: pdfFilename, annotations }),
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
  }, [pdfFilename, pdfName, annotations]);


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
        currentPage={currentPage} numPages={numPages} scale={scale}
        onPageChange={scrollToPage} onZoomIn={zoomIn} onZoomOut={zoomOut} onFitToScreen={fitToScreen}
        onToggleSidebar={() => setSidebarOpen(o => !o)} onClose={onClose} pdfName={pdfName}
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

      <div className="flex flex-1 overflow-hidden">

        {sidebarOpen && (
          <Sidebar pdfDoc={pdfDoc} numPages={numPages} currentPage={currentPage} onGoToPage={scrollToPage} />
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-auto bg-gray-200">
          <div className="flex flex-col items-center py-6 gap-6">
            {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
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

              </div>
            ))}
          </div>
        </div>

      </div>

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

    </div>
  );
}
