# KindPDF — Project Memory File

> This file is read by Claude at the start of every session.
> Keep it updated. It is the project's memory.
> Last updated: March 30, 2026 (session 2)

---

## What KindPDF Is

An open source, self-hostable web-based PDF editor. Free to download 
and run yourself. Also available as a paid hosted cloud version.

**The mission in one sentence:** Build the most beautiful, easiest-to-use 
open source PDF editor in the world — so simple that a 75-year-old with 
limited computer experience can sign a PDF in under 60 seconds without 
asking for help.

**Business model:** Open core — free community edition on GitHub, paid 
enterprise tier with advanced features, plus a $19/month hosted cloud 
option for users who do not want to self-host.

---

## Non-Negotiable Design Rules

These apply to EVERY feature. Claude must follow all of these automatically.

1. Every button has an icon AND a text label. Never icon-only.
2. Plain English everywhere. No PDF jargon. Say "Hide text permanently" 
   not "Apply redaction."
3. Confirmation dialog before any action that cannot be undone.
4. Undo is always available and always visible on screen.
5. Minimum 16px body text size. High contrast. WCAG AA accessibility 
   compliant.
6. Every tool has a tooltip explaining what it does in one plain sentence.
7. Never show a blank screen to a new user — empty states must guide them.
8. Success and error messages in plain English. Never show raw error codes.
9. All features work on mobile and tablet as well as desktop.
10. Multi-step tasks (like signing) use a clearly numbered guided flow: 
    Step 1 of 3, Step 2 of 3, etc.

11. Never mention Adobe, Acrobat, or any third-party product in any user-
    facing message. If a PDF feature is not yet supported in KindPDF, say
    exactly that: "This feature is not yet supported in KindPDF." Then
    offer a plain-English workaround where one exists (e.g. for a Submit
    button: "Save your filled PDF and email it as an attachment instead").
    Do not tell the user to use a different app — just explain what to do.

**The Grandma Test:** Before any feature is considered done, ask: could
someone who rarely uses computers figure this out in 30 seconds without
help? If no — simplify it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 / Flask |
| Frontend | React 18 + Tailwind CSS 3.4.1 |
| PDF Rendering | PDF.js (pdfjs-dist v5.5.207) |
| PDF Manipulation | PyMuPDF (fitz) |
| Database | PostgreSQL |
| Auth | Flask-Login (Phase 1), SSO in Phase 3 |
| Deployment | Docker + docker-compose |
| Payments | Stripe |
| License keys | Custom — built into app |

---

## Project Folder Structure
```
kindpdf/
├── backend/
│   ├── uploads/           # Temporary PDF storage (not on GitHub)
│   ├── venv/              # Python virtual environment (not on GitHub)
│   ├── app.py             # Flask server — main backend entry point
│   ├── Dockerfile         # Python 3.11 slim + Gunicorn container
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── node_modules/      # React dependencies (not on GitHub)
│   ├── public/            # Static files
│   ├── Dockerfile         # Node 20 build stage → nginx:alpine serve stage
│   ├── nginx.conf         # nginx config: /api/ proxy to backend, .mjs MIME type, 50MB upload limit
│   └── src/
│       ├── App.js         # React root — controls which screen is shown
│       ├── index.js       # React entry point
│       ├── index.css      # Tailwind CSS imports
│       └── components/
│           ├── HomeScreen.js         # Drag and drop upload screen
│           ├── PDFViewer.js          # Main viewer — manages all state
│           ├── Toolbar.js            # Page nav, zoom, search controls
│           ├── Sidebar.js            # Thumbnail sidebar
│           ├── AnnotationToolbar.js  # Secondary annotation tools toolbar
│           ├── StickyNoteOverlay.js  # HTML overlay for sticky notes (hover popup)
│           ├── TextBoxOverlay.js     # HTML overlay for text boxes (draggable, editable)
│           ├── SignatureModal.js     # 3-step signature creation wizard (draw/type/upload)
│           ├── SignatureOverlay.js   # HTML overlay for placed signatures (drag + resize)
│           ├── ConfirmDialog.js      # Reusable confirmation modal (used by page delete)
│           ├── MergeModal.js        # 2-step merge wizard (upload second PDF + pick insert position)
│           ├── FormOverlay.js        # HTML overlay for AcroForm fillable fields (text, checkbox, radio, dropdown)
│           └── ButtonOverlay.js     # HTML overlay for PDF push-button widgets (Print, Submit, etc.)
├── .gitignore
├── CLAUDE.md
├── KindPDF_Task_List.docx
└── README.md
```

---

## Current Status

**Current Phase:** Phase 1 — Core MVP

**Phase 0 complete:** ✅ Yes

**Phase 1.1 complete:** ✅ Yes

**Phase 1.2 complete:** ✅ Yes

**Phase 1.3 complete:** ✅ Yes

**Phase 1.4 complete:** ✅ Yes

**Phase 1.5 complete:** ✅ Yes

**Phase 1.6 complete:** ✅ Yes

**Phase 1.7 complete:** ✅ Yes

**Phase 2 complete:** ☐ No

**Phase 3 complete:** ☐ No

---

## What Is Working Right Now

- ✅ Flask backend runs on port 5000
- ✅ Annotation toolbar (always visible below main toolbar)
- ✅ Highlight tool — browser-style drag selection, 4 colors + custom; binary opacity (no stacking)
- ✅ Underline tool — browser-style drag selection, 4 colors + custom
- ✅ Cross Out (strikethrough) tool — browser-style drag selection, 4 colors + custom
- ✅ Add Note (sticky) tool — click to place, type note, click "Add Note" to save; shows as 📝 icon
- ✅ Clicking existing sticky note icon while Add Note tool is active opens it for editing (not new note)
- ✅ Sticky note hover popup — read, edit (✏️ or double-click), delete (✕), drag to move
- ✅ Add Text (textbox) tool — click to place, font family + size dropdowns, draggable, double-click to edit, ✕ to delete
- ✅ Bold and underline toggles for text boxes (B / U buttons in toolbar)
- ✅ Draw (pen) tool — freehand drawing with adjustable size and 4 colors + custom
- ✅ Erase tool — two modes: Whole (removes entire annotation) and Fine (erases segments/rects), adjustable size
- ✅ Fine eraser shows dashed blue circle cursor; erases highlight/underline/strikethrough rect-by-rect
- ✅ Undo — removes last annotation, Ctrl+Z shortcut
- ✅ Save As PDF — embeds all annotations into the PDF, opens native Save As dialog
- ✅ Highlights saved to PDF use merged rects — no opacity stacking in Acrobat regardless of overlap
- ✅ Sticky notes saved as native PDF annotations (real sticky notes in Acrobat/Preview, not drawn graphics)
- ✅ All annotation coordinates normalized so they survive zoom changes
- ✅ PyMuPDF (fitz) used on backend for permanently writing annotations to PDF
- ✅ React frontend runs on port 3000
- ✅ PDF upload endpoint — accepts PDF, stores with unique filename
- ✅ PDF serving endpoint — serves stored PDF back to frontend
- ✅ Home screen with drag and drop zone and Choose a File button
- ✅ Plain English error messages for wrong file types
- ✅ PDF opens and renders correctly using PDF.js
- ✅ Continuous scroll — all pages render in one scrollable column
- ✅ Page number in toolbar updates automatically as user scrolls
- ✅ Jump to page by typing page number
- ✅ Zoom In / Zoom Out / Fit to Screen
- ✅ Zoom persists across pages — never resets on navigation
- ✅ Thumbnail sidebar — all pages, click to jump
- ✅ Arrow key navigation
- ✅ Word search — highlights matches in yellow across all pages
- ✅ Search match counter ("2 of 14"), prev/next navigation
- ✅ Active match highlighted in orange, others in yellow
- ✅ Ctrl+F routes to KindPDF search bar instead of Chrome's
- ✅ Loading spinner while PDF opens
- ✅ Plain English error screen if PDF fails to load
- ✅ Mobile responsive — sidebar hides on narrow screens
- ✅ Code is on GitHub at github.com/Gotkens/kindpdf
- ✅ Annotation round-trip — saved annotations reload as fully editable objects on re-open
- ✅ All annotation types saved as native PDF annotation objects (highlight, underline, strikethrough, pen, textbox, sticky)
- ✅ Redo button in annotation toolbar (pairs with Undo; Ctrl+Y shortcut)
- ✅ Signature tool (Phase 1.3) — 3-step guided wizard: Draw / Type / Upload
- ✅ Signature modal: 5 signature fonts for typed mode, custom ink colors for drawn mode
- ✅ Optional date stamp on signature (checkbox in Step 3 preview)
- ✅ Signature placement: blue banner prompts user to click where to place it
- ✅ SignatureOverlay: drag to reposition, 4 corner handles to resize (aspect-ratio locked)
- ✅ Signature save: embedded as image in PDF via PyMuPDF page.insert_image()
- ✅ Delete page — sidebar button with inline confirmation; undo works; cannot delete last page
- ✅ Rotate page — rotate left/right buttons per thumbnail; visual + saved via PyMuPDF set_rotation()
- ✅ Reorder pages — drag-and-drop thumbnails in sidebar; live preview; undo works
- ✅ Extract pages — select pages with checkboxes → "Save as New File" downloads extracted PDF
- ✅ Merge PDFs — "Insert Another PDF" wizard: upload second PDF, choose insertion point, viewer reloads
- ✅ All page operations staged in frontend state until Save As PDF
- ✅ Page undo/redo stack (separate from annotation undo/redo; buttons visible in management mode)
- ✅ Toolbar shows display page number (position in page order) not original page number after reorder/delete
- ✅ Rotation round-trip — saved rotations persist correctly when PDF is re-opened (PDF.js intrinsic + additional rotation composed correctly)
- ✅ Compact organize-mode thumbnails — two-column horizontal layout (~90px per card) shows many pages at once
- ✅ Auto-scroll during drag — sidebar scrolls when cursor is within 80px of top/bottom edge, enabling moves across the full document
- ✅ Multi-page group drag — selecting multiple pages and dragging any one moves the entire group together in relative order
- ✅ Form filling (Phase 1.4) — detects AcroForm fields (text, checkbox, radio, dropdown, listbox); "Fill In Form" button appears when form fields exist; interactive HTML overlays match field positions at any zoom; "Save Filled Form" downloads a flattened PDF with filled values
- ✅ XFA forms (Phase 1.4) — detected on load; friendly amber banner shown instead of broken UI ("This PDF uses a form format that KindPDF does not yet support…")
- ✅ Zoom percentage editable — user can click the % display in toolbar, type a custom value (10–400), press Enter to apply
- ✅ Password protection (Phase 1.6) — "Lock PDF" button opens modal with two tabs: Add Password and Remove Password; uses PyMuPDF encryption
- ✅ Password-protected PDFs prompt for password on open instead of showing "damaged file" error; wrong-password feedback shown in plain English
- ✅ PDF push-buttons (Print, Submit, etc.) visible in main view via ButtonOverlay — suppressed by annotationMode:0 but recreated as HTML buttons
- ✅ PDF push-button: Print action triggers blob-URL iframe print (only the PDF document prints, not the KindPDF UI)
- ✅ PDF push-button: Submit/email/script/URI/unknown actions show a plain-English dialog — says the feature is not yet supported in KindPDF and offers a practical workaround (e.g. save and email the PDF manually)
- ✅ Print button in main toolbar — printer icon + "Print" label; uses blob-URL iframe so only the PDF prints; tooltip "Print this PDF."
- ✅ Ctrl+P intercepted at window level — triggers KindPDF's print function instead of Chrome's print-page dialog
- ✅ Docker deployment (Phase 1.7) — backend/Dockerfile (Python 3.11 slim + Gunicorn), frontend/Dockerfile (Node 20 build + nginx:alpine), docker-compose.yml (backend + frontend + PostgreSQL), README.md with plain-English self-hosting instructions
- ✅ Docker: nginx proxies all /api/ requests to Flask backend container; all React fetch calls use relative paths (no hardcoded localhost:5000)
- ✅ Docker: .mjs files served with correct MIME type (application/javascript) via inline types block in nginx location — required for PDF.js worker
- ✅ Docker: 50MB upload limit set in nginx (client_max_body_size 50m) so large PDFs are not rejected before Flask sees them
- ✅ Horizontal scroll at high zoom — zoomed documents can be scrolled left all the way; left side no longer cut off (min-w-max on page container)
- ✅ Ctrl+Scroll zoom — zooms the PDF document (not the browser window); attached to the scroll container div with `{ passive: false }` so preventDefault works; clamped to 0.1–4.0; only fires when cursor is over the document area
- ✅ Pan / grab-and-drag — when no annotation tool is active, cursor is an open hand (grab); click and drag scrolls the document in both axes; cursor changes to grabbing while dragging; global mousemove/mouseup on window so fast drags outside the container don't break tracking; all annotation tools unaffected

---

## What Is NOT Working / Known Issues

- ☐ **Docker CSS broken — STILL UNFIXED after multiple attempts (March 30, 2026)**

  **Symptom:** When running via Docker at localhost:3000, all Tailwind CSS styling is missing. The app renders as plain unstyled HTML. Works perfectly in dev mode (`npm start`).

  **Key diagnostic finding:** The compiled CSS file inside the container is only **26.2KB** (`main.cba459b3.css`). A correct Tailwind build for this app should be 200–400KB. This means Tailwind IS running during `npm run build` but is finding almost no classes to include. This is a content scanning failure — Tailwind can't see the source files, or something is preventing it from including the classes it finds.

  **Confirmed NOT the cause (these are all correct and have been verified):**
  - `frontend/src/index.css` — has all three `@tailwind` directives ✅
  - `frontend/tailwind.config.js` — content array is `["./src/**/*.{js,jsx,ts,tsx}"]` ✅
  - `frontend/postcss.config.js` — has tailwindcss and autoprefixer ✅
  - React app loads and runs correctly in Docker (JS/components work fine) ✅

  **Fixes already applied that did NOT solve it (do not repeat these):**
  1. **nginx.conf** — split static assets location block so `.mjs` gets its own `types {}` block, preventing it from overriding MIME types for CSS files. This was a real bug but did not fix the styling.
  2. **package.json** — moved `tailwindcss`, `postcss`, `autoprefixer` from `devDependencies` to `dependencies` so npm never skips them. Did not fix it.
  3. **Dockerfile** — added `NODE_ENV=development` prefix to `npm ci` to force installation of all packages regardless of environment. Did not fix it.
  4. **frontend/.dockerignore** — created to prevent Windows `node_modules` (with Windows-native esbuild binaries) from overwriting the Linux-native packages installed by `npm ci`. Did not fix it.

  **Next diagnostic steps to try:**
  - Check what is actually INSIDE the 26KB CSS file — run `docker exec kindpdf-frontend grep -c "bg-blue" /usr/share/nginx/html/static/css/main.*.css`. If result is 0, Tailwind found no classes at all. If > 0, some classes are there but not all.
  - Check the full Docker build log carefully for PostCSS or Tailwind warnings during `npm run build`
  - Try running `npm run build` locally (outside Docker) and check the CSS output size — if it's also 26KB locally, the problem is not Docker-specific but a Tailwind config issue
  - Investigate whether react-scripts 5.0.1 (released 2022) has a compatibility issue with Tailwind v3 content scanning in production mode specifically
  - Try adding an explicit `safelist` to tailwind.config.js with a few test classes to confirm whether safelisted classes appear in the output
  - Consider switching from postcss.config.js approach to using CRACO or the `@craco/craco` package which is specifically designed to extend CRA's build config reliably

  ---

  **New hypothesis (added March 30, 2026):** Before running any of the diagnostic steps above, first verify which problem we actually have. There are two completely different failure modes that look identical to the user:
  1. Tailwind didn't build the CSS correctly → the CSS file inside the container is ~26KB (nearly empty)
  2. Tailwind built correctly BUT nginx is serving the CSS file with the wrong content-type header → the browser silently refuses to apply it

  We have been assuming problem #1 without confirming it. The print button fix (Phase 1.7) rewrote nginx.conf. A misconfigured nginx content-type header would explain why Docker worked befor

- ☐ Signature round-trip not yet built — saved signatures are embedded as flat images and will not reload as editable overlays on re-open (signatures are rarely edited after placement; acceptable for Phase 1.3)
- ☐ Annotation coordinates for rotated pages: annotations placed BEFORE rotation may visually shift. Annotations placed AFTER rotation work correctly.

---

## Planned Features Not Yet Built

### Annotation Round-Trip (build before Phase 1.3)

When a PDF is opened that already contains native PDF annotations (saved 
by KindPDF previously, or added in Acrobat/Preview), those annotations 
should load back into KindPDF as fully editable annotations — not flat 
graphics.

**Why it matters:** KindPDF now saves sticky notes as native PDF annotations.
Without round-trip reading, reopening a saved PDF in KindPDF shows no notes.

**What to build:**

**Backend — new endpoint:**
```
GET /api/annotations/<filename>
```
Opens the PDF with PyMuPDF, reads all existing annotations, returns them 
as JSON in KindPDF's annotation format. Annotation type mapping:

| PDF annotation type | KindPDF type | PyMuPDF annot.type value |
|---|---|---|
| Text (sticky note) | sticky | fitz.PDF_ANNOT_TEXT (0) |
| Highlight | highlight | fitz.PDF_ANNOT_HIGHLIGHT (8) |
| Underline | underline | fitz.PDF_ANNOT_UNDERLINE (9) |
| StrikeOut | strikethrough | fitz.PDF_ANNOT_STRIKEOUT (11) |
| Ink (freehand) | pen | fitz.PDF_ANNOT_INK (15) |
| FreeText | textbox | fitz.PDF_ANNOT_FREE_TEXT (2) |

For each annotation, return:
- page number (1-based)
- type (mapped to KindPDF type)
- coordinates converted to normalized scale=1 points
- color as rgba string
- text content where applicable

**Frontend — PDFViewer.js:**
After PDF loads successfully (inside the loadingTask.promise.then block),
call `GET /api/annotations/<filename>`. If annotations come back, call
`setAnnotationHistory` to seed the present state with them — exactly as
if the user had just drawn them. They then behave as fully editable,
undoable, saveable annotations.

**Honest limitation:** Annotations created in other apps (Acrobat, Preview)
may have slight coordinate differences due to different coordinate systems.
Text and position will be correct; pixel-perfect alignment not guaranteed
for textboxes created elsewhere.

---

### Other Planned Features

- PWA support (Phase 2) — adds desktop icon, launches in own window, 
  works offline. Makes app feel like a native desktop app for 
  non-technical users.

---

## Last Session Summary

**Date:** March 30, 2026 (session 2) — Ctrl+Scroll zoom fix + pan/grab-and-drag

**What we did:**

**Ctrl+Scroll zoom fix:**
The `useEffect` that attached the wheel listener had `[]` as its dependency array. The effect ran once after the component first mounted — but at that point `isLoading` was `true`, so the component was rendering the spinner (an early return), not the main view that contains the `scrollContainerRef` div. `scrollContainerRef.current` was `null`, the `if (!el) return` guard fired, and no listener was ever attached. Fixed by changing the dep array from `[]` to `[pdfDoc]` so the effect re-runs once the PDF loads and the scroll container is actually in the DOM.

**Pan / grab-and-drag:**
- Added `isPanning` state (React state, not just a ref, so `getCursor()` re-renders to `'grabbing'`).
- Updated `getCursor()`: no tool active → `'grab'` (idle) or `'grabbing'` (while dragging).
- Added `handlePanMouseDown` useCallback: on left-mousedown with no active tool, records start coords in a closure, calls `setIsPanning(true)`, registers global `window` mousemove/mouseup handlers. The move handler updates `scrollLeft`/`scrollTop` on the container. The up handler calls `setIsPanning(false)` and removes both listeners.
- Added `onMouseDown={handlePanMouseDown}` and `style={{ cursor: getCursor() }}` to the `scrollContainerRef` div so the cursor cascades to all children via CSS inheritance.
- Global listeners on `window` (not the container) ensure fast drags outside the container keep tracking.
- `if (activeTool) return` guard means all annotation tools work exactly as before.

---

**Previous Session Summary (March 26, 2026 — Phase 1.7 complete — Docker, Print, polish)**

**What we did:** Completed Phase 1.7. Cleaned up all Adobe/Acrobat user-facing references, added a working Print button, fixed Docker networking, fixed the PDF print function (it was printing the KindPDF UI instead of the document), added Ctrl+P interception, and fixed a horizontal scroll bug at high zoom levels.

**Pre-1.7 cleanup:**
- Removed all Adobe/Acrobat references from user-facing text in `PDFViewer.js` (button action modals, XFA banner). Replaced with "This feature is not yet supported in KindPDF" and plain-English workarounds.
- Added Print button to `Toolbar.js` (printer SVG icon + "Print" label, `onPrint` prop, tooltip).

**Phase 1.7 — Docker deployment (4 new files):**
- `backend/Dockerfile` — Python 3.11 slim base; handles UTF-16 encoded requirements.txt (Windows pip saves it that way); installs gunicorn; creates /app/uploads; runs `gunicorn --bind 0.0.0.0:5000 --workers 4 --timeout 120 app:app`
- `frontend/Dockerfile` — Two-stage: Node 20-slim compiles React (`DISABLE_ESLINT_PLUGIN=true npm run build`); nginx:1.27-alpine serves the build; copies nginx.conf
- `frontend/nginx.conf` — Serves React app as static files; proxies all `/api/` requests to `http://backend:5000/api/` (Docker internal DNS); adds `.mjs → application/javascript` MIME type inline in location block (required for PDF.js worker); sets `client_max_body_size 50m` (required for large PDF uploads); security headers
- `docker-compose.yml` — Three services: `backend` (port 5000), `frontend` (port 3000→80), `db` (PostgreSQL 16-alpine, port 5432); named volumes `pdf_uploads` and `db_data`; shared `kindpdf-net` network; db healthcheck; `backend` depends on `db`

**Docker debugging (4 rounds of fixes):**
1. **PDF upload failing** — nginx had no `/api/` proxy block AND React source had 11 hardcoded `http://localhost:5000` URLs. Fixed both: created nginx.conf with proxy_pass; replaced all 11 localhost URLs with relative `/api/...` paths across `PDFViewer.js`, `App.js`, `HomeScreen.js`, `PasswordModal.js`, `MergeModal.js`.
2. **Backend 180-byte error on upload** — Flask upload route had no error handling; also `RUN mkdir -p uploads` was relative (wrong dir). Fixed: wrapped upload route in try/except with traceback; changed to `RUN mkdir -p /app/uploads`.
3. **nginx crash: "unexpected { in mime.types"** — First attempt placed `types { include /etc/nginx/mime.types; application/javascript mjs; }` at server level — `include` is invalid inside a server-level types block. Fixed: placed `types { application/javascript mjs; }` inline inside the static assets `location` block only.
4. **All API calls working** — after all relative URL replacements confirmed Docker stack fully functional.

**Print fix — blob URL iframe approach:**
- Original `window.print()` / `iframe.src = activePdfUrl` approach was printing the KindPDF React UI (not the PDF) because the relative URL loaded the React app in the iframe.
- Fixed with blob URL approach: `fetch(activePdfUrl)` → `blob()` → `URL.createObjectURL(blob)` → iframe src. Chrome's PDF plugin renders the blob and prints only the document. Fallback: opens PDF in new tab if fetch fails.
- `handlePrint` is a `useCallback` in `PDFViewer.js` with `[activePdfUrl]` dep array.
- `handleButtonClick` (PDF push-button handler) updated to call `handlePrint()` for print action type; dep array updated to `[handlePrint]` to avoid stale closure.
- `onPrint={handlePrint}` passed to `<Toolbar>`.

**Ctrl+P interception:**
- `useEffect` added in `PDFViewer.js` (AFTER the `handlePrint` declaration to avoid temporal dead zone) that listens for `keydown` on `window`; if `Ctrl+P` or `Cmd+P` is detected, calls `e.preventDefault()` then `handlePrint()`. Cleaned up on unmount. Dep array: `[handlePrint]`.

**Horizontal scroll fix at high zoom:**
- When zoomed in on a wide document, pages were wider than the viewport; `items-center` on the flex column was centering them at x=0 but the overflow went left (negative x, unreachable by scroll).
- Fixed by adding `min-w-max` to the inner page container div — forces the container to expand to at least the width of its widest child, making the full width scrollable.

**Key technical notes:**
- `const` declarations are not hoisted (temporal dead zone) — a `useEffect` that references a `useCallback` must appear AFTER the `useCallback` declaration in the file, or React will throw "Cannot access before initialization".
- Stale closure risk: `useCallback(..., [])` with an empty dep array captures the initial value of any called functions. If `handleButtonClick` calls `handlePrint`, `handlePrint` must be in the dep array.
- Docker internal DNS resolves service names (e.g. `backend`) to container IPs automatically — no IP addresses or environment variables needed in nginx.conf.
- `.mjs` MIME type must be set inside a specific `location` block, not at server level, when combined with `include mime.types` — nginx syntax restriction.

---

## Next Session Goal

**Phase 1 is fully complete. All MVP features and Docker deployment are done.**

**Viewer UX polish completed this session:** Ctrl+Scroll zoom and pan/grab-and-drag are both working.

**URGENT carry-over task: Fix Docker CSS (Tailwind styles missing in Docker build) — NOT YET FIXED**

The CSS file in the Docker container is 26KB (should be 200–400KB). Tailwind is running but not including utility classes. See the full issue description and list of already-tried fixes in the "What Is NOT Working" section above — **do not repeat any of those fixes**.

**Start the next session by running this diagnostic first:**
```powershell
# Check if ANY Tailwind utility classes made it into the CSS file
docker exec kindpdf-frontend grep -c "bg-blue" /usr/share/nginx/html/static/css/main.*.css
```
- Result `0` → Tailwind found zero classes. Content scanning is completely broken.
- Result `> 0` → Some classes are there. The issue may be more subtle.

Then run a local build to check if the problem is Docker-specific or universal:
```powershell
cd C:\Users\newte\OneDrive\SteveM\SteveMDocs\Personal\Personal\AI Program\KindPDF\frontend
npm run build
# Then check the size of build/static/css/main.*.css
dir build\static\css\
```
- If local build also produces ~26KB → problem is NOT Docker-specific; it's a Tailwind config / react-scripts 5 compatibility issue
- If local build produces 200KB+ → problem IS Docker-specific; the `.dockerignore` and other fixes haven't taken effect properly

**Suggested second task for Phase 2: PWA support**

Adding PWA (Progressive Web App) support is a high-impact, low-effort win that makes the app feel like a native desktop application. It is a good first step before adding accounts or cloud features because it requires no backend changes.

What to build:
- `frontend/public/manifest.json` — app name, icon paths, theme color, `display: "standalone"`
- Service worker registration in `index.js` — cache static assets for offline use
- Add icon files (192×192 and 512×512 PNG, KindPDF "K" logo on blue)
- Meta tags in `index.html` for iOS home screen support

After PWA, the likely Phase 2 order is:
1. User accounts — PostgreSQL integration, Flask-Login, registration/login screens
2. File storage tied to accounts — saved PDFs associated with a user; "My Files" dashboard
3. Hosted cloud deployment — deploy to a VPS or cloud provider with a real domain name

---

## Session Log

| Date | What Was Accomplished |
|---|---|
| March 30, 2026 (s2) | Ctrl+Scroll zoom fix (useEffect dep `[]`→`[pdfDoc]` — ref was null on first render due to loading spinner early return); pan/grab-and-drag (isPanning state, getCursor grab/grabbing, handlePanMouseDown with global window listeners) |
| March 30, 2026 | Docker CSS debugging session — issue still unresolved. Four fixes applied (nginx.conf MIME type split, package.json devDeps→deps, Dockerfile NODE_ENV=development, frontend/.dockerignore created) — none fixed the 26KB CSS output. See "What Is NOT Working" for full details and next diagnostic steps. |
| March 26, 2026 | Phase 1.7 complete: Docker (backend/Dockerfile, frontend/Dockerfile, nginx.conf, docker-compose.yml, README.md); nginx /api/ proxy + .mjs MIME type + 50MB upload limit; all 11 localhost:5000 URLs replaced with relative paths; Adobe/Acrobat text purged from UI; Print button (blob iframe — prints PDF not UI); Ctrl+P interception; horizontal scroll fix at high zoom (min-w-max) |
| March 25, 2026 | Phase 1.4 extension: PDF push-button overlay (ButtonOverlay.js, handleButtonClick, honest action modal); backend /api/form-fields extended to return buttons array |
| March 25, 2026 | Phase 1.4 (Form Filling) + Phase 1.6 (Password Protection) + editable zoom input; FormOverlay.js, PasswordModal.js, backend /api/form-fields, /api/save-form, /api/protect-pdf, /api/unlock-pdf |
| March 24, 2026 | Phase 1.5 bug fixes: rotation round-trip, compact organize thumbnails, auto-scroll during drag, multi-page group drag |
| March 24, 2026 | Phase 1.5 — Page Management: delete, rotate, reorder, extract, merge; MergeModal, ConfirmDialog; backend extract-pages + merge-pdf endpoints |
| March 23, 2026 | Phase 1.3 polish: draw gaps, date stamp, font previews, signature size, textbox toolbar fix, font dropdown with previews |
| March 23, 2026 | Annotation round-trip reading, Redo button, pen/sticky/sidebar bug fixes, Phase 1.3 Signature Tool complete |
| March 20, 2026 | Bug fix + polish: PDFViewer crash fix, highlight opacity fix in saved PDF, click-to-edit sticky notes, native PDF sticky note saving |
| March 20, 2026 | Round 4 polish: Save As fix, binary highlights, browser-style selection, sticky note edit, bold/underline text, fine eraser on rects, eraser circle cursor |
| March 20, 2026 | Round 3 polish: continuous highlight spans, sticky note drag+delay, direct text box placement, live font/size/color on selected box, 20 fonts |
| March 20, 2026 | Annotation polish: word-level selection, sticky/textbox HTML overlays, explicit commit buttons, font controls |
| March 20, 2026 | Phase 1.2 complete — annotation toolbar, all 7 tools, undo, save PDF |
| March 18, 2026 | Phase 1.1 complete — continuous scroll, word search, Ctrl+F |
| March 13, 2026 | Phase 1.1 partial — PDF viewer working, continuous scroll pending |
| March 12, 2026 | Phase 0 complete — full dev environment, Hello World, pushed to GitHub |

---

## Key Decisions Made

| Decision | Reason |
|---|---|
| Name: KindPDF | Unique, memorable, conveys friendly/approachable philosophy |
| Open core model | Free community edition drives adoption; enterprise tier drives revenue |
| Web-based (not desktop app) | Works on any device including tablets; no installation for end users |
| Flask + React | Proven, well-documented, Claude can build it reliably |
| Docker deployment | One command to self-host; industry standard |
| Senior-friendly UX as #1 priority | Biggest gap in current open source PDF tools; strong differentiator |
| Project folder in OneDrive | Automatic cloud backup on top of GitHub |
| GitHub username: Gotkens | Privacy — real name not exposed publicly |
| PWA over Electron | Much simpler, smaller, same end-user experience for desktop icon/launch |
| Tailwind v3.4.1 not v4 | Tailwind v4 removed the init command and changed config format — v3 is stable |
| PDF.js worker from local node_modules | CDN version was mismatched — local file always matches installed version |
| Continuous scroll architecture | Required for annotations — all pages must exist in DOM simultaneously |
| Search highlights on overlay canvas | Keeps PDF render untouched; overlays are easy to clear and redraw |
| Ctrl+F intercepted at window level | PDF text is on canvas — Chrome's built-in search can't find it anyway |
| Sticky notes saved as native PDF annotations | Enables real interactivity in Acrobat/Preview; flat drawn boxes were dead graphics |
| Highlight merge at save time only | Frontend keeps individual objects for undo granularity; merge only when writing to PDF |
| Blob URL iframe for Print | `window.print()` and `iframe.src = relativeUrl` both printed the React UI. Fetching the PDF as a blob and using `URL.createObjectURL` guarantees Chrome's PDF plugin renders it inside the iframe |
| Ctrl+Scroll useEffect dep `[pdfDoc]` not `[]` | Component renders a loading spinner (early return) on first mount — `scrollContainerRef.current` is null at that point. `[pdfDoc]` ensures the wheel listener is attached after the PDF loads and the scroll container is in the DOM |
| Pan uses global window listeners | Registering mousemove/mouseup on `window` inside the mousedown handler (and removing them on mouseup) is the standard pattern for drag — keeps tracking even when the cursor moves outside the scroll container at speed |
| Ctrl+P intercepted at window level | Mirrors Ctrl+F approach — Chrome's native Ctrl+P prints the page, not the PDF |
| All API calls use relative paths | Hardcoded localhost:5000 breaks Docker (no host networking). Relative `/api/...` paths work in both dev (CRA proxy) and Docker (nginx proxy) |
| nginx .mjs MIME type inline in location block | nginx rejects `include` inside a server-level `types {}` block. Must be placed inside the specific `location` block that serves the file |

---

## Pricing Tiers

| Tier | Price | Who It Is For |
|---|---|---|
| Community | Free | Individuals, hobbyists — self-host yourself |
| Pro | $99/year | Small businesses — adds storage, team accounts, support |
| Business | $499/year | Mid-size companies — adds SSO, audit logs, API |
| Enterprise | Custom / $10K+/yr | Large orgs — SLA, custom contract, security review |
| Hosted Cloud | $19/month | Anyone who does not want to self-host |

---

## Build Cost Tracking

| Phase | Estimated Cost | Spent So Far |
|---|---|---|
| Phase 0 — Setup | ~$2–4 | ~$2 |
| Phase 1 — MVP | ~$30–55 | ~$14 |
| Phase 2 — Features | ~$25–45 | $0 |
| Phase 3 — Enterprise | ~$17–28 | $0 |
| **Total** | **~$74–132** | **~$16** |

---

## People and Resources

| Resource | Details |
|---|---|
| GitHub repo | github.com/Gotkens/kindpdf |
| Domain | Not yet purchased |
| Docker Hub | Not yet set up |
| Stripe account | Not yet set up |

---

## How to Start Each Session

1. Open PowerShell
2. cd to backend folder
3. Activate venv and start Flask:
   `.\venv\Scripts\Activate.ps1` → `python app.py`
4. Open second PowerShell → cd to frontend folder → `npm start`
5. Browser opens at http://localhost:3000
6. Paste CLAUDE.md into Claude with your session goal

---

## Before You Shut Down

**1. Push to GitHub:**
```powershell
cd ..
git add .
git commit -m "describe what you built"
git push
```

**2. Update CLAUDE.md** — last session summary, next session goal, 
session log, and anything new in the working/not working lists.
