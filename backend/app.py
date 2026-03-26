# backend/app.py
# KindPDF — Flask Backend
# Phase 1.2: Annotation saving added
# Phase 1.3: Annotation round-trip reading added
# Phase 1.4: Form filling added (AcroForm read + save, XFA detection)
# Phase 1.5: Page management added (reorder, delete, rotate, extract, merge)
# Phase 1.6: Password protect / unlock added
#
# Routes:
#   GET  /api/hello                    — health check (Phase 0)
#   POST /api/upload                   — receive a PDF, return it for viewing
#   GET  /api/pdf/<filename>           — serve a stored PDF file
#   POST /api/save-annotations         — embed annotations + apply page ops, return for download
#   GET  /api/annotations/<filename>   — read existing native PDF annotations for round-trip loading
#   POST /api/extract-pages            — extract selected pages into a new PDF
#   POST /api/merge-pdf                — merge a second PDF into the current one at a given position
#   GET  /api/form-fields/<filename>   — read AcroForm widgets (or detect XFA) for form filling
#   POST /api/save-form                — write filled field values and return the completed PDF
#   POST /api/protect-pdf              — save a password-protected copy of a PDF (AES-256)
#   POST /api/unlock-pdf               — remove password protection from a PDF

import os
import re
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
    try:
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

    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


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


def pdf_string(s):
    """
    Encode a Python string as a PDF parentheses-delimited string literal,
    with all characters that need escaping properly handled.

    Used as a fallback when widget.update() fails (e.g. on calculated fields
    whose appearance stream creation triggers a PyMuPDF internal error).
    We write the /V key directly via doc.xref_set_key() instead.
    """
    s = str(s) if s is not None else ''
    s = s.replace('\\', '\\\\')
    s = s.replace('(', '\\(')
    s = s.replace(')', '\\)')
    s = s.replace('\r', '\\r')
    s = s.replace('\n', '\\n')
    return f'({s})'


def set_widget_value(doc, widget, new_value):
    """
    Set a form widget's value and attempt to regenerate its appearance stream.

    widget.update() can fail with "cannot create array without a document" on
    calculated fields (and occasionally others with complex appearance streams).
    When that happens we fall back to writing /V directly via doc.xref_set_key(),
    which persists the value correctly — PDF viewers read /V regardless of whether
    the appearance stream is stale.
    """
    type_str = widget.field_type_string

    # Set the in-memory value so widget.update() (if it works) writes it fully.
    if type_str == 'CheckBox':
        is_on = (isinstance(new_value, bool) and new_value) or \
                str(new_value).lower() in ('true', '1', 'yes', 'on')
        widget.field_value = is_on
    elif type_str == 'RadioButton':
        export = ''
        try:
            export = widget.on_state_value or ''
        except AttributeError:
            pass
        widget.field_value = (str(new_value) == str(export))
    else:
        widget.field_value = str(new_value) if new_value is not None else ''

    try:
        widget.update()  # Regenerates appearance stream — fast path
        return
    except Exception:
        pass  # Fall through to the xref fallback below

    # ── xref fallback ───────────────────────────────────────────────────────
    # Write the /V (and /AS for toggle fields) key directly into the widget's
    # PDF dictionary.  This skips appearance regeneration but the stored value
    # is correct and PDF viewers render it from /V + /DA.
    try:
        xref = widget.xref
        if type_str == 'CheckBox':
            is_on = (isinstance(new_value, bool) and new_value) or \
                    str(new_value).lower() in ('true', '1', 'yes', 'on')
            state = '/Yes' if is_on else '/Off'
            doc.xref_set_key(xref, 'V',  state)
            doc.xref_set_key(xref, 'AS', state)
        elif type_str == 'RadioButton':
            export = ''
            try:
                export = widget.on_state_value or ''
            except AttributeError:
                pass
            is_on = (str(new_value) == str(export))
            state = f'/{export}' if is_on else '/Off'
            doc.xref_set_key(xref, 'V',  state)
            doc.xref_set_key(xref, 'AS', state)
        else:
            doc.xref_set_key(xref, 'V', pdf_string(
                str(new_value) if new_value is not None else ''
            ))
    except Exception as e:
        print(f'KindPDF: xref fallback also failed for widget {widget.field_name!r}: {e}')


@app.route('/api/save-annotations', methods=['POST'])
def save_annotations():
    """
    Receive annotation data and optional page operations from the frontend,
    apply page reordering/deletion/rotation using PyMuPDF, draw the annotations
    permanently, and return the result as a downloadable file.

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
      },
      "pageOrder": [1, 3, 2, 4],        // optional — 1-based original page nums in new display order
      "pageRotations": { "2": 90 }       // optional — additional rotation per original page (0/90/180/270)
    }

    Page operations are applied BEFORE annotations are written:
      1. doc.select() reorders and/or deletes pages (any page absent from pageOrder is removed)
      2. set_rotation() applies per-page rotation
      3. Annotation page numbers are remapped from original → new positions

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
    # page_order: list of 1-based original page numbers in new display order.
    # Any page absent from this list is deleted from the output PDF.
    # Empty/missing means keep original order.
    page_order    = data.get('pageOrder', [])
    # page_rotations: { "origPageNum": additionalDegrees }.
    # Uses original 1-based page numbers as string keys.
    page_rotations = data.get('pageRotations', {})
    # form_values: { "fieldName": value } — optional; supplied when the PDF has
    # fillable AcroForm fields and the user has filled or changed any values.
    # Written as LIVE (non-flattened) fields so they remain editable after re-open.
    form_values = data.get('formValues', {})

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400

    # Sanitize the filename to prevent path traversal
    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        # ── Step 1: Apply page reorder / deletion ──────────────────────────────
        # Build a map from original 1-based page number → new 0-based index in the
        # output PDF. This is used later to remap annotation page numbers.
        if page_order and len(page_order) > 0:
            # Convert 1-based page numbers to 0-based indices for PyMuPDF
            page_indices = [int(p) - 1 for p in page_order]
            # Build the remapping BEFORE calling select() (indices change after)
            orig_to_new_idx = {int(orig_p): new_idx for new_idx, orig_p in enumerate(page_order)}
            doc.select(page_indices)
        else:
            # No reordering requested — keep original order, build identity map
            orig_to_new_idx = {i + 1: i for i in range(doc.page_count)}

        # ── Step 2: Apply per-page rotations ───────────────────────────────────
        # Rotation is applied AFTER select() so indices are already remapped.
        for orig_str, rotation in page_rotations.items():
            orig_pagenum = int(orig_str)
            new_idx = orig_to_new_idx.get(orig_pagenum)
            if new_idx is not None and 0 <= new_idx < doc.page_count:
                # set_rotation() sets the page's absolute rotation in the PDF dictionary.
                # We add the new rotation on top of any existing page rotation.
                existing_rot = doc[new_idx].rotation
                doc[new_idx].set_rotation((existing_rot + int(rotation)) % 360)

        # ── Step 3: Write annotations (remapped to new page positions) ─────────
        for page_str, page_annotations in annotations.items():
            orig_pagenum = int(page_str)
            # Look up the new 0-based index for this original page number.
            # If the page was deleted (not in orig_to_new_idx), skip it.
            new_idx = orig_to_new_idx.get(orig_pagenum)
            if new_idx is None or new_idx < 0 or new_idx >= doc.page_count:
                continue

            page = doc[new_idx]

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

        # ── Step 4: Write form field values (if any) ───────────────────────────
        # Applies only when the PDF has AcroForm widgets and the user filled some in.
        # Values are written as LIVE interactive fields — NOT flattened — so the
        # fields remain editable when the saved PDF is re-opened in KindPDF or any
        # other viewer. The /api/form-fields endpoint reads current values on next
        # open, so the round-trip just works automatically.
        #
        # set_widget_value() handles the crash that occurs with calculated fields:
        # widget.update() throws "cannot create array without a document" on those
        # fields, so we fall back to writing /V via doc.xref_set_key() instead.
        if form_values:
            for page in doc:
                for widget in page.widgets():
                    field_name = widget.field_name or ''
                    if field_name not in form_values:
                        continue
                    set_widget_value(doc, widget, form_values[field_name])

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


@app.route('/api/extract-pages', methods=['POST'])
def extract_pages():
    """
    Extract a subset of pages from a PDF and return them as a new downloadable PDF.

    Expected JSON body:
    {
      "filename": "uuid_original.pdf",
      "pageNums": [1, 3, 5]           // 1-based original page numbers to keep
    }

    Uses PyMuPDF doc.select() to keep only the requested pages, then returns the
    result as a download. The original file is not modified.
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for page extraction.'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    filename  = data.get('filename')
    page_nums = data.get('pageNums', [])

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400
    if not page_nums:
        return jsonify({'error': 'Please select at least one page to extract.'}), 400

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        # Convert 1-based page numbers to 0-based indices, filtering out-of-range values
        valid_indices = [int(p) - 1 for p in page_nums if 1 <= int(p) <= doc.page_count]
        if not valid_indices:
            return jsonify({'error': 'None of the selected pages exist in this document.'}), 400

        doc.select(valid_indices)

        output_filename = f'extracted_{uuid.uuid4().hex}_{safe_filename}'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()

        return send_from_directory(
            UPLOAD_FOLDER,
            output_filename,
            as_attachment=True,
            download_name='extracted_pages.pdf'
        )

    except Exception as e:
        print(f'Error extracting pages: {e}')
        return jsonify({'error': f'Something went wrong while extracting pages: {str(e)}'}), 500


@app.route('/api/merge-pdf', methods=['POST'])
def merge_pdf():
    """
    Merge a second PDF into the current working PDF at a specified position,
    save the result as a new temporary file, and return the new filename.

    The frontend reloads the viewer with the new filename after a successful merge.
    The original file is not modified.

    Expected JSON body:
    {
      "baseFilename":   "uuid_base.pdf",      // the current working PDF
      "mergeFilename":  "uuid_second.pdf",    // previously uploaded second PDF
      "insertAfterPage": 2                    // 1-based page after which to insert (0 = prepend, -1 = append)
    }

    Returns:
    {
      "success": true,
      "filename": "merged_uuid_base.pdf",   // new working filename
      "numPages": 12                         // new total page count
    }

    PyMuPDF insert_pdf() semantics:
      start_at = 0          → insert before page 0 (at the very beginning)
      start_at = N          → insert before page N (0-based) = after 1-based page N
      start_at = -1         → append at the end
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for PDF merging.'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    base_filename  = data.get('baseFilename')
    merge_filename = data.get('mergeFilename')
    insert_after   = data.get('insertAfterPage', -1)  # default: append at end

    if not base_filename or not merge_filename:
        return jsonify({'error': 'Both a base file and a file to merge are required.'}), 400

    base_safe  = secure_filename(base_filename)
    merge_safe = secure_filename(merge_filename)
    base_path  = os.path.join(UPLOAD_FOLDER, base_safe)
    merge_path = os.path.join(UPLOAD_FOLDER, merge_safe)

    if not os.path.exists(base_path):
        return jsonify({'error': 'The base file was not found. Please re-open it and try again.'}), 404
    if not os.path.exists(merge_path):
        return jsonify({'error': 'The file to merge was not found. Please upload it again.'}), 404

    try:
        base_doc  = fitz.open(base_path)
        merge_doc = fitz.open(merge_path)

        # Determine insertion position:
        #   insert_after = 0  → prepend (start_at=0)
        #   insert_after = N  → after 1-based page N (start_at=N, which is before 0-based page N)
        #   insert_after = -1 → append (start_at=-1)
        start_at = int(insert_after)  # -1 or 0 stays as-is; positive N maps directly

        base_doc.insert_pdf(merge_doc, start_at=start_at)
        merge_doc.close()

        output_filename = f'merged_{uuid.uuid4().hex}_{base_safe}'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        base_doc.save(output_path, garbage=4, deflate=True)
        num_pages = base_doc.page_count
        base_doc.close()

        return jsonify({
            'success':  True,
            'filename': output_filename,
            'numPages': num_pages
        })

    except Exception as e:
        print(f'Error merging PDFs: {e}')
        return jsonify({'error': f'Something went wrong while merging the files: {str(e)}'}), 500


@app.route('/api/form-fields/<filename>')
def get_form_fields(filename):
    """
    Read AcroForm widget fields from a PDF and return them as JSON.

    XFA detection first: XFA is Adobe's proprietary dynamic form format that
    PyMuPDF cannot reliably render. We scan every xref object for the /XFA
    key — if found we return {xfa: true} immediately so the frontend can show
    a friendly fallback message instead of broken overlays.

    For standard AcroForm PDFs we return a JSON array of field objects. Each
    object has:
      name        — field name string
      page        — 0-based page index
      rect        — {x0, y0, x1, y1} normalized to 0–1 fractions of page size
                    so coordinates survive zoom and resize changes
      type        — "text" | "checkbox" | "radio" | "dropdown" | "listbox"
      value       — current value (string, or bool for checkboxes)
      exportValue — export value for radio buttons (identifies which button)
      options     — list of choice strings (dropdown / listbox only)
      readonly    — true if PDF_FIELD_FLAG_READ_ONLY is set (bit 0 of flags)

    Push-button (Button) and Signature widgets are skipped — they are not
    user-fillable text/choice fields.
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for form reading.'}), 500

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        # ── XFA detection ───────────────────────────────────────────────────
        # Scan every xref object for the string "/XFA" rather than walking
        # the object tree, because the AcroForm dict may be compressed or behind
        # an indirect reference that varies by PDF writer.
        xfa_found = False
        for xref in range(1, doc.xref_length()):
            try:
                if '/XFA' in doc.xref_object(xref, compressed=False):
                    xfa_found = True
                    break
            except Exception:
                pass  # Malformed xref object — skip and keep scanning

        if xfa_found:
            doc.close()
            return jsonify({'xfa': True})

        # ── Field-type mapping ──────────────────────────────────────────────
        TYPE_MAP = {
            'Text':        'text',
            'CheckBox':    'checkbox',
            'RadioButton': 'radio',
            'ComboBox':    'dropdown',
            'ListBox':     'listbox',
        }

        fields  = []
        buttons = []

        for page_idx in range(doc.page_count):
            page = doc[page_idx]
            pw   = page.rect.width   # page width  in PDF points
            ph   = page.rect.height  # page height in PDF points

            for widget in page.widgets():
                type_str = widget.field_type_string

                # ── Push-button: extract action info instead of skipping ──────
                if type_str == 'Button':
                    r = widget.rect
                    norm_rect = {
                        'x0': r.x0 / pw,
                        'y0': r.y0 / ph,
                        'x1': r.x1 / pw,
                        'y1': r.y1 / ph,
                    }

                    # Read the button label from the MK/CA entry (normal caption)
                    label = widget.field_name or ''
                    try:
                        mk = doc.xref_get_key(widget.xref, 'MK')
                        if mk and isinstance(mk, tuple) and mk[0] == 'dict':
                            # Walk the MK dict to find the CA entry
                            mk_str = mk[1]
                            ca_match = re.search(r'/CA\s*\(([^)]*)\)', mk_str)
                            if ca_match:
                                label = ca_match.group(1)
                    except Exception:
                        pass

                    # Determine action type from the widget's /A action dict
                    action_type   = 'unknown'
                    action_target = ''
                    try:
                        action_xref = doc.xref_get_key(widget.xref, 'A')
                        if action_xref and isinstance(action_xref, tuple):
                            # If the action is an indirect reference, follow it
                            if action_xref[0] == 'xref':
                                ref_xref = int(action_xref[1].split()[0])
                                action_str = doc.xref_object(ref_xref, compressed=False)
                            else:
                                action_str = action_xref[1] if action_xref[0] == 'dict' else ''
                            # Named action (e.g. /N /Print, /N /NextPage)
                            named_match = re.search(r'/S\s*/Named.*?/N\s*/(\w+)', action_str, re.DOTALL)
                            if named_match:
                                named_action = named_match.group(1).lower()
                                if named_action == 'print':
                                    action_type = 'print'
                                else:
                                    action_type   = 'named'
                                    action_target = named_match.group(1)
                            else:
                                # SubmitForm action with mailto URL
                                submit_match = re.search(r'/S\s*/SubmitForm', action_str)
                                if submit_match:
                                    url_match = re.search(r'/F\s*<<[^>]*?/F\s*\(([^)]+)\)', action_str)
                                    if url_match:
                                        action_type   = 'submit'
                                        action_target = url_match.group(1)
                                    else:
                                        action_type = 'submit'
                                else:
                                    # JavaScript action
                                    js_match = re.search(r'/S\s*/JavaScript', action_str)
                                    if js_match:
                                        action_type = 'javascript'
                                    # URI action
                                    uri_match = re.search(r'/S\s*/URI.*?/URI\s*\(([^)]+)\)', action_str, re.DOTALL)
                                    if uri_match:
                                        action_type   = 'uri'
                                        action_target = uri_match.group(1)
                    except Exception:
                        pass

                    buttons.append({
                        'name':          widget.field_name or '',
                        'page':          page_idx,
                        'rect':          norm_rect,
                        'label':         label,
                        'action_type':   action_type,
                        'action_target': action_target,
                    })
                    continue  # Don't add buttons to the fillable fields list

                if type_str == 'Signature':
                    continue  # Signature widgets are not fillable

                kind = TYPE_MAP.get(type_str)
                if kind is None:
                    continue  # Unknown type — skip safely

                r = widget.rect
                # Normalize rect to 0–1 fractions of page dimensions so
                # coordinates are zoom-independent. The overlay multiplies
                # back by (pageDimPts × scale) to get pixel positions.
                norm_rect = {
                    'x0': r.x0 / pw,
                    'y0': r.y0 / ph,
                    'x1': r.x1 / pw,
                    'y1': r.y1 / ph,
                }

                # PDF_FIELD_FLAG_READ_ONLY = bit position 1 (integer value 1)
                readonly = bool(widget.field_flags & 1)

                # Coerce value to a clean Python type
                raw_val = widget.field_value
                if raw_val is None:
                    raw_val = ''
                elif not isinstance(raw_val, bool):
                    raw_val = str(raw_val)

                # Read the widget's Acrobat JavaScript calculation script.
                # Most fields return None. Calculated fields (totals, products)
                # have a string like:
                #   AFSimple_Calculate("PRD", new Array("qty", "price"))
                # The frontend parses this to re-run calculations client-side
                # whenever a source field value changes, no JS engine required.
                script_calc = None
                try:
                    sc = widget.script_calc
                    script_calc = sc if sc else None
                except AttributeError:
                    pass  # PyMuPDF version does not expose script_calc — safe to ignore

                field_obj = {
                    'name':        widget.field_name or '',
                    'page':        page_idx,
                    'rect':        norm_rect,
                    'type':        kind,
                    'value':       raw_val,
                    'exportValue': '',          # filled below for radio buttons
                    'options':     [],          # filled below for dropdowns
                    'readonly':    readonly,
                    'script_calc': script_calc, # JS calc string or null
                }

                # Radio buttons: the export value identifies this specific
                # button in the group so the frontend can check/uncheck it.
                if kind == 'radio':
                    try:
                        field_obj['exportValue'] = widget.on_state_value or ''
                    except AttributeError:
                        field_obj['exportValue'] = ''

                # Dropdown / listbox: return selectable options list.
                if kind in ('dropdown', 'listbox'):
                    try:
                        field_obj['options'] = list(widget.choice_values or [])
                    except Exception:
                        field_obj['options'] = []

                fields.append(field_obj)

        doc.close()
        # Return both fillable fields and push-button definitions together.
        # The frontend uses fields[] for the FormOverlay and buttons[] for
        # the ButtonOverlay (HTML buttons rendered over the PDF canvas).
        return jsonify({'fields': fields, 'buttons': buttons})

    except Exception as e:
        print(f'KindPDF: error reading form fields from {safe_filename}: {e}')
        return jsonify({'error': f'Could not read form fields: {str(e)}'}), 500


@app.route('/api/save-form', methods=['POST'])
def save_form():
    """
    Write filled form-field values into a PDF and return a downloadable copy.

    Accepts JSON body:
    {
      "filename": "uuid_original.pdf",
      "fields":   [{"name": "FieldName", "value": "User answer"}, ...]
    }

    For each supplied field, finds every matching widget on every page,
    coerces the value to the correct type (bool for checkboxes, str for
    others), then calls widget.update() to regenerate the appearance stream
    so the value is visible in every PDF viewer.

    Values are written as LIVE (non-flattened) AcroForm fields so they remain
    editable when the PDF is re-opened in KindPDF or any other viewer. Calling
    doc.bake() was removed because it caused a "cannot create array without a
    document" error in some PyMuPDF versions, and live fields are the correct
    behaviour for round-trip editing anyway.

    The ORIGINAL file is never modified. The filled copy is saved to a new
    UUID filename and returned as a browser download: "filled_form.pdf".
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for saving forms.'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    filename    = data.get('filename')
    fields_data = data.get('fields', [])

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        # Build {field_name: new_value} for O(1) lookup
        field_values = {
            item['name']: item['value']
            for item in fields_data
            if isinstance(item, dict) and 'name' in item
        }

        # Walk every page's widgets and apply matching values.
        # set_widget_value() handles the crash that occurs with calculated fields
        # by falling back to xref_set_key() if widget.update() fails.
        for page in doc:
            for widget in page.widgets():
                field_name = widget.field_name or ''
                if field_name not in field_values:
                    continue
                set_widget_value(doc, widget, field_values[field_name])

        # Save with live (non-flattened) fields so the PDF remains editable
        # when re-opened in KindPDF or any other viewer. NOT calling doc.bake()
        # was the cause of the "cannot create array without a document" error
        # seen in some PyMuPDF versions, and is also the correct behaviour for
        # round-trip editing.
        output_filename = f'filled_{uuid.uuid4().hex}_{safe_filename}'
        output_path     = os.path.join(UPLOAD_FOLDER, output_filename)
        doc.save(output_path, garbage=4, deflate=True)
        doc.close()

        return send_from_directory(
            UPLOAD_FOLDER,
            output_filename,
            as_attachment=True,
            download_name='filled_form.pdf'
        )

    except Exception as e:
        print(f'KindPDF: error saving form {safe_filename}: {e}')
        return jsonify({'error': f'Something went wrong while saving the form: {str(e)}'}), 500


@app.route('/api/protect-pdf', methods=['POST'])
def protect_pdf():
    """
    Add AES-256 password protection to a PDF and return the protected file as a download.

    The same password is used for both the user password (required to open the file)
    and the owner password (required to change permissions). This is the simplest and
    most common use case — the user just wants to lock the file with a password.

    Expected JSON body:
    {
      "filename": "uuid_original.pdf",
      "password": "mysecretpassword"
    }

    Returns the protected PDF as a file download.
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for password protection.'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    filename = data.get('filename')
    password = data.get('password', '')

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400
    if not password:
        return jsonify({'error': 'Please enter a password before protecting the file.'}), 400

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        # If the file is already encrypted, we need to authenticate first so PyMuPDF
        # can read and re-save it. If authentication fails, the file cannot be re-protected.
        if doc.is_encrypted:
            if doc.authenticate(password) == 0:
                doc.close()
                return jsonify({
                    'error': 'This file is already password-protected. '
                             'Please unlock it first before adding a new password.'
                }), 400

        output_filename = f'protected_{uuid.uuid4().hex}_{safe_filename}'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)

        # Save with AES-256 encryption.
        # user_pw  — password required to open and read the file.
        # owner_pw — password required to change permissions / print / copy.
        # Using the same value for both keeps things simple for the user.
        doc.save(
            output_path,
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw=password,
            owner_pw=password,
            garbage=4,
            deflate=True,
        )
        doc.close()

        return send_from_directory(
            UPLOAD_FOLDER,
            output_filename,
            as_attachment=True,
            download_name='protected.pdf'
        )

    except Exception as e:
        print(f'Error protecting PDF: {e}')
        return jsonify({'error': f'Something went wrong while protecting the file: {str(e)}'}), 500


@app.route('/api/unlock-pdf', methods=['POST'])
def unlock_pdf():
    """
    Remove password protection from a PDF and return the unlocked file as a download.

    If the supplied password is wrong, returns a 401 with a plain-English error message
    instead of a download. The original file is never modified.

    Expected JSON body:
    {
      "filename": "uuid_original.pdf",
      "password": "mysecretpassword"
    }

    Returns the unlocked PDF as a file download, or:
    { "error": "That password is incorrect — please try again." } on failure.
    """
    try:
        import fitz
    except ImportError:
        return jsonify({'error': 'PyMuPDF is required for unlocking PDFs.'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data received.'}), 400

    filename = data.get('filename')
    password = data.get('password', '')

    if not filename:
        return jsonify({'error': 'No filename provided.'}), 400
    if not password:
        return jsonify({'error': 'Please enter the current password for this file.'}), 400

    safe_filename = secure_filename(filename)
    filepath = os.path.join(UPLOAD_FOLDER, safe_filename)

    if not os.path.exists(filepath):
        return jsonify({'error': 'The original file was not found. Please re-open it and try again.'}), 404

    try:
        doc = fitz.open(filepath)

        if not doc.is_encrypted:
            doc.close()
            return jsonify({'error': 'This file does not have a password — there is nothing to remove.'}), 400

        # authenticate() returns 0 if the password is wrong.
        # Returns 1 if correct as user password, 2 as owner password, 4 as both.
        auth_result = doc.authenticate(password)
        if auth_result == 0:
            doc.close()
            return jsonify({'error': 'That password is incorrect — please try again.'}), 401

        # Save without any encryption to produce a clean, unlocked copy.
        # PyMuPDF defaults to no encryption when the encryption parameter is omitted.
        output_filename = f'unlocked_{uuid.uuid4().hex}_{safe_filename}'
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        doc.save(output_path, encryption=fitz.PDF_ENCRYPT_NONE, garbage=4, deflate=True)
        doc.close()

        return send_from_directory(
            UPLOAD_FOLDER,
            output_filename,
            as_attachment=True,
            download_name='unlocked.pdf'
        )

    except Exception as e:
        print(f'Error unlocking PDF: {e}')
        return jsonify({'error': f'Something went wrong while unlocking the file: {str(e)}'}), 500


if __name__ == '__main__':
    print("KindPDF backend starting on http://localhost:5000")
    app.run(debug=True, port=5000)
