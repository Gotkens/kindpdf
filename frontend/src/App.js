// frontend/src/App.js
// KindPDF — Root component
// Controls whether we show the home screen or the PDF viewer.

import React, { useState } from 'react';
import HomeScreen from './components/HomeScreen';
import PDFViewer from './components/PDFViewer';

function App() {
  // When a PDF is loaded, we store its URL and name here.
  // null means no PDF is open — show the home screen.
  const [pdfFile, setPdfFile] = useState(null);  // URL to fetch from backend
  const [pdfName, setPdfName] = useState('');    // Display name for the title bar

  // Store the backend filename so PDFViewer can send it back for save-annotations
  const [pdfFilename, setPdfFilename] = useState('');

  // Called by HomeScreen when the user successfully uploads a PDF.
  // filename = the unique name the backend assigned
  // originalName = the human-readable filename (e.g. "my-contract.pdf")
  const handlePdfLoaded = (filename, originalName) => {
    setPdfFile(`/api/pdf/${filename}`);
    setPdfName(originalName);
    setPdfFilename(filename);
  };

  // Called when the user clicks "Open a different file"
  const handleClose = () => {
    setPdfFile(null);
    setPdfName('');
    setPdfFilename('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {pdfFile ? (
        <PDFViewer
          pdfUrl={pdfFile}
          pdfName={pdfName}
          pdfFilename={pdfFilename}
          onClose={handleClose}
        />
      ) : (
        <HomeScreen onPdfLoaded={handlePdfLoaded} />
      )}
    </div>
  );
}

export default App;