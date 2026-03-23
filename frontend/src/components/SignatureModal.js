// frontend/src/components/SignatureModal.js
// KindPDF — Signature Creation Wizard
//
// 3-step guided flow for creating a signature:
//   Step 1: Choose how to sign (Draw / Type / Upload)
//   Step 2: Create the signature using the chosen method
//   Step 3: Preview and confirm (with optional date stamp)
//
// On confirm, calls onComplete({ dataUrl, width, height }) so the parent
// can enter placement mode and let the user click where to put the signature.
//
// Design rules followed:
//   - Every button has an icon AND a text label
//   - Plain English — no jargon
//   - Numbered step indicator (Step 1 of 3)
//   - Min 16px body text
//   - Tooltips on interactive elements
//   - Works on mobile (touch events on draw canvas)

import React, { useState, useRef, useEffect, useCallback } from 'react';

// Fonts available for typed signatures. These must be web-safe or loaded via Google Fonts.
// We load them in the <style> block below.
const SIGNATURE_FONTS = [
  { name: 'Dancing Script',  label: 'Flowing Script',    family: "'Dancing Script', cursive" },
  { name: 'Great Vibes',     label: 'Elegant Cursive',   family: "'Great Vibes', cursive" },
  { name: 'Pacifico',        label: 'Rounded Style',     family: "'Pacifico', cursive" },
  { name: 'Satisfy',         label: 'Classic Signature', family: "'Satisfy', cursive" },
  { name: 'Caveat',          label: 'Natural Handprint', family: "'Caveat', cursive" },
];

// Canvas dimensions for drawing
const DRAW_CANVAS_WIDTH  = 480;
const DRAW_CANVAS_HEIGHT = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SignatureModal({ onComplete, onCancel }) {
  const [step, setStep]       = useState(1);   // 1, 2, or 3
  const [method, setMethod]   = useState(null); // 'draw' | 'type' | 'upload'

  // Draw state
  const drawCanvasRef = useRef(null);
  const isDrawingRef  = useRef(false);
  const lastPosRef    = useRef(null); // last drawn point, for connecting segments
  const [hasDrawn, setHasDrawn] = useState(false);
  const [penColor, setPenColor] = useState('#1a1a2e');

  // Type state
  const [typedName, setTypedName]         = useState('');
  const [selectedFont, setSelectedFont]   = useState(SIGNATURE_FONTS[0]);
  const [typedColor, setTypedColor]       = useState('#1a1a2e');
  const typeCanvasRef                     = useRef(null);
  const [fontsReady, setFontsReady]       = useState(false); // true once Google Fonts are loaded

  // Upload state
  const [uploadedImage, setUploadedImage] = useState(null); // data URL
  const fileInputRef                      = useRef(null);

  // Step 3 state
  const [previewDataUrl, setPreviewDataUrl]     = useState(null);
  const [capturedDataUrl, setCapturedDataUrl]   = useState(null); // snapshot taken before step 2 unmounts
  const [includeDate, setIncludeDate]           = useState(false);
  const [dateText, setDateText]                 = useState('');

  // ── Initialise date string once ────────────────────────────────────────────
  useEffect(() => {
    const now = new Date();
    setDateText(now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);

  // ── Load Google Fonts ───────────────────────────────────────────────────────
  // CSS2 API requires separate family= params (not | separator).
  // We also wait for document.fonts.ready so the canvas renders the correct typeface.
  useEffect(() => {
    const query = SIGNATURE_FONTS
      .map(f => `family=${f.name.replace(/ /g, '+')}`)
      .join('&');
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    document.head.appendChild(link);

    // Wait until all fonts (including the newly added ones) are ready.
    // This prevents the canvas from rendering in a fallback font.
    document.fonts.ready.then(() => setFontsReady(true));

    return () => { try { document.head.removeChild(link); } catch (_) {} };
  }, []);

  // ── Draw canvas helpers ─────────────────────────────────────────────────────

  // Clear the draw canvas to white
  const clearDrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    lastPosRef.current = null;
    setHasDrawn(false);
  }, []);

  // Initialise canvas when the draw step becomes visible
  useEffect(() => {
    if (method === 'draw' && step === 2) {
      clearDrawCanvas();
    }
  }, [method, step, clearDrawCanvas]);

  const getPos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    const pos = getPos(canvas, e);
    lastPosRef.current = pos; // record starting point for first segment
  }, []);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(canvas, e);
    const last = lastPosRef.current;
    if (!last) { lastPosRef.current = pos; return; }

    // Draw one discrete segment from the last position to the current position.
    // This approach connects every move event so fast mouse/finger movement never
    // leaves a gap — each segment starts exactly where the previous one ended.
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    lastPosRef.current = pos;
    setHasDrawn(true);
  }, [penColor]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    isDrawingRef.current = false;
    lastPosRef.current   = null;
  }, []);

  // ── Typed signature → canvas ────────────────────────────────────────────────

  // Re-render the type canvas whenever name / font / color changes
  useEffect(() => {
    if (method !== 'type' || step !== 2) return;
    const canvas = typeCanvasRef.current;
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!typedName.trim()) return;

    // Pick font size to fit the name within the canvas width
    const maxWidth = canvas.width - 40;
    let fontSize   = 80;
    ctx.font       = `${fontSize}px ${selectedFont.family}`;
    while (ctx.measureText(typedName).width > maxWidth && fontSize > 20) {
      fontSize -= 2;
      ctx.font = `${fontSize}px ${selectedFont.family}`;
    }

    ctx.fillStyle   = typedColor;
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
  }, [typedName, selectedFont, typedColor, method, step, fontsReady]);

  // ── Build the final dataUrl for Step 3 preview ──────────────────────────────
  // IMPORTANT: This function must only read from `capturedDataUrl` (not canvas refs),
  // because on step 3 the step-2 JSX is unmounted and those refs are null.
  // `capturedDataUrl` is snapped from the canvas/upload in `goToStep3` BEFORE the step changes.

  const buildPreview = useCallback((sourceDataUrl) => {
    if (!sourceDataUrl) return;

    if (!includeDate) {
      setPreviewDataUrl(sourceDataUrl);
      return;
    }

    // Composite: signature image + date text line below it
    const sigImg = new Image();
    sigImg.onload = () => {
      const pad        = 10;
      const dateFontSz = 18;
      const totalH     = sigImg.height + dateFontSz + pad * 2;

      const canvas = document.createElement('canvas');
      canvas.width  = sigImg.width;
      canvas.height = totalH;

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(sigImg, 0, 0);

      ctx.fillStyle    = '#444444';
      ctx.font         = `${dateFontSz}px Arial, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(dateText, canvas.width / 2, sigImg.height + pad);

      setPreviewDataUrl(canvas.toDataURL('image/png'));
    };
    sigImg.src = sourceDataUrl;
  }, [includeDate, dateText]);

  // Rebuild preview when includeDate toggle changes (use already-captured URL)
  useEffect(() => {
    if (step === 3 && capturedDataUrl) buildPreview(capturedDataUrl);
  }, [step, includeDate, capturedDataUrl, buildPreview]);

  // ── Step navigation ─────────────────────────────────────────────────────────

  const goToStep2 = (chosenMethod) => {
    setMethod(chosenMethod);
    setStep(2);
  };

  const goToStep3 = () => {
    // Capture the data URL NOW while step-2 canvas refs are still mounted.
    // We can't read the canvas after setStep(3) because those JSX blocks unmount.
    let dataUrl = null;
    if (method === 'draw')   dataUrl = drawCanvasRef.current?.toDataURL('image/png') || null;
    else if (method === 'type')  dataUrl = typeCanvasRef.current?.toDataURL('image/png') || null;
    else if (method === 'upload') dataUrl = uploadedImage;

    setCapturedDataUrl(dataUrl);
    buildPreview(dataUrl); // build immediately with current includeDate state
    setStep(3);
  };

  const handleConfirm = () => {
    if (!previewDataUrl) return;

    // Target ~1/8 of a standard letter page width (612 pt / 8 ≈ 76 pt).
    // We use 150 pt so the signature is legible without being overwhelming —
    // the user can always resize with the corner handles after placement.
    const img = new Image();
    img.onload = () => {
      const defaultWidth  = 150; // PDF points (~2 inches on a letter-size page)
      const aspect        = img.naturalHeight / img.naturalWidth;
      const defaultHeight = Math.round(defaultWidth * aspect);
      onComplete({ dataUrl: previewDataUrl, width: defaultWidth, height: defaultHeight });
    };
    img.src = previewDataUrl;
  };

  // ── Step 2 — is the signature ready to proceed? ─────────────────────────────
  const step2Ready = () => {
    if (method === 'draw')   return hasDrawn;
    if (method === 'type')   return typedName.trim().length > 0;
    if (method === 'upload') return uploadedImage !== null;
    return false;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900">✍️ Add Your Signature</h2>
            <button
              onClick={onCancel}
              title="Close — go back to the document"
              aria-label="Close signature dialog"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((n) => (
              <React.Fragment key={n}>
                <div className={`flex items-center gap-1.5 text-sm font-medium ${
                  n === step ? 'text-blue-600' : n < step ? 'text-green-600' : 'text-gray-300'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    n === step ? 'bg-blue-600 text-white' :
                    n < step  ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {n < step ? '✓' : n}
                  </div>
                  <span className="hidden sm:inline">
                    {n === 1 ? 'Choose' : n === 2 ? 'Create' : 'Confirm'}
                  </span>
                </div>
                {n < 3 && <div className={`flex-1 h-0.5 ${n < step ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* ── Step 1: Choose method ── */}
          {step === 1 && (
            <div>
              <p className="text-base text-gray-600 mb-5">
                How would you like to create your signature?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => goToStep2('draw')}
                  title="Draw your signature with your mouse or finger"
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                >
                  <span className="text-3xl">✏️</span>
                  <div>
                    <div className="font-semibold text-gray-800 text-base group-hover:text-blue-700">
                      Draw it
                    </div>
                    <div className="text-sm text-gray-500">
                      Sign with your mouse or finger — just like signing on paper
                    </div>
                  </div>
                  <span className="ml-auto text-gray-300 group-hover:text-blue-400 text-xl">›</span>
                </button>

                <button
                  onClick={() => goToStep2('type')}
                  title="Type your name and pick a handwriting style"
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                >
                  <span className="text-3xl">⌨️</span>
                  <div>
                    <div className="font-semibold text-gray-800 text-base group-hover:text-blue-700">
                      Type it
                    </div>
                    <div className="text-sm text-gray-500">
                      Type your name and choose a handwriting style
                    </div>
                  </div>
                  <span className="ml-auto text-gray-300 group-hover:text-blue-400 text-xl">›</span>
                </button>

                <button
                  onClick={() => goToStep2('upload')}
                  title="Upload a photo of your signature"
                  className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                >
                  <span className="text-3xl">📷</span>
                  <div>
                    <div className="font-semibold text-gray-800 text-base group-hover:text-blue-700">
                      Upload a photo
                    </div>
                    <div className="text-sm text-gray-500">
                      Use an image of your existing signature
                    </div>
                  </div>
                  <span className="ml-auto text-gray-300 group-hover:text-blue-400 text-xl">›</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Create signature ── */}
          {step === 2 && method === 'draw' && (
            <div>
              <p className="text-base text-gray-600 mb-3">
                Draw your signature in the box below. Use your mouse or finger.
              </p>

              {/* Color picker */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-gray-500">Ink color:</span>
                {['#1a1a2e', '#1a3c8f', '#7c1a1a'].map(c => (
                  <button
                    key={c}
                    onClick={() => setPenColor(c)}
                    title={c === '#1a1a2e' ? 'Black ink' : c === '#1a3c8f' ? 'Blue ink' : 'Red ink'}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${penColor === c ? 'border-blue-500 scale-110' : 'border-gray-300'}`}
                    style={{ background: c }}
                    aria-label={`${c} ink color`}
                  />
                ))}
                <input
                  type="color"
                  value={penColor}
                  onChange={e => setPenColor(e.target.value)}
                  title="Choose a custom ink color"
                  aria-label="Custom ink color"
                  className="w-7 h-7 rounded-full cursor-pointer border border-gray-300"
                  style={{ padding: 0 }}
                />
              </div>

              {/* Draw canvas */}
              <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white"
                   style={{ touchAction: 'none' }}>
                <canvas
                  ref={drawCanvasRef}
                  width={DRAW_CANVAS_WIDTH}
                  height={DRAW_CANVAS_HEIGHT}
                  className="w-full block cursor-crosshair"
                  style={{ touchAction: 'none' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                  aria-label="Signature drawing area"
                />
                {/* Guide line */}
                <div className="absolute bottom-10 left-6 right-6 border-b border-gray-200 pointer-events-none" />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-gray-300 text-base select-none">Sign here</span>
                  </div>
                )}
              </div>

              <button
                onClick={clearDrawCanvas}
                title="Erase your drawing and start over"
                className="mt-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                🗑 Clear and start over
              </button>
            </div>
          )}

          {step === 2 && method === 'type' && (
            <div>
              <p className="text-base text-gray-600 mb-3">
                Type your name and choose a style that looks like your signature.
              </p>

              {/* Name input */}
              <input
                type="text"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Type your full name"
                autoFocus
                className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-xl px-4 py-3 text-base focus:outline-none mb-4"
                aria-label="Your name"
              />

              {/* Font picker */}
              <p className="text-sm text-gray-500 mb-2">Choose a style:</p>
              <div className="flex flex-col gap-2 mb-4">
                {SIGNATURE_FONTS.map(font => (
                  <button
                    key={font.name}
                    onClick={() => setSelectedFont(font)}
                    title={`Use the ${font.label} style`}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all ${
                      selectedFont.name === font.name
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm text-gray-500">{font.label}</span>
                    <span style={{ fontFamily: font.family, fontSize: 28, color: typedColor }}>
                      {typedName || 'Your Name'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Color:</span>
                {['#1a1a2e', '#1a3c8f', '#7c1a1a'].map(c => (
                  <button
                    key={c}
                    onClick={() => setTypedColor(c)}
                    title={c === '#1a1a2e' ? 'Black' : c === '#1a3c8f' ? 'Blue' : 'Red'}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${typedColor === c ? 'border-blue-500 scale-110' : 'border-gray-300'}`}
                    style={{ background: c }}
                    aria-label={`${c} text color`}
                  />
                ))}
                <input
                  type="color"
                  value={typedColor}
                  onChange={e => setTypedColor(e.target.value)}
                  title="Custom color"
                  aria-label="Custom text color"
                  className="w-7 h-7 rounded-full cursor-pointer border border-gray-300"
                  style={{ padding: 0 }}
                />
              </div>

              {/* Hidden canvas for generating the dataUrl */}
              <canvas
                ref={typeCanvasRef}
                width={DRAW_CANVAS_WIDTH}
                height={DRAW_CANVAS_HEIGHT}
                className="hidden"
                aria-hidden="true"
              />
            </div>
          )}

          {step === 2 && method === 'upload' && (
            <div>
              <p className="text-base text-gray-600 mb-4">
                Upload a photo or scan of your signature. A white background works best.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setUploadedImage(ev.target.result);
                  reader.readAsDataURL(file);
                }}
              />

              {!uploadedImage ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to choose an image file"
                  className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-8 flex flex-col items-center gap-3 text-gray-400 hover:text-blue-500 transition-all"
                >
                  <span className="text-5xl">📁</span>
                  <span className="text-base font-medium">Click to choose an image</span>
                  <span className="text-sm">PNG, JPG, or GIF</span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white w-full">
                    <img
                      src={uploadedImage}
                      alt="Your uploaded signature"
                      className="w-full object-contain"
                      style={{ maxHeight: 160 }}
                    />
                  </div>
                  <button
                    onClick={() => { setUploadedImage(null); fileInputRef.current.value = ''; }}
                    title="Remove this image and choose a different one"
                    className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                  >
                    🗑 Remove and choose a different image
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && (
            <div>
              <p className="text-base text-gray-600 mb-4">
                Here is your signature. After clicking "Place Signature", click anywhere on the document to position it.
              </p>

              {/* Preview */}
              <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white mb-4 flex items-center justify-center p-4"
                   style={{ minHeight: 120 }}>
                {previewDataUrl
                  ? <img src={previewDataUrl} alt="Your signature preview" className="max-w-full" style={{ maxHeight: 160 }} />
                  : <span className="text-gray-300">Loading preview…</span>
                }
              </div>

              {/* Date stamp toggle */}
              <label
                className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-all"
                title="Add today's date below your signature"
              >
                <input
                  type="checkbox"
                  checked={includeDate}
                  onChange={e => setIncludeDate(e.target.checked)}
                  className="w-5 h-5 rounded accent-blue-600 cursor-pointer"
                  aria-label="Include today's date below my signature"
                />
                <div>
                  <div className="text-base font-medium text-gray-800">Add today's date</div>
                  <div className="text-sm text-gray-500">{dateText}</div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* ── Footer buttons ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              if (step === 1) { onCancel(); }
              else { setStep(step - 1); }
            }}
            title={step === 1 ? 'Close — go back to the document' : 'Go back to the previous step'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-base font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step === 1 && (
            <span className="text-sm text-gray-400">Choose a method to continue</span>
          )}

          {step === 2 && (
            <button
              onClick={goToStep3}
              disabled={!step2Ready()}
              title={step2Ready() ? 'Continue to preview your signature' : 'Create your signature first'}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
                step2Ready()
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              Preview Signature
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleConfirm}
              disabled={!previewDataUrl}
              title="Place this signature on the document"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
                previewDataUrl
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              ✓ Place Signature
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
