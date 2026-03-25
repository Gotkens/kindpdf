// frontend/src/components/Toolbar.js
// KindPDF — PDF Viewer Toolbar
//
// Contains: page navigation, zoom controls, fit to screen, word search.
// Every button has an icon AND a text label (design rule #1).
// Every button has a tooltip (design rule #6).

import React, { useState } from 'react';

function Toolbar({
  currentPage,       // Current page number (1-based), updated as user scrolls
  numPages,          // Total pages in the document
  scale,             // Current zoom level (1.0 = 100%)
  onPageChange,      // Callback: scroll to a specific page number
  onZoomIn,          // Callback: increase zoom
  onZoomOut,         // Callback: decrease zoom
  onFitToScreen,     // Callback: fit page to window width
  onZoomTo,          // Callback: jump to a specific zoom level (0.1–4.0)
  onClose,           // Callback: close document, go back to home
  onToggleSidebar,   // Callback: show/hide thumbnail sidebar
  pdfName,           // Filename to display in the toolbar
  onProtectUnlock,   // Callback: open the Password Settings modal (Phase 1.6)
  // Search props
  searchQuery,         // Current search text
  onSearchChange,      // Callback: user typed in search box
  onSearchSubmit,      // Callback: user pressed Enter to search
  searchMatchCount,    // Total number of matches found
  searchMatchIndex,    // Current match index (0-based)
  onSearchNext,        // Callback: jump to next match
  onSearchPrev,        // Callback: jump to previous match
  onSearchClear,       // Callback: clear search and remove highlights
}) {
  // Local state for the page number input field
  const [pageInputValue, setPageInputValue] = useState(currentPage);

  // Local state for the zoom percentage input field.
  // Stored as a string so the user can type freely; validated on commit.
  const [zoomInputValue, setZoomInputValue] = useState(String(Math.round(scale * 100)));

  // When the user types a page number and presses Enter
  const handlePageInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      const num = parseInt(pageInputValue, 10);
      if (!isNaN(num) && num >= 1 && num <= numPages) {
        onPageChange(num);
      } else {
        setPageInputValue(currentPage);
      }
    }
  };

  // Keep page input in sync when parent changes the page (e.g. scrolling)
  React.useEffect(() => {
    setPageInputValue(currentPage);
  }, [currentPage]);

  // Keep zoom input in sync when scale changes externally
  // (e.g. Smaller / Larger buttons, or Fit to Screen)
  React.useEffect(() => {
    setZoomInputValue(String(Math.round(scale * 100)));
  }, [scale]);

  // Commit a zoom value typed by the user.
  // Accepts plain numbers ("75") or numbers with % ("75%").
  // Valid range: 10 % – 400 %. Reverts to current scale on invalid input.
  const commitZoom = () => {
    const num = parseInt(zoomInputValue.replace('%', '').trim(), 10);
    if (!isNaN(num) && num >= 10 && num <= 400) {
      onZoomTo(num / 100);
    } else {
      // Revert display to the actual current scale
      setZoomInputValue(String(Math.round(scale * 100)));
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 flex-wrap shadow-sm">

      {/* ── Left: Logo + Close ── */}
      <div className="flex items-center gap-3 mr-2">
        <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">K</span>
        </div>

        <button
          onClick={onClose}
          title="Close this file and open a different one"
          className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
          aria-label="Close this file and open a different one"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="hidden sm:inline">Open Different File</span>
        </button>

        {/* Toggle Sidebar */}
        <button
          onClick={onToggleSidebar}
          title="Show or hide the page thumbnails panel"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
          aria-label="Toggle thumbnail sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="hidden md:inline">Pages</span>
        </button>
      </div>

      {/* ── Document name ── */}
      <div className="hidden lg:block flex-1 min-w-0">
        <p className="text-gray-800 font-medium text-base truncate" title={pdfName}>
          {pdfName}
        </p>
      </div>

      {/* ── Search Bar ── */}
      <div className="flex items-center gap-1 mx-1">
        <div className="relative flex items-center">
          {/* Search icon inside the input */}
          <svg className="absolute left-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit();
              if (e.key === 'Escape') onSearchClear();
            }}
            placeholder="Search document..."
            title="Type a word to find it in the document"
            aria-label="Search document"
            className="pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {/* Clear button — only shows when there's text */}
          {searchQuery && (
            <button
              onClick={onSearchClear}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Match count + prev/next — only show when there are results */}
        {searchMatchCount > 0 && (
          <>
            <span className="text-sm text-gray-500 whitespace-nowrap px-1">
              {searchMatchIndex + 1} of {searchMatchCount}
            </span>
            <button
              onClick={onSearchPrev}
              title="Go to previous match"
              aria-label="Previous match"
              className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={onSearchNext}
              title="Go to next match"
              aria-label="Next match"
              className="p-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* No results message */}
        {searchQuery && searchMatchCount === 0 && (
          <span className="text-sm text-gray-400 whitespace-nowrap px-1">No matches</span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 mx-1 hidden sm:block" aria-hidden="true" />

      {/* ── Page Navigation ── */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1.5 px-2">
          <label htmlFor="page-input" className="sr-only">Page number</label>
          <input
            id="page-input"
            type="number"
            min={1}
            max={numPages}
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={handlePageInputKeyDown}
            onBlur={() => {
              const num = parseInt(pageInputValue, 10);
              if (!isNaN(num) && num >= 1 && num <= numPages) {
                onPageChange(num);
              } else {
                setPageInputValue(currentPage);
              }
            }}
            className="w-14 text-center border border-gray-300 rounded-lg py-1.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Current page number"
          />
          <span className="text-gray-500 text-base whitespace-nowrap">
            of {numPages}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 mx-1 hidden sm:block" aria-hidden="true" />

      {/* ── Zoom Controls ── */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          title="Make the page smaller"
          aria-label="Zoom out"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
          <span className="hidden sm:inline">Smaller</span>
        </button>

        {/* Editable zoom percentage — click to highlight and type a custom value */}
        <div className="flex items-center">
          <label htmlFor="zoom-input" className="sr-only">Zoom percentage</label>
          <input
            id="zoom-input"
            type="number"
            min={10}
            max={400}
            value={zoomInputValue}
            onChange={e => setZoomInputValue(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Enter') { commitZoom(); e.target.blur(); }
              if (e.key === 'Escape') {
                setZoomInputValue(String(Math.round(scale * 100)));
                e.target.blur();
              }
            }}
            onBlur={commitZoom}
            title="Type a zoom percentage (10–400) and press Enter"
            aria-label={`Zoom level: ${Math.round(scale * 100)} percent. Click to change.`}
            className="w-12 text-center border border-gray-300 rounded-lg py-1.5 text-sm font-medium
                       text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="pl-0.5 text-sm text-gray-500 font-medium select-none" aria-hidden="true">%</span>
        </div>

        <button
          onClick={onZoomIn}
          title="Make the page larger"
          aria-label="Zoom in"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
          <span className="hidden sm:inline">Larger</span>
        </button>

        <button
          onClick={onFitToScreen}
          title="Fit the page to your screen width"
          aria-label="Fit to screen"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <span className="hidden sm:inline">Fit to Screen</span>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 mx-1 hidden sm:block" aria-hidden="true" />

      {/* ── Password Settings (Phase 1.6) ── */}
      <button
        onClick={onProtectUnlock}
        title="Add a password to this file, or remove an existing password"
        aria-label="Password settings — protect or unlock this PDF"
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors text-sm font-medium"
      >
        {/* Lock icon */}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="hidden sm:inline">Lock PDF</span>
      </button>

    </div>
  );
}

export default Toolbar;