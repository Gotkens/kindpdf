// frontend/src/components/Toolbar.js
// KindPDF — PDF Viewer Toolbar
//
// Contains: page navigation, zoom controls, fit to screen.
// Every button has an icon AND a text label (design rule #1).
// Every button has a tooltip (design rule #6).

import React, { useState } from 'react';

function Toolbar({
  currentPage,       // Current page number (1-based)
  totalPages,        // Total pages in the document
  scale,             // Current zoom level (1.0 = 100%)
  onPrevPage,        // Callback: go to previous page
  onNextPage,        // Callback: go to next page
  onGoToPage,        // Callback: go to a specific page number
  onZoomIn,          // Callback: increase zoom
  onZoomOut,         // Callback: decrease zoom
  onFitToScreen,     // Callback: fit page to window width
  onClose,           // Callback: close document, go back to home
  pdfName,           // Filename to display in the toolbar
}) {
  // Local state for the page number input field
  const [pageInputValue, setPageInputValue] = useState(currentPage);

  // When the user types a page number and presses Enter
  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      const num = parseInt(pageInputValue, 10);
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        onGoToPage(num);
      } else {
        // Reset to current page if invalid
        setPageInputValue(currentPage);
      }
    }
  };

  // Keep input in sync when parent changes the page (e.g. clicking prev/next)
  React.useEffect(() => {
    setPageInputValue(currentPage);
  }, [currentPage]);

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap shadow-sm">

      {/* ── Left: Logo + Close ── */}
      <div className="flex items-center gap-3 mr-4">
        <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
          <span className="text-white font-bold text-sm">K</span>
        </div>

        {/* Close / open different file button */}
        <button
          onClick={onClose}
          title="Close this file and open a different one"
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
          aria-label="Close this file and open a different one"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Open Different File
        </button>
      </div>

      {/* ── Document name ── */}
      <div className="hidden md:block flex-1 min-w-0">
        <p
          className="text-gray-800 font-medium text-base truncate"
          title={pdfName}
        >
          {pdfName}
        </p>
      </div>

      {/* ── Page Navigation ── */}
      <div className="flex items-center gap-1 mx-2">

        {/* Previous Page */}
        <button
          onClick={onPrevPage}
          disabled={currentPage <= 1}
          title="Go to the previous page"
          aria-label="Previous page"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed
                     text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page number input */}
        <div className="flex items-center gap-1.5 px-2">
          <label htmlFor="page-input" className="sr-only">Page number</label>
          <input
            id="page-input"
            type="number"
            min={1}
            max={totalPages}
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={handlePageInputKeyDown}
            onBlur={() => {
              // Validate on blur too
              const num = parseInt(pageInputValue, 10);
              if (!isNaN(num) && num >= 1 && num <= totalPages) {
                onGoToPage(num);
              } else {
                setPageInputValue(currentPage);
              }
            }}
            className="w-14 text-center border border-gray-300 rounded-lg py-1.5 text-base font-medium
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Current page number"
          />
          <span className="text-gray-500 text-base whitespace-nowrap">
            of {totalPages}
          </span>
        </div>

        {/* Next Page */}
        <button
          onClick={onNextPage}
          disabled={currentPage >= totalPages}
          title="Go to the next page"
          aria-label="Next page"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed
                     text-gray-700 hover:bg-gray-100 active:bg-gray-200"
        >
          <span className="hidden sm:inline">Next</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 mx-1 hidden sm:block" aria-hidden="true" />

      {/* ── Zoom Controls ── */}
      <div className="flex items-center gap-1">

        {/* Zoom Out */}
        <button
          onClick={onZoomOut}
          title="Make the page smaller"
          aria-label="Zoom out — make the page smaller"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
          <span className="hidden sm:inline">Smaller</span>
        </button>

        {/* Zoom percentage display */}
        <span
          className="px-2 text-gray-600 text-sm font-medium w-14 text-center"
          aria-label={`Zoom level: ${Math.round(scale * 100)} percent`}
        >
          {Math.round(scale * 100)}%
        </span>

        {/* Zoom In */}
        <button
          onClick={onZoomIn}
          title="Make the page larger"
          aria-label="Zoom in — make the page larger"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
          <span className="hidden sm:inline">Larger</span>
        </button>

        {/* Fit to Screen */}
        <button
          onClick={onFitToScreen}
          title="Fit the page to your screen width"
          aria-label="Fit to screen — resize the page to fill your window"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="hidden sm:inline">Fit to Screen</span>
        </button>
      </div>

    </div>
  );
}

export default Toolbar;