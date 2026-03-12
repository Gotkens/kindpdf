// App.js — KindPDF Frontend Root Component
// This is the main React component.
// Right now it just calls the Flask backend to confirm both halves
// of the app are running and can talk to each other.
// In Phase 1 we will replace this with the real PDF editor UI.

import { useState, useEffect } from 'react';

function App() {
  // Holds the message returned from the Flask backend
  const [backendMessage, setBackendMessage] = useState('Connecting to backend...');
  const [statusColor, setStatusColor] = useState('#f0fdf4');
  const [borderColor, setBorderColor] = useState('#86efac');
  const [textColor, setTextColor] = useState('#166534');

  useEffect(() => {
    // When the page loads, call the Flask backend
    fetch('http://localhost:5000/api/hello')
      .then(response => response.json())
      .then(data => {
        setBackendMessage(data.message);
      })
      .catch(() => {
        setBackendMessage('Could not reach the backend. Is the Flask server running?');
        setStatusColor('#fef2f2');
        setBorderColor('#fca5a5');
        setTextColor('#991b1b');
      });
  }, []);

  return (
    <div style={{
      fontFamily: 'sans-serif',
      textAlign: 'center',
      padding: '60px',
      fontSize: '18px',
      maxWidth: '600px',
      margin: '0 auto'
    }}>

      {/* Logo and title */}
      <div style={{ fontSize: '64px', marginBottom: '8px' }}>📄</div>
      <h1 style={{ fontSize: '40px', color: '#1a56db', margin: '0 0 8px 0' }}>
        KindPDF
      </h1>
      <p style={{ color: '#6b7280', marginTop: '0', fontSize: '18px' }}>
        The PDF editor anyone can use.
      </p>

      <hr style={{ margin: '32px auto', width: '300px', borderColor: '#e5e7eb' }} />

      {/* Phase label */}
      <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>
        PHASE 0 — ENVIRONMENT SETUP
      </p>

      {/* Backend status box */}
      <p style={{ fontWeight: 'bold', marginBottom: '12px' }}>
        Backend connection status:
      </p>
      <div style={{
        background: statusColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '18px 24px',
        display: 'inline-block',
        color: textColor,
        fontSize: '16px',
        minWidth: '300px'
      }}>
        {backendMessage}
      </div>

      <hr style={{ margin: '32px auto', width: '300px', borderColor: '#e5e7eb' }} />

      {/* What's next */}
      <p style={{ color: '#6b7280', fontSize: '15px' }}>
        ✅ React frontend running<br />
        ✅ Flask backend connected<br />
        🔜 Phase 1: Build the PDF editor
      </p>

    </div>
  );
}

export default App;