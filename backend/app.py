# backend/app.py
# KindPDF — Flask Backend
# Phase 1.2: Annotation saving added
#
# Routes:
#   GET  /api/hello                — health check (Phase 0)
#   POST /api/upload               — receive a PDF, return it for viewing
#   GET  /api/pdf/<filename>       — serve a stored PDF file
#   POST /api/save-annotations     — embed annotations into PDF, return for download

import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Allow requests from the React frontend on port 3000
CORS(app)

# Folder where uploaded PDFs are temporarily stored
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf'}


def allowed_file(filename):
    """Check that the uploaded file is a PDF."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def merge_rects_into_lines(rects):
    """
    Merge a list of word-level highlight rects into continuous line spans,
    matching the same logic used on the frontend (mergeRectsIntoLines).

    Words on the same line (similar y and h) are merged from leftmost x to
    rightmost x, filling gaps between words so each screen pixel is covered
    by exactly ONE rect. This prevents opacity stacking in the saved PDF when
    the user dragged over the same area multiple times.

    Args:
        rects: list of dicts with keys x, y, w, h

    Returns:
        list of merged dicts with keys x, y, w, h
    """
    if not rects:
        return rects
    # Sort top-to-bottom, then left-to-right within each line
    sorted_rects = sorted(rects, key=lambda r: (r['y'] if abs(r['y'] - rects[0]['y']) >= 4 else 0, r['x']))
    # Re-sort properly: primary key y (grouped by 4px tolerance), secondary key x
    sorted_rects = sorted(rects, key=lambda r: (round(r['y'] / 4), r['x']))
    merged = []
    cur = None
    for r in sorted_rects:
        if cur is None or abs(r['y'] - cur['y']) > 4 or abs(r['h'] - cur['h']) > 4:
            # New line
            cur = {'x': r['x'], 'y': r['y'], 'w': r['w'], 'h': r['h']}
            merged.append(cur)
        else:
            # Same line — extend to cover this rect
            right = max(cur['x'] + cur['w'], r['x'] + r['w'])
            cur['x'] = min(cur['x'], r['x'])
            cur['w'] = right - cur['x']
    return merged


def collect_highlight_rects(page_annotations):
    """
    Collect all highlight rects across all highlight annotations on a page,
    grouped by color. Returns a dict: { color_str: [merged rects] }.

    By merging all rects of the same color before drawing, we ensure each
    pixel is painted exactly once — no opacity stacking regardless of how
    many times the user dragged over the same area.
    """
    by_color = {}
    for ann in page_annotations:
        if ann.get('type') != 'highlight':
            continue
        color_str = ann.get('color', 'rgba(255,235,59,0.45)')
        if color_str not in by_color:
            by_color[color_str] = []
        by_color[color_str].extend(ann.get('rects', []))
    # Merge each color's rects into non-overlapping line spans
    return {color_str: merge_rects_into_lines(rects) for color_str, rects in by_color.items()}


def parse_color(color_str):
    """
    Convert a CSS color string to a (r, g, b) tuple with values 0.0–1.0.
    Handles: rgba(...), rgb(...), and #rrggbb hex strings.
    Returns black (0, 0, 0) as the fallback.
    """
    if not color_str:
        return (0, 0, 0)
    try:
        if color_str.startswith('rgba('):
            parts = color_str[5:-1].split(',')
            r = float(parts[0].strip()) / 255
            g = float(parts[1].strip()) / 255
            b = float(parts[2].strip()) / 255
            return (r, g, b)
        elif color_str.startswith('rgb('):
            parts = color_str[4:-1].split(',')
            r = float(parts[0].strip()) / 255
            g = float(parts[1].strip()) / 255
            b = float(parts[2].strip()) / 255
            return (r, g, b)
        elif color_str.startswith('#'):
            h = color_str[1:]
            if len(h) == 3:
                h = ''.join(c * 2 for c in h)
            r = int(h[0:2], 16) / 255
            g = int(h[2:4], 16) / 255
            b = int(h[4:6], 16) / 255
            return (r, g, b)
    except Exception:
        pass
    return (0, 0, 0)


def parse_fill_opacity(color_str):
    """
    Extract opacity from an rgba(...) string.
    Returns 1.0 for solid colors or if parsing fails.
    """
    if color_str and color_str.startswith('rgba('):
        try:
            parts = color_str[5:-1].split(',')
            return float(parts[3].strip())
        except Exception:
            pass
    return 1.0


@app.route('/api/hello')
def hello():
    """Health check endpoint from Phase 0."""
    return jsonify({'message': 'KindPDF backend is running!'})


@app.route('/api/upload', methods=['POST'])
def upload_pdf():
    """
    Receive a PDF file from the browser.
    Save it with a unique name and return the filename so the
    frontend can request it back for viewing.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file was sent. Please choose a PDF file.'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file was selected. Please choose a PDF file.'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'That file type is not supported. Please choose a PDF file.'}), 400

    unique_id = str(uuid.uuid4())
    safe_name = secure_filename(file.filename)
    stored_filename = f"{unique_id}_{safe_name}"

    save_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    file.save(save_path)

    return jsonify({
        'success': True,
        'filename': stored_filename,
        'original_name': safe_name
    })


@app.route('/api/pdf/<filename>')
def serve_pdf(filename):
    """Serve a stored PDF file back to the browser for rendering."""
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/save-annotations', methods=['POST'])
def save_annotations():
    """
    Receive annotation data from the frontend, draw the annotations
    permanently into the PDF using PyMuPDF, and return the result
    as a downloadable file.

    Expected JSON body:
    {
      "filename": "uuid_original.pdf",
      "annotations": {
        "1": [
          { "type": "highlight", "rects": [{x, y, w, h}], "color": "rgba(...)" },
          { "type": "pen", "points": [{x, y}], "color": "#...", "width": 3 },
          { "type": "textbox", "x": 100, "y": 200, "text": "...", "fontSize": 14, "color": "#..." },
          { "type": "sticky", "x": 50, "y": 50, "text": "...", "fontSize": 12 },
          { "type": "underline", "rects": [...], "color": "#..." },
          { "type": "strikethrough", "rects": [...], "color": "#..." }
        ],
        "2": [ ... ]
      }
    }

    Coordinates are in normalized PDF points (at scale=1.0, 1 pixel = 1 PDF point).
    """
    try:
        import fitz  # PyMuPDF — install with: pip install pymupdf
    except ImportError:
        return jsonify({
            'error': 'The save feature requires PyMuPDF. Please run: pip install pymupdf in your backend folder.'
        }), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    filename = data.get('filename')
    annotations = data.get('annotations', {})

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400

    # Sanitize the filename to prevent path traversal
    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        for page_str, page_annotations in annotations.items():
            page_num = int(page_str) - 1  # Convert 1-based to 0-based index
            if page_num < 0 or page_num >= doc.page_count:
                continue

            page = doc[page_num]

            # ── Highlights: merge all rects across all highlight annotations
            # of the same color BEFORE drawing, so each pixel is painted exactly
            # once. This prevents opacity stacking when the user dragged over the
            # same area multiple times (the frontend fixes this visually; we must
            # fix it here so the saved PDF matches).
            highlight_rects_by_color = collect_highlight_rects(page_annotations)
            for color_str, merged_rects in highlight_rects_by_color.items():
                fill_color = parse_color(color_str)
                opacity = parse_fill_opacity(color_str)
                for r in merged_rects:
                    rect = fitz.Rect(r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])
                    page.draw_rect(
                        rect,
                        fill=fill_color,
                        fill_opacity=min(opacity, 0.45),
                        width=0,
                        overlay=True
                    )

            for ann in page_annotations:
                ann_type = ann.get('type')
                color = parse_color(ann.get('color', '#000000'))
                opacity = parse_fill_opacity(ann.get('color', ''))

                # ── Highlight — already drawn above via merged rects; skip here ──
                if ann_type == 'highlight':
                    continue

                # ── Underline ──
                elif ann_type == 'underline':
                    for r in ann.get('rects', []):
                        y = r['y'] + r['h']
                        page.draw_line(
                            fitz.Point(r['x'], y),
                            fitz.Point(r['x'] + r['w'], y),
                            color=color,
                            width=1.5
                        )

                # ── Strikethrough ──
                elif ann_type == 'strikethrough':
                    for r in ann.get('rects', []):
                        y = r['y'] + r['h'] * 0.55
                        page.draw_line(
                            fitz.Point(r['x'], y),
                            fitz.Point(r['x'] + r['w'], y),
                            color=color,
                            width=1.5
                        )

                # ── Pen / freehand drawing ──
                elif ann_type == 'pen':
                    points = ann.get('points', [])
                    pen_width = ann.get('width', 2)
                    if len(points) >= 2:
                        # Use a Shape so we can draw a connected polyline with proper line joins.
                        # Page.draw_line() does not support round caps — Shape.finish() does.
                        pts = [fitz.Point(p['x'], p['y']) for p in points]
                        shape = page.new_shape()
                        shape.draw_polyline(pts)
                        shape.finish(color=color, width=pen_width, closePath=False)
                        shape.commit()

                # ── Text box ──
                elif ann_type == 'textbox':
                    x = ann.get('x', 0)
                    y = ann.get('y', 0)
                    text = ann.get('text', '')
                    font_size = ann.get('fontSize', 14)
                    is_bold = ann.get('isBold', False)
                    is_underline = ann.get('isUnderline', False)
                    # Use built-in bold font when requested; helv = Helvetica, hebo = Helvetica Bold
                    fontname = 'hebo' if is_bold else 'helv'
                    if text:
                        lines = text.split('\n')
                        line_height = font_size * 1.4
                        for i, line in enumerate(lines):
                            if not line:
                                continue
                            baseline_y = y + i * line_height
                            page.insert_text(
                                fitz.Point(x, baseline_y),
                                line,
                                fontsize=font_size,
                                fontname=fontname,
                                color=color
                            )
                            # Draw underline as a line just below the baseline
                            if is_underline:
                                approx_width = len(line) * font_size * 0.55
                                page.draw_line(
                                    fitz.Point(x, baseline_y + 2),
                                    fitz.Point(x + approx_width, baseline_y + 2),
                                    color=color,
                                    width=1
                                )

                # ── Sticky note ──
                elif ann_type == 'sticky':
                    x = ann.get('x', 0)
                    y = ann.get('y', 0)
                    text = ann.get('text', '')
                    font_size = ann.get('fontSize', 12)
                    if text:
                        lines = text.split('\n')
                        # Estimate box dimensions
                        char_width = font_size * 0.55
                        max_line_len = max(len(l) for l in lines) if lines else 1
                        box_w = max(max_line_len * char_width + 16, 80)
                        header_h = 18
                        line_height = font_size * 1.4
                        box_h = header_h + len(lines) * line_height + 10

                        # Yellow background
                        box_rect = fitz.Rect(x, y, x + box_w, y + box_h)
                        page.draw_rect(
                            box_rect,
                            fill=(1.0, 0.98, 0.76),
                            fill_opacity=0.95,
                            color=(0.85, 0.47, 0.04),
                            width=1.5
                        )
                        # Header strip
                        header_rect = fitz.Rect(x, y, x + box_w, y + header_h)
                        page.draw_rect(
                            header_rect,
                            fill=(0.99, 0.90, 0.54),
                            fill_opacity=0.9,
                            color=(0.85, 0.47, 0.04),
                            width=0.5
                        )
                        # Header label
                        page.insert_text(
                            fitz.Point(x + 4, y + header_h - 4),
                            'NOTE',
                            fontsize=9,
                            color=(0.57, 0.25, 0.04)
                        )
                        # Note text lines
                        for i, line in enumerate(lines):
                            page.insert_text(
                                fitz.Point(x + 6, y + header_h + 8 + (i + 1) * line_height),
                                line,
                                fontsize=font_size,
                                color=(0.11, 0.10, 0.10)
                            )

        # Save annotated PDF to a new file
        output_filename = f'annotated_{safe_filename}'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()

        return send_from_directory(
            UPLOAD_FOLDER,
            output_filename,
            as_attachment=True,
            download_name=f'annotated_{filename}'
        )

    except Exception as e:
        print(f'Error saving annotations: {e}')
        return jsonify({'error': f'Something went wrong while saving: {str(e)}'}), 500


if __name__ == '__main__':
    print("KindPDF backend starting on http://localhost:5000")
    app.run(debug=True, port=5000)
