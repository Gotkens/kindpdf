// frontend/src/components/ConfirmDialog.js
// KindPDF — Reusable Confirmation Dialog
//
// Displays a modal asking the user to confirm a potentially destructive action.
// Design rules:
//   - Plain English — no jargon
//   - Confirm button is clearly the primary action
//   - Cancel is always available and prominent
//   - Minimum 16px text, high contrast
//   - Works on mobile (full-width on small screens)

import React from 'react';

/**
 * ConfirmDialog
 *
 * Props:
 *   isOpen     {bool}     — whether the dialog is visible
 *   title      {string}   — short heading, e.g. "Remove this page?"
 *   message    {string}   — plain English explanation
 *   confirmLabel {string} — text for the confirm button (default: "Yes, do it")
 *   cancelLabel  {string} — text for the cancel button (default: "Cancel")
 *   onConfirm  {fn}       — called when user clicks confirm
 *   onCancel   {fn}       — called when user clicks cancel or the backdrop
 *   danger     {bool}     — if true, confirm button is red (for destructive actions)
 */
function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Yes, do it',
  cancelLabel  = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) {
  if (!isOpen) return null;

  return (
    // Semi-transparent backdrop — clicking it cancels
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      {/* Dialog panel — stop clicks propagating to backdrop */}
      <div
        className="bg-white rounded-xl shadow-2xl p-6 mx-4 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Icon + Title */}
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl mt-0.5" aria-hidden="true">
            {danger ? '⚠️' : '❓'}
          </span>
          <h2
            id="confirm-dialog-title"
            className="text-lg font-semibold text-gray-900"
            style={{ fontSize: '18px' }}
          >
            {title}
          </h2>
        </div>

        {/* Message */}
        <p
          className="text-gray-600 mb-6 leading-relaxed"
          style={{ fontSize: '16px' }}
        >
          {message}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          {/* Cancel — always first in natural reading order */}
          <button
            onClick={onCancel}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors"
            style={{ fontSize: '16px', minHeight: '44px' }}
            aria-label={cancelLabel}
          >
            ✕ {cancelLabel}
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            style={{ fontSize: '16px', minHeight: '44px' }}
            aria-label={confirmLabel}
            autoFocus
          >
            {danger ? '🗑️' : '✓'} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
