// frontend/src/components/HomeScreen.js
// KindPDF — Home / Upload Screen
//
// This is the first thing users see. It must be immediately obvious
// what to do. The Grandma Test: can she figure it out in 5 seconds?
// Answer: yes — there's one big action and clear instructions.

import React, { useState, useCallback } from 'react';

function HomeScreen({ onPdfLoaded }) {
  const [isDragging, setIsDragging] = useState(false);  // Highlight drop zone when dragging
  const [isLoading, setIsLoading] = useState(false);    // Show spinner during upload
  const [errorMessage, setErrorMessage] = useState(''); // Plain English errors

  // Upload a file to the backend and notify the parent when done
  const uploadFile = async (file) => {
    // Clear any previous error
    setErrorMessage('');

    // Validate it's a PDF before even sending to the server
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('That file is not a PDF. Please choose a file that ends in .pdf');
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // Server returned an error — show the plain English message from the backend
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
        return;
      }

      // Success! Tell the parent component to switch to the viewer
      onPdfLoaded(data.filename, data.original_name);

    } catch (err) {
      // Network error or server not running
      setErrorMessage(
        'Could not connect to KindPDF. Make sure the app is running and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, []);

  // "Choose a file" button click — opens system file picker
  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">K</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">KindPDF</h1>
            <p className="text-sm text-gray-500">The PDF editor anyone can use</p>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">

        <div className="w-full max-w-2xl">

          {/* Headline */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              What would you like to do?
            </h2>
            <p className="text-lg text-gray-600">
              Open a PDF file to get started. You can view, sign, fill out forms, and more.
            </p>
          </div>

          {/* ── Drop Zone ── */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-4 border-dashed rounded-2xl p-12
              flex flex-col items-center justify-center gap-5
              transition-all duration-200 cursor-pointer
              ${isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
              }
            `}
            onClick={() => document.getElementById('file-input').click()}
            role="button"
            aria-label="Drop your PDF here or click to choose a file"
          >
            {/* Hidden file input — triggered by clicking the drop zone */}
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileInput}
            />

            {isLoading ? (
              /* Loading spinner */
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xl text-gray-700 font-medium">Opening your PDF…</p>
                <p className="text-gray-500">This will only take a moment</p>
              </div>
            ) : (
              /* Default state */
              <>
                {/* Big PDF icon */}
                <div className="w-24 h-24 flex items-center justify-center">
                  <svg viewBox="0 0 80 80" className="w-full h-full" aria-hidden="true">
                    <rect x="10" y="5" width="45" height="60" rx="4" fill="#E5E7EB" />
                    <rect x="14" y="9" width="37" height="52" rx="3" fill="white" stroke="#D1D5DB" strokeWidth="1" />
                    <path d="M35 5 L55 25 L55 65 Q55 69 51 69 L10 69 Q6 69 6 65 L6 9 Q6 5 10 5 Z" fill="#EFF6FF" />
                    <path d="M35 5 L35 25 L55 25" fill="none" stroke="#93C5FD" strokeWidth="2" />
                    <rect x="16" y="32" width="28" height="3" rx="1.5" fill="#93C5FD" />
                    <rect x="16" y="40" width="22" height="3" rx="1.5" fill="#BFDBFE" />
                    <rect x="16" y="48" width="25" height="3" rx="1.5" fill="#BFDBFE" />
                    <circle cx="60" cy="58" r="16" fill="#2563EB" />
                    <path d="M53 58 L67 58 M60 51 L67 58 L60 65" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-800 mb-2">
                    {isDragging ? 'Drop your PDF here!' : 'Drag your PDF here to get started'}
                  </p>
                  <p className="text-gray-500 text-lg">or</p>
                </div>

                {/* Choose file button */}
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg px-8 py-4 rounded-xl transition-colors flex items-center gap-3 shadow-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('file-input').click();
                  }}
                  aria-label="Choose a PDF file from your computer"
                >
                  {/* Folder icon */}
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  Choose a File
                </button>

                <p className="text-gray-400 text-base">PDF files only</p>
              </>
            )}
          </div>

          {/* ── Error Message ── */}
          {errorMessage && (
            <div
              className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-4"
              role="alert"
            >
              {/* Warning icon */}
              <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-red-800 text-lg">Oops — something went wrong</p>
                <p className="text-red-700 mt-1">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* ── Feature hints ── */}
          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: '✍️', label: 'Sign documents' },
              { icon: '📝', label: 'Fill out forms' },
              { icon: '🔍', label: 'Search text' },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="text-4xl mb-2">{item.icon}</div>
                <p className="text-gray-700 font-medium text-base">{item.label}</p>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-6 text-gray-400 text-sm">
        KindPDF — Free and open source — Your files stay private
      </footer>

    </div>
  );
}

export default HomeScreen;