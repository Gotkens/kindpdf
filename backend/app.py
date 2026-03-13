# backend/app.py
# KindPDF — Flask Backend
# Phase 1.1: PDF Viewer support
#
# Routes:
#   GET  /api/hello        — health check (from Phase 0)
#   POST /api/upload       — receive a PDF, return it for viewing
#   GET  /api/pdf/<filename> — serve a stored PDF file

import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Allow requests from the React frontend on port 3000
CORS(app)

# Folder where uploaded PDFs are temporarily stored
# In production this would be a proper storage solution
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Only allow PDF files
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    """Check that the uploaded file is a PDF."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/api/hello')
def hello():
    """Health check endpoint from Phase 0."""
    return jsonify({'message': 'KindPDF backend is running!'})


@app.route('/api/upload', methods=['POST'])
def upload_pdf():
    """
    Receive a PDF file from the browser.
    Save it with a unique name so multiple users don't clash.
    Return the filename so the frontend can request it back for viewing.
    """
    # Make sure a file was actually sent
    if 'file' not in request.files:
        return jsonify({'error': 'No file was sent. Please choose a PDF file.'}), 400

    file = request.files['file']

    # Make sure the user didn't submit an empty file field
    if file.filename == '':
        return jsonify({'error': 'No file was selected. Please choose a PDF file.'}), 400

    # Make sure it's actually a PDF
    if not allowed_file(file.filename):
        return jsonify({'error': 'That file type is not supported. Please choose a PDF file.'}), 400

    # Create a unique filename to avoid collisions (e.g. two people upload "form.pdf")
    unique_id = str(uuid.uuid4())
    safe_name = secure_filename(file.filename)
    stored_filename = f"{unique_id}_{safe_name}"

    # Save the file
    save_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    file.save(save_path)

    # Return the stored filename — the frontend will use this to load the PDF
    return jsonify({
        'success': True,
        'filename': stored_filename,
        'original_name': safe_name
    })


@app.route('/api/pdf/<filename>')
def serve_pdf(filename):
    """
    Serve a stored PDF file back to the browser.
    PDF.js in the frontend will call this URL to render the document.
    """
    return send_from_directory(UPLOAD_FOLDER, filename)


if __name__ == '__main__':
    print("KindPDF backend starting on http://localhost:5000")
    app.run(debug=True, port=5000)