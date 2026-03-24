// frontend/src/components/MergeModal.js
// KindPDF — Merge PDF Modal
//
// A 2-step guided flow for merging a second PDF into the current document:
//   Step 1: Choose a PDF file to insert
//   Step 2: Pick where to insert it (before page 1, after page N, at end)
//
// Design rules:
//   - Plain English — "Insert another PDF" not "Merge PDFs"
//   - Step indicator (Step 1 of 2, Step 2 of 2)
//   - Every button has icon + text
//   - Cancel always available
//   - 16px minimum text
//   - Works on mobile

import React, { useState, useRef } from 'react';

/**
 * MergeModal
 *
 * Props:
 *   isOpen         {bool}   — whether the modal is visible
 *   currentNumPages {number} — number of pages in the current document
 *   currentFilename {string} — current working PDF filename (for backend call)
 *   onClose        {fn}     — called when user cancels
 *   onMergeComplete {fn(newFilename, newNumPages)} — called after successful merge
 */
function MergeModal({ isOpen, currentNumPages, currentFilename, onClose, onMergeComplete }) {
  const [step, setStep]                 = useState(1);
  const [uploadedFilename, setUploadedFilename] = useState(null);  // server filename after upload
  const [uploadedName, setUploadedName]         = useState('');    // original name for display
  const [uploadedNumPages, setUploadedNumPages] = useState(0);
  const [insertAfterPage, setInsertAfterPage]   = useState(-1);    // -1 = append at end
  const [isUploading, setIsUploading]           = useState(false);
  const [isMerging, setIsMerging]               = useState(false);
  const [errorMsg, setErrorMsg]                 = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // ── Step 1: Upload the second PDF ──────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Please choose a PDF file.');
      return;
    }

    setErrorMsg('');
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed.');
      }

      // Count pages by loading the PDF briefly with PDF.js
      // We use a quick fetch + getDocument to get numPages
      const pdfUrl = `http://localhost:5000/api/pdf/${encodeURIComponent(data.filename)}`;
      const { getDocument } = await import('pdfjs-dist');
      const pdfTask = getDocument(pdfUrl);
      const pdfDoc  = await pdfTask.promise;
      const numPages = pdfDoc.numPages;
      pdfDoc.destroy();

      setUploadedFilename(data.filename);
      setUploadedName(file.name);
      setUploadedNumPages(numPages);
      setInsertAfterPage(-1); // default: append at end
      setStep(2);

    } catch (err) {
      setErrorMsg(`Could not load that file: ${err.message}`);
    } finally {
      setIsUploading(false);
      // Reset file input so picking the same file again triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Step 2: Confirm the merge ───────────────────────────────────────────────
  const handleMerge = async () => {
    setErrorMsg('');
    setIsMerging(true);

    try {
      const res = await fetch('http://localhost:5000/api/merge-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseFilename:    currentFilename,
          mergeFilename:   uploadedFilename,
          insertAfterPage: insertAfterPage,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Merge failed.');
      }

      // Notify parent — it will reload the viewer with the new file
      onMergeComplete(data.filename, data.numPages);
      handleClose();

    } catch (err) {
      setErrorMsg(`Something went wrong: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  // Reset all state on close
  const handleClose = () => {
    setStep(1);
    setUploadedFilename(null);
    setUploadedName('');
    setUploadedNumPages(0);
    setInsertAfterPage(-1);
    setErrorMsg('');
    setIsUploading(false);
    setIsMerging(false);
    onClose();
  };

  // Build insertion position options
  const positionOptions = [
    { value: 0,  label: 'At the very beginning (before page 1)' },
    ...Array.from({ length: currentNumPages }, (_, i) => ({
      value: i + 1,
      label: `After page ${i + 1}`,
    })),
    { value: -1, label: `At the end (after page ${currentNumPages})` },
  ];

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
      onClick={handleClose}
    >
      {/* Dialog panel */}
      <div
        className="bg-white rounded-xl shadow-2xl mx-4 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200">
          <div>
            <h2
              id="merge-modal-title"
              className="font-semibold text-gray-900"
              style={{ fontSize: '18px' }}
            >
              📎 Insert Another PDF
            </h2>
            <p className="text-gray-500 mt-0.5" style={{ fontSize: '14px' }}>
              Step {step} of 2
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Cancel and close"
            aria-label="Cancel and close"
          >
            ✕
          </button>
        </div>

        {/* Step progress bar */}
        <div className="flex h-1">
          <div className={`h-full bg-blue-500 transition-all duration-300 ${step >= 1 ? 'flex-1' : 'flex-0'}`} />
          <div className={`h-full bg-blue-500 transition-all duration-300 ${step >= 2 ? 'flex-1' : 'flex-0 bg-gray-200'}`}
               style={{ backgroundColor: step >= 2 ? '#3b82f6' : '#e5e7eb' }} />
        </div>

        <div className="p-6">

          {/* ── Step 1: Choose file ── */}
          {step === 1 && (
            <div>
              <p className="text-gray-700 mb-5" style={{ fontSize: '16px' }}>
                Choose the PDF you want to insert into this document.
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Choose a PDF file to insert"
              />

              {/* Styled file picker button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-3 px-4 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontSize: '16px', minHeight: '80px' }}
                title="Click to choose a PDF file from your computer"
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading file…</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl">📂</span>
                    <div className="text-left">
                      <div className="font-medium">Choose a PDF file</div>
                      <div style={{ fontSize: '14px' }}>Click to browse your computer</div>
                    </div>
                  </>
                )}
              </button>

              {/* Error message */}
              {errorMsg && (
                <p className="mt-3 text-red-600 text-sm flex items-center gap-1">
                  ⚠️ {errorMsg}
                </p>
              )}
            </div>
          )}

          {/* ── Step 2: Choose insertion point ── */}
          {step === 2 && (
            <div>
              {/* Info about the file being merged */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5 flex items-start gap-2">
                <span className="text-blue-500 text-lg">📄</span>
                <div>
                  <p className="font-medium text-blue-800" style={{ fontSize: '15px' }}>
                    {uploadedName}
                  </p>
                  <p className="text-blue-600" style={{ fontSize: '14px' }}>
                    {uploadedNumPages} page{uploadedNumPages !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <label
                htmlFor="insert-position"
                className="block font-medium text-gray-700 mb-2"
                style={{ fontSize: '16px' }}
              >
                Where should these pages be inserted?
              </label>
              <select
                id="insert-position"
                value={insertAfterPage}
                onChange={e => setInsertAfterPage(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              >
                {positionOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <p className="text-gray-500 mt-3" style={{ fontSize: '14px' }}>
                After inserting, your document will have{' '}
                <strong>{currentNumPages + uploadedNumPages}</strong> pages total.
              </p>

              {/* Error message */}
              {errorMsg && (
                <p className="mt-3 text-red-600 text-sm flex items-center gap-1">
                  ⚠️ {errorMsg}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-6">
                {/* Back to step 1 */}
                <button
                  onClick={() => { setStep(1); setErrorMsg(''); }}
                  disabled={isMerging}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                  style={{ fontSize: '16px' }}
                  title="Go back and choose a different file"
                >
                  ← Back
                </button>

                {/* Confirm merge */}
                <button
                  onClick={handleMerge}
                  disabled={isMerging}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
                  style={{ fontSize: '16px' }}
                  title="Insert the chosen pages at the selected position"
                >
                  {isMerging ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Inserting…
                    </>
                  ) : (
                    <>📎 Insert Pages</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Cancel button — always visible in step 1 */}
          {step === 1 && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                style={{ fontSize: '16px' }}
              >
                ✕ Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MergeModal;
