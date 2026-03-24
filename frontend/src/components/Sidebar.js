// frontend/src/components/Sidebar.js
// KindPDF — Thumbnail Sidebar with Page Management
//
// Normal mode: click thumbnail to jump to page.
// Management mode ("Organize Pages" button): compact two-column layout where
//   thumbnails are on the left and rotate/delete controls are on the right.
//   Auto-scrolls when dragging near top/bottom edge.
//   Multi-select pages and drag them as a group.
//
// Design rules:
//   - Every button has icon + text label
//   - Plain English — "Remove this page", "Rotate left"
//   - Tooltips on every action button
//   - Minimum accessible text sizes
//   - Works on mobile (sidebar hidden on narrow screens)

import React, { useEffect, useRef, useState, useCallback } from 'react';

function Sidebar({
  pdfDoc,
  currentPage,          // origPageNum of the most visible page
  onGoToPage,           // fn(origPageNum)
  pageOrder,            // [origPageNum, …]
  pageRotations,        // { origPageNum: additionalDegrees }
  pageManagementMode,
  onToggleManageMode,
  onDeletePage,         // fn(origPageNum)
  onRotatePage,         // fn(origPageNum, 'left'|'right')
  onReorderPages,       // fn(draggedOrigPageNum, targetOrigPageNum, selectedPages)
  onSelectPage,         // fn(origPageNum) — toggle selection
  selectedPages,        // Set<origPageNum>
  onExtractPages,
  onMergePdf,
  canPageUndo,
  canPageRedo,
  onPageUndo,
  onPageRedo,
}) {

  // ── Thumbnail cache ───────────────────────────────────────────────────────
  // Key = "origPageNum-totalRotation" so rotating a page re-renders that thumbnail
  // while leaving all other cached thumbnails untouched.
  const [thumbnailCache, setThumbnailCache] = useState({});

  // Clear the cache whenever a new PDF loads so stale thumbnails don't bleed over
  // (important after a merge which loads a new pdfDoc in the same component instance)
  useEffect(() => {
    setThumbnailCache({});
  }, [pdfDoc]);

  // Scroll-to-current: maps origPageNum → DOM element
  const thumbnailRefs = useRef({});

  // Ref to the scrollable <aside> — used for auto-scroll during drag
  const sidebarRef = useRef(null);

  // rAF handle for auto-scroll animation
  const scrollRafRef = useRef(null);

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [draggedPage, setDraggedPage]   = useState(null);
  const [dragOverPage, setDragOverPage] = useState(null);

  // ── Delete confirmation state ─────────────────────────────────────────────
  const [confirmDeletePage, setConfirmDeletePage] = useState(null);


  // ── Render / cache thumbnails ─────────────────────────────────────────────
  // Runs when pdfDoc or pageRotations changes.
  // KEY FIX: reads page.rotate (intrinsic rotation) and adds our additional rotation
  // on top, so saved rotations survive on re-open without needing pageRotations to be set.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    const renderMissing = async () => {
      const allOrigNums = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

      for (const origPageNum of allOrigNums) {
        if (cancelled) break;

        const additionalRot = (pageRotations || {})[origPageNum] || 0;

        try {
          const page            = await pdfDoc.getPage(origPageNum);
          // Always combine intrinsic + additional rotation (same logic as renderPage in PDFViewer).
          // The cache key uses additionalRot (not totalRot) so the lookup in the render section
          // can find it without knowing the page's intrinsic rotation. The cache is cleared when
          // pdfDoc changes so there's no cross-file collision.
          const intrinsicRot    = page.rotate || 0;
          const totalRot        = (intrinsicRot + additionalRot) % 360;
          const cacheKey        = `${origPageNum}-${additionalRot}`;

          // Already cached at this additional rotation — skip
          if (thumbnailCache[cacheKey]) continue;

          const THUMB_W = 120;
          const baseVp      = page.getViewport({ scale: 1, rotation: totalRot });
          const thumbScale  = THUMB_W / baseVp.width;
          const thumbVp     = page.getViewport({ scale: thumbScale, rotation: totalRot });

          const canvas = document.createElement('canvas');
          canvas.width  = thumbVp.width;
          canvas.height = thumbVp.height;

          await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport:      thumbVp,
          }).promise;

          if (!cancelled) {
            const dataUrl = canvas.toDataURL();
            setThumbnailCache(prev => ({
              ...prev,
              [cacheKey]: { dataUrl, width: thumbVp.width, height: thumbVp.height },
            }));
          }
        } catch (err) {
          console.warn(`KindPDF Sidebar: thumbnail failed for page ${origPageNum}`, err);
        }
      }
    };

    renderMissing();
    return () => { cancelled = true; };
  }, [pdfDoc, pageRotations]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Scroll active thumbnail into view ─────────────────────────────────────
  useEffect(() => {
    const ref = thumbnailRefs.current[currentPage];
    if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage]);


  // ── Auto-scroll during drag ───────────────────────────────────────────────
  // When the pointer is within SCROLL_ZONE px of the top or bottom of the sidebar
  // during a drag operation, continuously scroll in that direction.
  const stopAutoScroll = useCallback(() => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  }, []);

  const handleSidebarDragOver = useCallback((e) => {
    if (!draggedPage) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const SCROLL_ZONE = 80;   // px from edge that triggers scroll
    const MAX_SPEED   = 8;    // px per frame

    const rect = sidebar.getBoundingClientRect();
    const y    = e.clientY - rect.top;

    stopAutoScroll();

    if (y < SCROLL_ZONE) {
      // Near top — scroll up
      const speed = MAX_SPEED * (1 - y / SCROLL_ZONE);
      const tick  = () => { sidebar.scrollTop -= speed; scrollRafRef.current = requestAnimationFrame(tick); };
      scrollRafRef.current = requestAnimationFrame(tick);
    } else if (y > rect.height - SCROLL_ZONE) {
      // Near bottom — scroll down
      const dist  = rect.height - y;
      const speed = MAX_SPEED * (1 - dist / SCROLL_ZONE);
      const tick  = () => { sidebar.scrollTop += speed; scrollRafRef.current = requestAnimationFrame(tick); };
      scrollRafRef.current = requestAnimationFrame(tick);
    }
  }, [draggedPage, stopAutoScroll]);

  // Clean up the scroll rAF when the drag ends
  useEffect(() => {
    if (!draggedPage) stopAutoScroll();
  }, [draggedPage, stopAutoScroll]);


  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const handleDragStart = useCallback((e, origPageNum) => {
    setDraggedPage(origPageNum);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(origPageNum));
  }, []);

  const handleDragOver = useCallback((e, origPageNum) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPage(origPageNum);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverPage(null);
  }, []);

  const handleDrop = useCallback((e, targetOrigPageNum) => {
    e.preventDefault();
    setDragOverPage(null);
    stopAutoScroll();

    if (draggedPage === null || draggedPage === targetOrigPageNum) {
      setDraggedPage(null);
      return;
    }

    // Pass selectedPages so PDFViewer can move the whole group if needed
    onReorderPages(draggedPage, targetOrigPageNum, selectedPages);
    setDraggedPage(null);
  }, [draggedPage, onReorderPages, selectedPages, stopAutoScroll]);

  const handleDragEnd = useCallback(() => {
    setDraggedPage(null);
    setDragOverPage(null);
    stopAutoScroll();
  }, [stopAutoScroll]);


  // ── Delete flow ───────────────────────────────────────────────────────────
  const handleDeleteClick = useCallback((e, origPageNum) => {
    e.stopPropagation();
    if ((pageOrder || []).length <= 1) return;
    setConfirmDeletePage(origPageNum);
  }, [pageOrder]);

  const handleConfirmDelete = useCallback(() => {
    if (confirmDeletePage !== null) {
      onDeletePage(confirmDeletePage);
      setConfirmDeletePage(null);
    }
  }, [confirmDeletePage, onDeletePage]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeletePage(null);
  }, []);


  // ── Helpers ───────────────────────────────────────────────────────────────
  const getDisplayIdx = (origPageNum) => {
    const idx = (pageOrder || []).indexOf(origPageNum);
    return idx === -1 ? origPageNum : idx + 1;
  };

  const totalDisplayPages = (pageOrder || []).length;
  const hasSelection      = selectedPages && selectedPages.size > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <aside
      ref={sidebarRef}
      className={`
        bg-gray-100 border-r border-gray-200 overflow-y-auto flex-shrink-0
        hidden md:flex flex-col
        transition-all duration-200
        ${pageManagementMode ? 'w-48' : 'w-40'}
      `}
      aria-label="Page thumbnails and management"
      onDragOver={handleSidebarDragOver}
      onDragLeave={stopAutoScroll}
    >

      {/* ── Sidebar header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-2 py-2 flex flex-col gap-1.5">

        <button
          onClick={onToggleManageMode}
          title={pageManagementMode
            ? 'Exit page management — go back to normal viewing'
            : 'Switch to page management to reorder, rotate, delete, or extract pages'}
          aria-pressed={pageManagementMode}
          className={`
            w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg
            text-xs font-medium transition-colors
            ${pageManagementMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}
          `}
          style={{ fontSize: '12px', minHeight: '32px' }}
        >
          {pageManagementMode ? '✓ Done Editing' : '📄 Organize Pages'}
        </button>

        {/* Management-mode controls */}
        {pageManagementMode && (
          <div className="flex flex-col gap-1">
            {/* Undo / Redo */}
            <div className="flex gap-1">
              <button
                onClick={onPageUndo}
                disabled={!canPageUndo}
                title="Undo the last page change"
                className="flex-1 flex items-center justify-center gap-0.5 px-1 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ fontSize: '11px', minHeight: '26px' }}
              >
                ↩ Undo
              </button>
              <button
                onClick={onPageRedo}
                disabled={!canPageRedo}
                title="Redo the last undone page change"
                className="flex-1 flex items-center justify-center gap-0.5 px-1 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ fontSize: '11px', minHeight: '26px' }}
              >
                ↪ Redo
              </button>
            </div>

            {/* Merge */}
            <button
              onClick={onMergePdf}
              title="Insert pages from another PDF into this document"
              className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-white border border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
              style={{ fontSize: '11px', minHeight: '26px' }}
            >
              📎 Insert Another PDF
            </button>

            {/* Extract — only when pages selected */}
            {hasSelection && (
              <button
                onClick={onExtractPages}
                title={`Save the ${selectedPages.size} selected page${selectedPages.size !== 1 ? 's' : ''} as a new PDF`}
                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-colors font-medium"
                style={{ fontSize: '11px', minHeight: '26px' }}
              >
                📥 Save {selectedPages.size} Page{selectedPages.size !== 1 ? 's' : ''} as New File
              </button>
            )}

            {/* Group-drag hint when multiple pages selected */}
            {hasSelection && selectedPages.size > 1 && (
              <p className="text-center text-blue-600 leading-tight px-1" style={{ fontSize: '10px' }}>
                Drag any selected page to move all {selectedPages.size} together
              </p>
            )}
          </div>
        )}
      </div>


      {/* ── Thumbnail list ───────────────────────────────────────────── */}
      <div className="p-2 space-y-1.5 flex-1">
        {(pageOrder || []).map((origPageNum) => {
          const additionalRot  = (pageRotations || {})[origPageNum] || 0;
          const displayIdx     = getDisplayIdx(origPageNum);
          const isCurrentPage  = currentPage === origPageNum;
          const isDragging     = draggedPage === origPageNum;
          const isDragTarget   = dragOverPage === origPageNum;
          const isSelected     = selectedPages && selectedPages.has(origPageNum);
          const isGroupMember  = isSelected && selectedPages.size > 1;
          const isConfirming   = confirmDeletePage === origPageNum;

          // Resolve cached thumbnail.
          // Key = "origPageNum-additionalRot" matches exactly what the render useEffect stores.
          const thumb = thumbnailCache[`${origPageNum}-${additionalRot}`];

          return (
            <div
              key={origPageNum}
              ref={el => { thumbnailRefs.current[origPageNum] = el; }}
              className={`
                rounded-lg transition-all duration-150
                ${isDragging                           ? 'opacity-40 scale-95'   : ''}
                ${isDragTarget && pageManagementMode   ? 'ring-2 ring-blue-400 bg-blue-50' : ''}
                ${isGroupMember && !isDragging         ? 'ring-1 ring-green-400' : ''}
              `}
              onDragOver={pageManagementMode ? e => handleDragOver(e, origPageNum) : undefined}
              onDragLeave={pageManagementMode ? handleDragLeave : undefined}
              onDrop={pageManagementMode ? e => handleDrop(e, origPageNum) : undefined}
            >
              {/* ── DELETE CONFIRMATION OVERLAY ── */}
              {isConfirming && (
                <div className="p-2 bg-red-50 rounded-lg border border-red-200 flex flex-col gap-1.5">
                  <p className="text-center text-gray-800 font-medium leading-tight" style={{ fontSize: '12px' }}>
                    Remove page {displayIdx}?
                  </p>
                  <p className="text-center text-gray-500 leading-tight" style={{ fontSize: '11px' }}>
                    You can undo before saving.
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={handleCancelDelete}
                      className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 font-medium"
                      style={{ fontSize: '11px' }}
                    >
                      ✕ Keep
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded bg-red-600 text-white hover:bg-red-700 font-medium"
                      style={{ fontSize: '11px' }}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>
              )}

              {!isConfirming && (
                pageManagementMode ? (
                  /* ─────────── MANAGEMENT MODE CARD ─────────── */
                  /* Compact two-column layout: thumbnail left, controls right.
                     This keeps each card ~90px tall so many pages are visible at once. */
                  <div
                    className={`
                      flex gap-1.5 p-1.5 rounded-lg cursor-default
                      ${isCurrentPage ? 'ring-2 ring-blue-500 bg-blue-50' :
                        isSelected    ? 'bg-green-50 ring-1 ring-green-400' :
                                        'hover:bg-gray-200'}
                    `}
                  >
                    {/* Left: drag handle + thumbnail */}
                    <div
                      draggable
                      onDragStart={e => handleDragStart(e, origPageNum)}
                      onDragEnd={handleDragEnd}
                      className="flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing flex-shrink-0"
                      title="Drag to reorder — drag multiple pages together by selecting them first"
                      style={{ width: '72px' }}
                    >
                      {/* Drag indicator */}
                      <span className="text-gray-400 select-none" style={{ fontSize: '9px', letterSpacing: '2px' }}>⠿ drag</span>

                      {/* Thumbnail image */}
                      {thumb ? (
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${displayIdx}`}
                          className="w-full shadow-sm rounded"
                          style={{ aspectRatio: `${thumb.width} / ${thumb.height}` }}
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="w-full bg-gray-200 rounded flex items-center justify-center"
                          style={{ aspectRatio: '0.77', minHeight: '60px' }}
                        >
                          <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}

                      {/* Page label */}
                      <div className="flex items-center gap-0.5">
                        <span
                          className={`font-medium ${isCurrentPage ? 'text-blue-600' : 'text-gray-500'}`}
                          style={{ fontSize: '11px' }}
                        >
                          {displayIdx}
                        </span>
                        {additionalRot !== 0 && (
                          <span className="text-amber-600" style={{ fontSize: '9px' }} title={`Rotated ${additionalRot}° extra`}>
                            +{additionalRot}°
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: select + action controls */}
                    <div className="flex flex-col gap-1 flex-1 justify-start pt-3">
                      {/* Selection checkbox */}
                      <button
                        onClick={() => onSelectPage(origPageNum)}
                        title={isSelected ? 'Deselect this page' : 'Select this page (for extract or group move)'}
                        className={`
                          w-full flex items-center gap-1 px-1.5 py-1 rounded border transition-colors
                          ${isSelected
                            ? 'bg-green-100 border-green-400 text-green-800'
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}
                        `}
                        style={{ fontSize: '10px', minHeight: '24px' }}
                      >
                        <span style={{ fontSize: '12px' }}>{isSelected ? '☑' : '☐'}</span>
                        <span>{isSelected ? 'Selected' : 'Select'}</span>
                      </button>

                      {/* Rotate left */}
                      <button
                        onClick={e => { e.stopPropagation(); onRotatePage(origPageNum, 'left'); }}
                        title="Rotate this page 90° counter-clockwise"
                        className="w-full flex items-center gap-1 px-1.5 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
                        style={{ fontSize: '10px', minHeight: '24px' }}
                      >
                        ↺ <span>Left</span>
                      </button>

                      {/* Rotate right */}
                      <button
                        onClick={e => { e.stopPropagation(); onRotatePage(origPageNum, 'right'); }}
                        title="Rotate this page 90° clockwise"
                        className="w-full flex items-center gap-1 px-1.5 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
                        style={{ fontSize: '10px', minHeight: '24px' }}
                      >
                        ↻ <span>Right</span>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={e => handleDeleteClick(e, origPageNum)}
                        disabled={totalDisplayPages <= 1}
                        title={totalDisplayPages <= 1 ? 'Cannot remove the only page' : `Remove page ${displayIdx}`}
                        className="w-full flex items-center gap-1 px-1.5 py-1 rounded border border-gray-300 bg-white text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        style={{ fontSize: '10px', minHeight: '24px' }}
                      >
                        🗑️ <span>Remove</span>
                      </button>
                    </div>
                  </div>

                ) : (
                  /* ─────────── NORMAL MODE CARD ─────────── */
                  <button
                    onClick={() => onGoToPage(origPageNum)}
                    title={`Go to page ${displayIdx}`}
                    aria-label={`Go to page ${displayIdx}${isCurrentPage ? ' (current page)' : ''}`}
                    aria-current={isCurrentPage ? 'page' : undefined}
                    className={`
                      w-full flex flex-col items-center gap-1 p-1.5 rounded-lg transition-all
                      ${isCurrentPage ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-200'}
                    `}
                  >
                    {thumb ? (
                      <img
                        src={thumb.dataUrl}
                        alt={`Page ${displayIdx}`}
                        className="w-full shadow-sm rounded"
                        style={{ aspectRatio: `${thumb.width} / ${thumb.height}` }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="w-full bg-gray-200 rounded flex items-center justify-center"
                        style={{ aspectRatio: '0.77', minHeight: '80px' }}
                      >
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <span
                      className={`text-xs font-medium ${isCurrentPage ? 'text-blue-600' : 'text-gray-500'}`}
                    >
                      {displayIdx}
                    </span>
                  </button>
                )
              )}
            </div>
          );
        })}

        {/* Loading indicator while thumbnails generate */}
        {Object.keys(thumbnailCache).length < (pdfDoc?.numPages ?? 0) && (
          <div className="flex flex-col items-center gap-2 py-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span style={{ fontSize: '11px' }}>Loading pages…</span>
          </div>
        )}
      </div>

      {/* ── Footer: total page count ─────────────────────────────────── */}
      <div
        className="sticky bottom-0 bg-gray-100 border-t border-gray-200 px-2 py-1.5 text-center text-gray-400"
        style={{ fontSize: '11px' }}
      >
        {totalDisplayPages} page{totalDisplayPages !== 1 ? 's' : ''}
      </div>
    </aside>
  );
}

export default Sidebar;
