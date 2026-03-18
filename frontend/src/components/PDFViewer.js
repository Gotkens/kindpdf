// frontend/src/components/PDFViewer.js
// KindPDF — Main PDF viewer component.
//
// Architecture: renders ALL pages as stacked canvases in a scrollable column.
// An IntersectionObserver watches which page is most visible and updates the toolbar.
// Zoom is stored here and never resets on page change.
// Search uses PDF.js getTextContent() to find text positions, then draws
// yellow highlight rectangles on a transparent overlay canvas above each page.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function PDFViewer({ pdfUrl, pdfName, onClose }) {

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
  // allMatches: array of { pageNum, items } where items are individual match rects
  const [allMatches, setAllMatches] = useState([]);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  // --- Refs ---
  const pageRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const renderTasksRef = useRef({});

  // ============================================================
  // PDF LOADING
  // ============================================================

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

  // ============================================================
  // PAGE RENDERING
  // ============================================================

  const renderPage = useCallback(async (pageNum, doc, currentScale) => {
    // Cancel any in-progress render for this page
    if (renderTasksRef.current[pageNum]) {
      try { renderTasksRef.current[pageNum].cancel(); } catch (e) {}
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
      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTasksRef.current[pageNum] = renderTask;
      await renderTask.promise;
      renderTasksRef.current[pageNum] = null;

      // Also resize the overlay canvas to match
      const overlay = document.getElementById(`search-overlay-${pageNum}`);
      if (overlay) {
        overlay.width = viewport.width;
        overlay.height = viewport.height;
      }
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pageNum}:`, err);
      }
    }
  }, []);

  // Re-render all pages when PDF loads or zoom changes
  useEffect(() => {
    if (!pdfDoc) return;
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      renderPage(i, pdfDoc, scale);
    }
  }, [pdfDoc, scale, renderPage]);

  // ============================================================
  // INTERSECTION OBSERVER — update current page as user scrolls
  // ============================================================

  useEffect(() => {
    if (!pdfDoc || !scrollContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
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
        threshold: Array.from({ length: 11 }, (_, i) => i / 10),
      }
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pdfDoc, numPages]);

  // ============================================================
  // NAVIGATION
  // ============================================================

  const scrollToPage = useCallback((pageNum) => {
    const el = pageRefs.current[pageNum];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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

  // Intercept Ctrl+F (and Cmd+F on Mac) and focus our search bar instead
useEffect(() => {
  const handleSearchShortcut = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault(); // Block Chrome's built-in search
      const searchInput = document.querySelector('input[aria-label="Search document"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select(); // Select any existing text so user can type immediately
      }
    }
  };
  window.addEventListener('keydown', handleSearchShortcut);
  return () => window.removeEventListener('keydown', handleSearchShortcut);
}, []);
  // ============================================================
  // ZOOM
  // ============================================================

  const fitToScreen = useCallback(async () => {
    if (!pdfDoc || !scrollContainerRef.current) return;
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = scrollContainerRef.current.clientWidth - 48;
    setScale(containerWidth / viewport.width);
  }, [pdfDoc]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 4.0));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.3));

  useEffect(() => {
    if (pdfDoc) fitToScreen();
  }, [pdfDoc, fitToScreen]);

  // ============================================================
  // SEARCH
  // ============================================================

  // Draw yellow highlight rectangles on a page's overlay canvas for given rects
  const drawHighlights = useCallback((pageNum, rects, activeIndex, globalMatchOffset) => {
    const overlay = document.getElementById(`search-overlay-${pageNum}`);
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    rects.forEach((rect, i) => {
      const globalIndex = globalMatchOffset + i;
      // Active match is bright orange, others are yellow
      ctx.fillStyle = globalIndex === activeIndex
        ? 'rgba(255, 165, 0, 0.6)'
        : 'rgba(255, 255, 0, 0.4)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    });
  }, []);

  // Clear all overlays
  const clearAllHighlights = useCallback(() => {
    for (let i = 1; i <= numPages; i++) {
      const overlay = document.getElementById(`search-overlay-${i}`);
      if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    }
  }, [numPages]);

  // Run search across all pages using PDF.js text content
  const runSearch = useCallback(async (query) => {
    if (!pdfDoc || !query.trim()) {
      clearAllHighlights();
      setAllMatches([]);
      setSearchMatchIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const found = []; // Will hold { pageNum, rects: [{x, y, width, height}] }

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const textContent = await page.getTextContent();

      const pageRects = [];

      // Each item in textContent.items is a text span with a transform matrix
      // giving its position on the page. We check if it contains our search term.
      textContent.items.forEach((item) => {
        if (!item.str) return;
        const text = item.str.toLowerCase();
        let idx = text.indexOf(lowerQuery);

        while (idx !== -1) {
          // item.transform is a 6-element matrix: [scaleX, 0, 0, scaleY, x, y]
          // item.width covers the full span — we approximate the match rect
          const charWidth = item.width > 0
            ? (item.width / item.str.length) * scale
            : 8 * scale;
          const itemHeight = (item.height || 12) * scale;

          // PDF coordinate system has y=0 at bottom; canvas has y=0 at top
          // viewport.convertToViewportPoint handles this flip for us
          const [x, y] = viewport.convertToViewportPoint(
            item.transform[4] + (idx / item.str.length) * item.width,
            item.transform[5]
          );

          pageRects.push({
            x: x,
            y: y - itemHeight,
            width: charWidth * query.length,
            height: itemHeight,
          });

          idx = text.indexOf(lowerQuery, idx + 1);
        }
      });

      if (pageRects.length > 0) {
        found.push({ pageNum, rects: pageRects });
      }
    }

    setAllMatches(found);
    setSearchMatchIndex(0);

    // Draw highlights on all pages
    let globalOffset = 0;
    found.forEach(({ pageNum, rects }) => {
      drawHighlights(pageNum, rects, 0, globalOffset);
      globalOffset += rects.length;
    });

// Scroll to first match — use scrollToMatch after state updates
  if (found.length > 0) {
    setTimeout(() => scrollToMatch(0), 50);
  }
  }, [pdfDoc, scale, drawHighlights, clearAllHighlights, scrollToPage]);

  // Redraw highlights when active match index changes
  useEffect(() => {
    if (allMatches.length === 0) return;

    let globalOffset = 0;
    allMatches.forEach(({ pageNum, rects }) => {
      drawHighlights(pageNum, rects, searchMatchIndex, globalOffset);
      globalOffset += rects.length;
    });
  }, [searchMatchIndex, allMatches, drawHighlights]);

  // Total match count (sum of all rects across all pages)
  const totalMatchCount = allMatches.reduce((sum, m) => sum + m.rects.length, 0);

// Scroll the viewport so the target match rect is centered on screen
const scrollToMatch = useCallback((globalIndex) => {
  let offset = 0;
  for (const { pageNum, rects } of allMatches) {
    if (globalIndex < offset + rects.length) {
      const rect = rects[globalIndex - offset];
      const overlay = document.getElementById(`search-overlay-${pageNum}`);
      if (!overlay || !scrollContainerRef.current) break;

      // Get the overlay's position relative to the scroll container
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();

      // Calculate where the match rect is in the scroll container's coordinate space
      const matchTop = overlayRect.top - containerRect.top
        + scrollContainerRef.current.scrollTop
        + rect.y;

      // Scroll so the match appears in the middle of the viewport
      scrollContainerRef.current.scrollTo({
        top: matchTop - scrollContainerRef.current.clientHeight / 2,
        behavior: 'smooth',
      });
      break;
    }
    offset += rects.length;
  }
}, [allMatches]);

const handleSearchNext = () => {
  if (totalMatchCount === 0) return;
  const next = (searchMatchIndex + 1) % totalMatchCount;
  setSearchMatchIndex(next);
  scrollToMatch(next);
};


const handleSearchPrev = () => {
  if (totalMatchCount === 0) return;
  const prev = (searchMatchIndex - 1 + totalMatchCount) % totalMatchCount;
  setSearchMatchIndex(prev);
  scrollToMatch(prev);
};
  const handleSearchClear = () => {
    setSearchQuery('');
    setAllMatches([]);
    setSearchMatchIndex(0);
    clearAllHighlights();
  };

  // ============================================================
  // LOADING / ERROR STATES
  // ============================================================

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

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="flex flex-col h-screen bg-gray-100">

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
        pdfName={pdfName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={() => {
  if (allMatches.length > 0) {
    handleSearchNext();
  } else {
    runSearch(searchQuery);
  }
}}
        searchMatchCount={totalMatchCount}
        searchMatchIndex={searchMatchIndex}
        onSearchNext={handleSearchNext}
        onSearchPrev={handleSearchPrev}
        onSearchClear={handleSearchClear}
      />

      <div className="flex flex-1 overflow-hidden">

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
                className="relative shadow-md"
              >
                {/* The PDF page itself */}
                <canvas id={`pdf-canvas-${pageNum}`} className="block" />

                {/* Transparent overlay for search highlights — sits exactly on top */}
                <canvas
                  id={`search-overlay-${pageNum}`}
                  className="absolute top-0 left-0 pointer-events-none"
                />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}