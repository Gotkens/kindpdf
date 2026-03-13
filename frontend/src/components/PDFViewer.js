// frontend/src/components/PDFViewer.js
// KindPDF — PDF Viewer
//
// Loads a PDF using PDF.js and renders it to a canvas.
// Manages page state, zoom state, and coordinates the Toolbar and Sidebar.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';

// PDF.js needs a "worker" file to run in the background.
// We point it to the version that matches our installed package.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

function PDFViewer({ pdfUrl, pdfName, onClose }) {
  // The loaded PDF document object (from PDF.js)
  const [pdfDoc, setPdfDoc] = useState(null);

  // Current page number (1-based)
  const [currentPage, setCurrentPage] = useState(1);

  // Zoom scale (1.0 = 100%)
  const [scale, setScale] = useState(1.0);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Reference to the <canvas> element where PDF pages are rendered
  const canvasRef = useRef(null);

  // Reference to the scrollable viewer container — used for fit-to-screen calculation
  const viewerRef = useRef(null);

  // Track the current render task so we can cancel it if the user
  // changes page or zoom before it finishes
  const renderTaskRef = useRef(null);

  // ── Load the PDF document ──
  useEffect(() => {
    setIsLoading(true);
    setErrorMessage('');

    pdfjsLib.getDocument(pdfUrl).promise
      .then((doc) => {
        setPdfDoc(doc);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('PDF load error:', err);
        setErrorMessage(
          'We had trouble opening that PDF. It may be damaged or a type we do not support yet. Please try a different file.'
        );
        setIsLoading(false);
      });
  }, [pdfUrl]);

  // ── Render the current page ──
  const renderPage = useCallback(async (doc, pageNum, renderScale) => {
    if (!doc || !canvasRef.current) return;

    // Cancel any in-progress render before starting a new one
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderTask = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
    } catch (err) {
      // RenderingCancelledException is expected and safe to ignore
      if (err.name !== 'RenderingCancelledException') {
        console.error('Render error:', err);
      }
    }
  }, []);

  // Re-render whenever the page or zoom changes
  useEffect(() => {
    if (pdfDoc) {
      renderPage(pdfDoc, currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, renderPage]);

  // ── Calculate fit-to-screen scale ──
const getFitScale = useCallback(async () => {
    if (!pdfDoc || !viewerRef.current) return 1.0;
    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = viewerRef.current.clientWidth - 48;
    return containerWidth / viewport.width;
  }, [pdfDoc, currentPage]);

  // ── Toolbar callbacks ──
  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(pdfDoc?.numPages ?? 1, p + 1));
  const handleGoToPage = (num) => setCurrentPage(num);
  const handleZoomIn = () => setScale((s) => Math.min(3.0, parseFloat((s + 0.25).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.25, parseFloat((s - 0.25).toFixed(2))));
  const handleFitToScreen = () => getFitScale().then(s => setScale(s));

  // ── Set fit-to-screen on initial load ──
useEffect(() => {
    if (pdfDoc && viewerRef.current) {
      getFitScale().then(s => setScale(s));
    }
  }, [pdfDoc, getFitScale]);

  // ── Keyboard navigation ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') handleNextPage();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') handlePrevPage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfDoc]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* ── Toolbar at the top ── */}
      <Toolbar
        currentPage={currentPage}
        totalPages={pdfDoc?.numPages ?? 1}
        scale={scale}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onGoToPage={handleGoToPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onClose={onClose}
        pdfName={pdfName}
      />

      {/* ── Main area: Sidebar + Canvas ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Thumbnail sidebar — only shown after PDF loads */}
        {pdfDoc && (
          <Sidebar
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            onGoToPage={handleGoToPage}
          />
        )}

        {/* ── Scrollable canvas area ── */}
        <main
          ref={viewerRef}
          className="flex-1 overflow-auto"
          aria-label="PDF document viewer"
        >
          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-gray-500">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xl font-medium">Opening your PDF…</p>
              <p className="text-gray-400">This will only take a moment</p>
            </div>
          )}

          {/* Error state */}
          {errorMessage && (
            <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
                <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-xl font-bold text-red-800 mb-2">Could not open this file</h2>
                <p className="text-red-700 mb-6">{errorMessage}</p>
                <button
                  onClick={onClose}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Try a Different File
                </button>
              </div>
            </div>
          )}

          {/* PDF Canvas */}
          {!isLoading && !errorMessage && (
            <div className="flex justify-center py-6 px-4">
              <div className="shadow-2xl rounded overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  aria-label={`Page ${currentPage} of ${pdfDoc?.numPages ?? 1}`}
                  role="img"
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Bottom navigation bar (mobile-friendly) ── */}
      {pdfDoc && (
        <div className="md:hidden bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg font-medium text-gray-700 disabled:opacity-40"
            aria-label="Previous page"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <span className="text-gray-600 font-medium">
            Page {currentPage} of {pdfDoc.numPages}
          </span>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= pdfDoc.numPages}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg font-medium text-gray-700 disabled:opacity-40"
            aria-label="Next page"
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

    </div>
  );
}

export default PDFViewer;

