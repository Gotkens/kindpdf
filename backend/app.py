# app.py — KindPDF Backend
# This is the main Flask server.
# Right now it just confirms the backend is running.
# In Phase 1 we will add PDF handling here.

from flask import Flask, jsonify
from flask_cors import CORS

# Create the Flask app
app = Flask(__name__)

# Allow the React frontend (running on port 3000) to talk to this server
CORS(app)


@app.route('/api/hello')
def hello():
    """Test endpoint — confirms the backend is alive and reachable."""
    return jsonify({
        'message': 'KindPDF backend is running!',
        'status': 'ok'
    })


if __name__ == '__main__':
    # Port 5000 — React frontend will call this address
    # debug=True means the server restarts automatically when you save changes
    app.run(debug=True, port=5000)