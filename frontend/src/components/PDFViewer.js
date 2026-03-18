// PDFViewer.js
// The main PDF viewing component.
// Architecture: renders ALL pages as stacked canvases in a scrollable column.
// An IntersectionObserver watches which page is most visible and updates the toolbar.
// Zoom is stored here and passed down — it never resets on page change.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';

// Point PDF.js at the local worker file (avoids CDN version mismatch)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function PDFViewer({ pdfUrl, pdfName, onClose }) {
  // --- State ---
  const [pdfDoc, setPdfDoc] = useState(null);         // The loaded PDF document object
  const [numPages, setNumPages] = useState(0);         // Total page count
  const [currentPage, setCurrentPage] = useState(1);  // Page currently in view
  const [scale, setScale] = useState(1.0);             // Zoom level (1.0 = 100%)
  const [isLoading, setIsLoading] = useState(true);    // Show spinner while loading
  const [error, setError] = useState(null);            // Plain English error message
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // --- Refs ---
  // pageRefs holds a ref to each page's canvas wrapper div, keyed by page number.
  // We use this to scroll to a specific page and to observe which page is visible.
  const pageRefs = useRef({});
  const scrollContainerRef = useRef(null);
  // renderingRef prevents two render calls from colliding on the same canvas
  const renderingRef = useRef({});

// --- Load the PDF ---
useEffect(() => {
  if (!pdfUrl) return;
  
  setIsLoading(true);
  setError(null);

  let cancelled = false;
  const loadingTask = pdfjsLib.getDocument(pdfUrl);

  loadingTask.promise
    .then((doc) => {
      if (cancelled) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setIsLoading(false);
    })
    .catch((err) => {
      if (cancelled) return;
      console.error('PDF load error:', err);
      setError('Sorry, we could not open that file. It may be damaged or in an unsupported format.');
      setIsLoading(false);
    });

  return () => {
    cancelled = true;
    loadingTask.destroy();
  };
}, [pdfUrl]);

  // --- Render a single page onto its canvas ---
  // This is called once per page when the PDF loads, and again whenever zoom changes.
// Stores active PDF.js render tasks so we can cancel them before re-rendering
const renderTasksRef = useRef({});

// --- Render a single page onto its canvas ---
const renderPage = useCallback(async (pageNum, doc, currentScale) => {
  // Cancel any in-progress render for this page before starting a new one
  if (renderTasksRef.current[pageNum]) {
    try {
      renderTasksRef.current[pageNum].cancel();
    } catch (e) {
      // Cancellation errors are expected and safe to ignore
    }
    renderTasksRef.current[pageNum] = null;
  }

  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
    if (!canvas) return;

    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Clear the canvas before rendering
    context.clearRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({ canvasContext: context, viewport });
    renderTasksRef.current[pageNum] = renderTask;

    await renderTask.promise;
    renderTasksRef.current[pageNum] = null;
  } catch (err) {
    // RenderingCancelledException is normal — not a real error
    if (err?.name !== 'RenderingCancelledException') {
      console.error(`Error rendering page ${pageNum}:`, err);
    }
  }
}, []);

// --- Re-render all pages when PDF loads or zoom changes ---
useEffect(() => {
  if (!pdfDoc) return;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    renderPage(i, pdfDoc, scale);
  }
}, [pdfDoc, scale, renderPage]);

  // --- IntersectionObserver: watch which page is most visible ---
  // This is what makes the toolbar page number update as you scroll.
  useEffect(() => {
    if (!pdfDoc) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the highest intersection ratio (most visible)
        let mostVisible = null;
        let highestRatio = 0;

        entries.forEach((entry) => {
          if (entry.intersectionRatio > highestRatio) {
            highestRatio = entry.intersectionRatio;
            mostVisible = entry;
          }
        });

        if (mostVisible) {
          const pageNum = parseInt(mostVisible.target.dataset.pageNum, 10);
          setCurrentPage(pageNum);
        }
      },
      {
        root: scrollContainerRef.current,
        // Observe a generous middle band of the viewport
        rootMargin: '0px',
        threshold: Array.from({ length: 11 }, (_, i) => i / 10), // [0, 0.1, 0.2, ... 1.0]
      }
    );

    // Observe each page wrapper div
    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pdfDoc, numPages]);

  // --- Scroll to a specific page (called from Toolbar and Sidebar) ---
  const scrollToPage = useCallback((pageNum) => {
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // --- Zoom handlers ---
  // Calculate initial fit-to-screen scale based on first page dimensions
  const fitToScreen = useCallback(async () => {
    if (!pdfDoc || !scrollContainerRef.current) return;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = scrollContainerRef.current.clientWidth - 48; // 48px for padding
    setScale(containerWidth / viewport.width);
  }, [pdfDoc]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 4.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.3));

  // Set initial fit-to-screen when PDF first loads
  useEffect(() => {
    if (pdfDoc) fitToScreen();
  }, [pdfDoc, fitToScreen]);

  // --- Keyboard navigation ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        scrollToPage(Math.min(currentPage + 1, numPages));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        scrollToPage(Math.max(currentPage - 1, 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentPage, numPages, scrollToPage]);

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Opening your document...</p>
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center max-w-md p-8">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Could not open this file</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // --- Main render ---
  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* Toolbar across the top */}
      <Toolbar
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        onPageChange={scrollToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToScreen={fitToScreen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onClose={onClose}
      />

      {/* Body: sidebar + scrollable page area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Thumbnail sidebar */}
        {sidebarOpen && (
          <Sidebar
            pdfDoc={pdfDoc}
            numPages={numPages}
            currentPage={currentPage}
            onPageSelect={scrollToPage}
          />
        )}

        {/* Scrollable column of all pages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-auto bg-gray-200"
        >
          <div className="flex flex-col items-center py-6 gap-6">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => { pageRefs.current[pageNum] = el; }}
                data-page-num={pageNum}
                className="bg-white shadow-md"
              >
                <canvas id={`pdf-canvas-${pageNum}`} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}