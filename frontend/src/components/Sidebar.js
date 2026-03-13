// frontend/src/components/Sidebar.js
// KindPDF — Thumbnail Sidebar
//
// Shows a small preview of every page. Clicking a thumbnail jumps to that page.
// Renders thumbnails on demand using PDF.js.

import React, { useEffect, useRef, useState } from 'react';

function Sidebar({ pdfDoc, currentPage, onGoToPage }) {
  // Array of { pageNum, dataUrl } — built as we render each thumbnail
  const [thumbnails, setThumbnails] = useState([]);
  const thumbnailRefs = useRef({}); // Refs for each thumbnail — used to scroll into view

  // Render all page thumbnails when the PDF loads
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false; // Prevent state updates if component unmounts

    const renderThumbnails = async () => {
      const thumbList = [];

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (cancelled) break;

        const page = await pdfDoc.getPage(pageNum);

        // Render at a small fixed width for the thumbnail
        const THUMB_WIDTH = 120;
        const viewport = page.getViewport({ scale: 1 });
        const thumbScale = THUMB_WIDTH / viewport.width;
        const thumbViewport = page.getViewport({ scale: thumbScale });

        // Render the page to an off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = thumbViewport.width;
        canvas.height = thumbViewport.height;

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: thumbViewport,
        }).promise;

        thumbList.push({
          pageNum,
          dataUrl: canvas.toDataURL(),
          width: thumbViewport.width,
          height: thumbViewport.height,
        });

        // Update state as each thumbnail renders — progressive display
        if (!cancelled) {
          setThumbnails([...thumbList]);
        }
      }
    };

    renderThumbnails();

    return () => { cancelled = true; };
  }, [pdfDoc]);

  // Scroll the current page's thumbnail into view when the page changes
  useEffect(() => {
    const ref = thumbnailRefs.current[currentPage];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPage]);

  return (
    <aside
      className="w-40 bg-gray-100 border-r border-gray-200 overflow-y-auto flex-shrink-0 hidden md:block"
      aria-label="Page thumbnails"
    >
      <div className="p-2 space-y-3">
        {thumbnails.map(({ pageNum, dataUrl }) => (
          <button
            key={pageNum}
            ref={(el) => { thumbnailRefs.current[pageNum] = el; }}
            onClick={() => onGoToPage(pageNum)}
            title={`Go to page ${pageNum}`}
            aria-label={`Go to page ${pageNum}${currentPage === pageNum ? ' (current page)' : ''}`}
            aria-current={currentPage === pageNum ? 'page' : undefined}
            className={`
              w-full flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all
              ${currentPage === pageNum
                ? 'ring-2 ring-blue-500 bg-blue-50'
                : 'hover:bg-gray-200'
              }
            `}
          >
            <img
              src={dataUrl}
              alt={`Page ${pageNum}`}
              className="w-full shadow-sm rounded"
              style={{ aspectRatio: `${thumbnails[0]?.width} / ${thumbnails[0]?.height}` }}
            />
            <span className={`
              text-xs font-medium
              ${currentPage === pageNum ? 'text-blue-600' : 'text-gray-500'}
            `}>
              {pageNum}
            </span>
          </button>
        ))}

        {/* Loading indicator while thumbnails are still generating */}
        {thumbnails.length < (pdfDoc?.numPages ?? 0) && (
          <div className="flex flex-col items-center gap-2 py-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading pages…</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;