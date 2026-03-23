# backend/app.py
# KindPDF — Flask Backend
# Phase 1.2: Annotation saving added
# Annotation round-trip: reading added
#
# Routes:
#   GET  /api/hello                — health check (Phase 0)
#   POST /api/upload               — receive a PDF, return it for viewing
#   GET  /api/pdf/<filename>       — serve a stored PDF file
#   POST /api/save-annotations     — embed annotations into PDF, return for download
#   GET  /api/annotations/<filename> — read existing native PDF annotations for round-trip loading

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


def _fitz_color_to_rgba(colors_dict, kind):
    """
    Convert a PyMuPDF annotation's colors dict to a CSS rgba() string.

    colors_dict has 'stroke' and 'fill' keys; each is either None or a
    (r, g, b) tuple with values in the 0.0–1.0 range.

    Highlights get 0.45 opacity to match what KindPDF shows on screen.
    All other types default to fully opaque.
    """
    stroke = colors_dict.get('stroke')
    fill   = colors_dict.get('fill')
    rgb    = stroke or fill or (0, 0, 0)
    r, g, b = (int(c * 255) for c in rgb)
    if kind == 'highlight':
        return f'rgba({r},{g},{b},0.45)'
    return f'rgba({r},{g},{b},1)'


def _annot_quads_to_rects(vertices):
    """
    Convert a list of PyMuPDF quad vertices to KindPDF rect dicts.

    PDF markup annotations (highlight, underline, strikethrough) store
    their geometry as a flat list of quad corners — 4 vertices per region.
    We convert each quad to its axis-aligned bounding rect in PDF points,
    matching the {x, y, w, h} format that the frontend already uses.
    """
    rects = []
    if not vertices or len(vertices) < 4:
        return rects
    for i in range(0, len(vertices), 4):
        quad = vertices[i:i + 4]
        if len(quad) < 4:
            break
        xs = [p[0] for p in quad]
        ys = [p[1] for p in quad]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        rects.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0})
    return rects


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


@app.route('/api/annotations/<filename>')
def get_annotations(filename):
    """
    Read existing native PDF annotations from a stored file and return them
    as a JSON array in KindPDF's annotation format.

    Called by the frontend immediately after a PDF finishes loading, so any
    annotations that were previously saved (as native PDF annotation objects)
    reappear as fully editable, undoable annotations when the file is re-opened.

    PyMuPDF annotation type integers → KindPDF type strings:
      0  → "sticky"        (PDF Text — the sticky-note icon)
      2  → "textbox"       (PDF FreeText)
      8  → "highlight"     (PDF Highlight)
      9  → "underline"     (PDF Underline)
      11 → "strikethrough" (PDF StrikeOut)
      15 → "pen"           (PDF Ink — freehand drawing)

    Returns an empty JSON array (not an error) if:
      - The file has no native annotations
      - The file does not exist
      - Any error occurs during reading
    This ensures the PDF always opens cleanly even if round-trip loading fails.

    Coordinate note: PyMuPDF uses the same top-left origin as the KindPDF
    frontend. Coordinates are returned in PDF points at scale=1, matching the
    format that drawSingleAnnotation() and the save route already use.
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for annotation reading.'}), 500

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    # Return an empty array gracefully if the file isn't there — the PDF still opens clean.
    if not os.path.exists(filepath):
        return jsonify([])

    # Map PyMuPDF type integers to KindPDF type strings.
    TYPE_MAP = {
        0:  'sticky',
        2:  'textbox',
        8:  'highlight',
        9:  'underline',
        11: 'strikethrough',
        15: 'pen',
    }

    loaded_annotations = []
    try:
        doc = fitz.open(filepath)
        for page_idx in range(doc.page_count):
            page    = doc[page_idx]
            page_num = page_idx + 1  # KindPDF uses 1-based page numbers

            for ann_idx, annot in enumerate(page.annots()):
                type_int = annot.type[0]
                kind     = TYPE_MAP.get(type_int)
                if kind is None:
                    continue  # Skip annotation types KindPDF doesn't know about

                text_content = annot.info.get('content', '') or ''
                color_str    = _fitz_color_to_rgba(annot.colors, kind)

                ann_obj = {
                    'id':    f'loaded-{page_num}-{ann_idx}',
                    'type':  kind,
                    'page':  page_num,
                    'color': color_str,
                    'text':  text_content,
                }

                if kind == 'sticky':
                    # The icon's top-left corner is the placement point.
                    ann_obj['x']        = annot.rect.x0
                    ann_obj['y']        = annot.rect.y0
                    ann_obj['fontSize'] = 12

                elif kind == 'textbox':
                    # FreeText: top-left of the annotation rect.
                    # Font size was stored in the subject field at save time for exact recovery.
                    ann_obj['x'] = annot.rect.x0
                    ann_obj['y'] = annot.rect.y0
                    subject = annot.info.get('subject', '') or ''
                    try:
                        ann_obj['fontSize'] = int(float(subject))
                    except (ValueError, TypeError):
                        ann_obj['fontSize'] = 14  # Fallback for textboxes from other apps

                elif kind in ('highlight', 'underline', 'strikethrough'):
                    # Markup annotations store geometry as quad vertices (4 pts per region).
                    verts = annot.vertices
                    if verts:
                        ann_obj['rects'] = _annot_quads_to_rects(verts)
                    else:
                        # Fall back to bounding rect if no vertices present.
                        r = annot.rect
                        ann_obj['rects'] = [{'x': r.x0, 'y': r.y0,
                                             'w': r.x1 - r.x0, 'h': r.y1 - r.y0}]

                elif kind == 'pen':
                    # PyMuPDF Ink annotation vertices are a list of strokes, where each
                    # stroke is itself a list of (x, y) point pairs — NOT a flat list of
                    # points. We flatten all strokes into one point list because KindPDF
                    # stores each pen stroke as a single annotation with one point list.
                    # (We write one Ink annotation per KindPDF pen stroke at save time,
                    # so there will always be exactly one stroke in annot.vertices here.)
                    # Stroke width was stored via set_border at save time and is recovered here.
                    points = []
                    if annot.vertices:
                        for stroke in annot.vertices:      # outer loop: each stroke
                            for pt in stroke:              # inner loop: each point in stroke
                                points.append({'x': pt[0], 'y': pt[1]})
                    ann_obj['points'] = points
                    ann_obj['width']  = annot.border.get('width', 2)

                loaded_annotations.append(ann_obj)

        doc.close()

    except Exception as e:
        print(f'KindPDF: error reading annotations from {safe_filename}: {e}')
        return jsonify([])  # Return empty array — PDF still opens clean

    return jsonify(loaded_annotations)


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

            # ── All annotation types are now written as native PDF annotation objects.
            # This replaces the previous flat-graphics approach (draw_rect / draw_line /
            # insert_text / Shape). Native annotations are invisible to PDF.js's canvas
            # renderer (which is suppressed via annotationMode: 0 on the frontend), are
            # readable by any standards-compliant PDF viewer, and — crucially — are
            # picked up by GET /api/annotations/<filename> for full round-trip editing.
            for ann in page_annotations:
                ann_type  = ann.get('type')
                color_rgb = parse_color(ann.get('color', '#000000'))
                opacity   = parse_fill_opacity(ann.get('color', ''))

                # ── Highlight ──
                # Native PDF Highlight annotation. Each KindPDF highlight becomes one
                # annotation whose quads are the merged rects for that annotation object.
                # Opacity is capped at 0.45 to match what KindPDF shows on screen.
                if ann_type == 'highlight':
                    rects = ann.get('rects', [])
                    if rects:
                        quads = [
                            fitz.Rect(r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']).quad
                            for r in rects
                        ]
                        hl = page.add_highlight_annot(quads)
                        hl.set_colors(stroke=color_rgb)
                        hl.set_opacity(min(opacity, 0.45))
                        hl.update()

                # ── Underline ──
                # Native PDF Underline annotation. Quads are built from the word-level rects.
                elif ann_type == 'underline':
                    rects = ann.get('rects', [])
                    if rects:
                        quads = [
                            fitz.Rect(r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']).quad
                            for r in rects
                        ]
                        ul = page.add_underline_annot(quads)
                        ul.set_colors(stroke=color_rgb)
                        ul.update()

                # ── Strikethrough ──
                # Native PDF StrikeOut annotation.
                elif ann_type == 'strikethrough':
                    rects = ann.get('rects', [])
                    if rects:
                        quads = [
                            fitz.Rect(r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']).quad
                            for r in rects
                        ]
                        st = page.add_strikeout_annot(quads)
                        st.set_colors(stroke=color_rgb)
                        st.update()

                # ── Pen / freehand drawing ──
                # Native PDF Ink annotation. Each KindPDF pen stroke becomes one Ink annot
                # with a single ink list. Stroke width is stored via set_border so it
                # survives the round-trip (read back as annot.border['width']).
                elif ann_type == 'pen':
                    points    = ann.get('points', [])
                    pen_width = ann.get('width', 2)
                    if len(points) >= 2:
                        # add_ink_annot requires plain (x, y) float tuples, not fitz.Point objects
                        ink_list = [[(p['x'], p['y']) for p in points]]
                        ink = page.add_ink_annot(ink_list)
                        ink.set_colors(stroke=color_rgb)
                        ink.set_border(width=pen_width)
                        ink.update()

                # ── Text box ──
                # Native PDF FreeText annotation. The bounding rect is estimated from the
                # text content and font size (same sizing heuristic as the frontend uses).
                # Font size is stored in the annotation's subject field so it can be read
                # back exactly on round-trip reload.
                elif ann_type == 'textbox':
                    x         = ann.get('x', 0)
                    y         = ann.get('y', 0)
                    text      = ann.get('text', '')
                    font_size = ann.get('fontSize', 14)
                    is_bold   = ann.get('isBold', False)
                    fontname  = 'hebo' if is_bold else 'helv'
                    if text:
                        lines      = text.split('\n')
                        max_chars  = max(len(l) for l in lines) if lines else 1
                        char_width = font_size * 0.55
                        box_w      = max(max_chars * char_width + 16, 80)
                        box_h      = len(lines) * font_size * 1.4 + 10
                        rect       = fitz.Rect(x, y, x + box_w, y + box_h)
                        tb = page.add_freetext_annot(
                            rect,
                            text,
                            fontsize=font_size,
                            fontname=fontname,
                            text_color=color_rgb,
                            fill_color=None,   # transparent background
                            rotate=0,
                            align=0
                        )
                        # Store font size in subject so the round-trip loader can restore it.
                        tb.set_info(subject=str(font_size))
                        tb.update()

                # ── Sticky note ──
                # Saved as a native PDF "Text" annotation (the standard sticky-note object).
                # In any PDF reader (Acrobat, Preview, etc.) this appears as a clickable icon
                # that opens into an editable popup — not a flat drawn graphic.
                # This also enables round-trip loading: the GET /api/annotations endpoint
                # reads these back as editable KindPDF sticky notes on re-open.
                elif ann_type == 'sticky':
                    x    = ann.get('x', 0)
                    y    = ann.get('y', 0)
                    text = ann.get('text', '')
                    if text:
                        sticky_annot = page.add_text_annot(
                            fitz.Point(x, y),
                            text,
                            icon='Note'
                        )
                        # Amber/yellow colour to match KindPDF's on-screen style.
                        # update() is required after set_colors — without it PyMuPDF does not
                        # write the changed appearance stream back to the annotation object,
                        # which causes the icon to be invisible in thumbnails and PDF viewers.
                        sticky_annot.set_colors(stroke=(0.99, 0.85, 0.20))
                        sticky_annot.update()

                elif ann_type == 'signature':
                    # Signatures are saved as embedded images in the PDF.
                    # The dataUrl is a PNG/JPEG base64 string from the canvas (draw mode)
                    # or a typed/uploaded image. We decode and use page.insert_image() to
                    # place it at the annotation's bounding rect.
                    import base64
                    x        = ann.get('x', 0)
                    y        = ann.get('y', 0)
                    width    = ann.get('width', 200)
                    height   = ann.get('height', 80)
                    data_url = ann.get('dataUrl', '')
                    if data_url and ',' in data_url:
                        # Strip the "data:image/png;base64," prefix
                        image_bytes = base64.b64decode(data_url.split(',', 1)[1])
                        rect = fitz.Rect(x, y, x + width, y + height)
                        # keep_proportion=False fills the rect exactly as positioned by the user
                        page.insert_image(rect, stream=image_bytes, keep_proportion=False)

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
