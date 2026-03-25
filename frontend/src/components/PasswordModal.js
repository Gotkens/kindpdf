// frontend/src/components/PasswordModal.js
// KindPDF — Phase 1.6: Password Protect / Unlock modal
//
// Two-tab modal accessible from the Toolbar:
//   Tab 1 "Add a Password"  — password + confirm → POST /api/protect-pdf → browser download
//   Tab 2 "Remove Password" — password            → POST /api/unlock-pdf  → browser download
//
// Design rules honoured:
//   #1  Every button has an icon AND a text label
//   #2  Plain English only — no crypto jargon
//   #3  Confirmation before the action (the modal IS the confirmation step)
//   #5  16px minimum text / WCAG AA contrast
//   #6  Tooltips on every interactive control
//   #8  Plain-English error messages — never raw codes
//   #9  Works on mobile (full-screen on small viewports)

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:5000';

// ── Icon helpers (inline SVG, no external dependency) ─────────────────────────

function LockClosedIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function LockOpenIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  );
}

function EyeIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function CheckCircleIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExclamationIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

// ── Reusable password input with show/hide toggle ─────────────────────────────

function PasswordInput({ id, value, onChange, placeholder, label, tooltip, autoFocus = false }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-base font-medium text-gray-800 mb-1">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          title={tooltip}
          autoFocus={autoFocus}
          autoComplete="new-password"
          className="w-full border border-gray-300 rounded-lg py-2.5 px-3 pr-10 text-base
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          title={show ? 'Hide password' : 'Show password'}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 text-gray-400 hover:text-gray-600 p-1"
          tabIndex={-1}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

function PasswordModal({ filename, onClose }) {
  // 'protect' or 'unlock'
  const [activeTab, setActiveTab] = useState('protect');

  // Protect tab state
  const [protectPassword, setProtectPassword] = useState('');
  const [protectConfirm, setProtectConfirm]   = useState('');
  const [protectLoading, setProtectLoading]   = useState(false);
  const [protectError, setProtectError]       = useState('');
  const [protectSuccess, setProtectSuccess]   = useState(false);

  // Unlock tab state
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockLoading, setUnlockLoading]   = useState(false);
  const [unlockError, setUnlockError]       = useState('');
  const [unlockSuccess, setUnlockSuccess]   = useState(false);

  // Close on Escape key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset tab-specific state when switching tabs
  const switchTab = (tab) => {
    setActiveTab(tab);
    setProtectError('');
    setUnlockError('');
    setProtectSuccess(false);
    setUnlockSuccess(false);
  };

  // ── Trigger a file download from a Blob returned by the API ──────────────
  function triggerDownload(blob, suggestedName) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ── Protect PDF ───────────────────────────────────────────────────────────
  const handleProtect = async () => {
    setProtectError('');
    setProtectSuccess(false);

    // Client-side validation — plain English
    if (!protectPassword) {
      setProtectError('Please enter a password.');
      return;
    }
    if (protectPassword.length < 4) {
      setProtectError('Your password must be at least 4 characters long.');
      return;
    }
    if (protectPassword !== protectConfirm) {
      setProtectError("The passwords don't match. Please re-enter them and try again.");
      return;
    }

    setProtectLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/protect-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, password: protectPassword }),
      });

      if (!response.ok) {
        // Try to read a JSON error message from the server
        let msg = 'Something went wrong. Please try again.';
        try {
          const json = await response.json();
          if (json.error) msg = json.error;
        } catch (_) { /* ignore parse error, keep default message */ }
        setProtectError(msg);
        return;
      }

      // Success — response body is the protected PDF file
      const blob = await response.blob();
      triggerDownload(blob, 'protected.pdf');
      setProtectSuccess(true);
      setProtectPassword('');
      setProtectConfirm('');

    } catch (err) {
      console.error('protect-pdf error:', err);
      setProtectError('Could not reach the server. Please make sure the app is running and try again.');
    } finally {
      setProtectLoading(false);
    }
  };

  // ── Unlock PDF ────────────────────────────────────────────────────────────
  const handleUnlock = async () => {
    setUnlockError('');
    setUnlockSuccess(false);

    if (!unlockPassword) {
      setUnlockError('Please enter the current password for this file.');
      return;
    }

    setUnlockLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/unlock-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, password: unlockPassword }),
      });

      if (!response.ok) {
        let msg = 'Something went wrong. Please try again.';
        try {
          const json = await response.json();
          if (json.error) msg = json.error;
        } catch (_) { /* ignore */ }
        setUnlockError(msg);
        return;
      }

      const blob = await response.blob();
      triggerDownload(blob, 'unlocked.pdf');
      setUnlockSuccess(true);
      setUnlockPassword('');

    } catch (err) {
      console.error('unlock-pdf error:', err);
      setUnlockError('Could not reach the server. Please make sure the app is running and try again.');
    } finally {
      setUnlockLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    /* Backdrop — clicking outside the panel closes the modal */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Password settings"
    >
      {/* Panel — stop clicks from bubbling to the backdrop */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <LockClosedIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Password Settings</h2>
              <p className="text-sm text-gray-500">Protect or unlock this PDF</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close this panel"
            aria-label="Close password settings"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-100 px-6 pt-4 gap-1">
          <button
            onClick={() => switchTab('protect')}
            title="Add a password so others must enter it to open this file"
            aria-selected={activeTab === 'protect'}
            className={`flex items-center gap-2 px-4 py-2.5 text-base font-medium rounded-t-lg border-b-2 transition-colors
              ${activeTab === 'protect'
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`}
          >
            <LockClosedIcon className="w-4 h-4" />
            Add a Password
          </button>
          <button
            onClick={() => switchTab('unlock')}
            title="Remove the existing password from this file"
            aria-selected={activeTab === 'unlock'}
            className={`flex items-center gap-2 px-4 py-2.5 text-base font-medium rounded-t-lg border-b-2 transition-colors
              ${activeTab === 'unlock'
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`}
          >
            <LockOpenIcon className="w-4 h-4" />
            Remove Password
          </button>
        </div>

        {/* ── Tab: Add a Password ── */}
        {activeTab === 'protect' && (
          <div className="px-6 py-5 space-y-4">

            <p className="text-base text-gray-600">
              Anyone who wants to open this file will need to enter the password you choose.
            </p>

            <PasswordInput
              id="protect-pw"
              value={protectPassword}
              onChange={setProtectPassword}
              placeholder="Enter a password"
              label="New password"
              tooltip="Choose a password that others will need to open this file"
              autoFocus
            />

            <PasswordInput
              id="protect-pw-confirm"
              value={protectConfirm}
              onChange={setProtectConfirm}
              placeholder="Re-enter the same password"
              label="Confirm password"
              tooltip="Type your password again to make sure it's correct"
            />

            {/* Error message */}
            {protectError && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <ExclamationIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-base">{protectError}</p>
              </div>
            )}

            {/* Success message */}
            {protectSuccess && (
              <div className="flex items-start gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-base">
                  Your protected PDF has been downloaded. Keep your password somewhere safe — it cannot be recovered if lost.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={onClose}
                title="Cancel and close this panel"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
              <button
                onClick={handleProtect}
                disabled={protectLoading}
                title="Save a password-protected copy of this file to your computer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-base font-medium
                           hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {protectLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Protecting…
                  </>
                ) : (
                  <>
                    <LockClosedIcon className="w-4 h-4" />
                    Protect PDF
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ── Tab: Remove Password ── */}
        {activeTab === 'unlock' && (
          <div className="px-6 py-5 space-y-4">

            <p className="text-base text-gray-600">
              Enter the current password to save a copy of this file that anyone can open freely.
            </p>

            <PasswordInput
              id="unlock-pw"
              value={unlockPassword}
              onChange={setUnlockPassword}
              placeholder="Enter the current password"
              label="Current password"
              tooltip="Enter the password that was used to protect this file"
              autoFocus
            />

            {/* Error message */}
            {unlockError && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <ExclamationIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-base">{unlockError}</p>
              </div>
            )}

            {/* Success message */}
            {unlockSuccess && (
              <div className="flex items-start gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-base">
                  Your unlocked PDF has been downloaded. Anyone can now open it without a password.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={onClose}
                title="Cancel and close this panel"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
              <button
                onClick={handleUnlock}
                disabled={unlockLoading}
                title="Save a copy of this file with the password removed"
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-base font-medium
                           hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {unlockLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Removing…
                  </>
                ) : (
                  <>
                    <LockOpenIcon className="w-4 h-4" />
                    Remove Password
                  </>
                )}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default PasswordModal;
