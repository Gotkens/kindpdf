# KindPDF — Project Memory File

> This file is read by Claude at the start of every session.
> Keep it updated. It is the project's memory.
> Last updated: March 23, 2026

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
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── node_modules/      # React dependencies (not on GitHub)
│   ├── public/            # Static files
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
│           └── SignatureOverlay.js   # HTML overlay for placed signatures (drag + resize)
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

**Phase 1.4 complete:** ☐ No

**Phase 1.5 complete:** ☐ No

**Phase 1.6 complete:** ☐ No

**Phase 1.7 complete:** ☐ No

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

---

## What Is NOT Working / Known Issues

- ☐ No annotation round-trip (see Planned Features below for full build plan)
- ☐ Signature round-trip not yet built — saved signatures are embedded as flat images and will not reload as editable overlays on re-open (signatures are rarely edited after placement; acceptable for Phase 1.3)
- ☐ No form filling yet (Phase 1.4)
- ☐ No page management yet (Phase 1.5)
- ☐ Docker not yet set up (Phase 1.7)

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

**Date:** March 23, 2026 (Phase 1.3 Signature Tool + polish fixes)

**What we did:** Built the complete Phase 1.3 Signature Tool (annotation round-trip,
Redo button, signature wizard, placement, resize, save), then fixed 6 follow-up bugs
reported after testing.

**What was completed:**

**Annotation round-trip reading:**
- New backend endpoint `GET /api/annotations/<filename>` — reads all native PDF
  annotations via PyMuPDF `page.annots()` and returns them as KindPDF JSON objects.
- All annotation types converted to native PDF objects at save time.
- Frontend: after PDF loads, fetches the endpoint and seeds `annotationHistory.present`.
- Added `annotationMode: 0` to `page.render()` — prevents yellow sticky artefact.

**Redo button:**
- AnnotationToolbar.js: Redo button after Undo; Ctrl+Y shortcut.

**Phase 1.3 — Signature Tool:**
- `SignatureModal.js` — 3-step wizard (Draw / Type / Upload + optional date stamp).
- `SignatureOverlay.js` — draggable, 4-corner-resizable overlay; eraser support.
- `app.py` — `elif ann_type == 'signature':` embeds image via `page.insert_image()`.
- `PDFViewer.js` — modal state, `signature_place` tool mode, blue placement banner.
- `AnnotationToolbar.js` — Sign button.

**Phase 1.3 polish fixes (second pass):**

1. Draw signature gaps — `SignatureModal.js`: Added `lastPosRef` to track the endpoint
   of each stroke. Each `mousemove` draws an explicit segment from last→current position
   so fast mouse movement never leaves a gap.

2. Date stamp not working — `SignatureModal.js`: Root cause: step-2 canvases unmount
   when wizard advances to step 3, making refs null. Fix: `goToStep3()` now captures
   the data URL into `capturedDataUrl` state BEFORE calling `setStep(3)`. `buildPreview`
   reads from that captured URL, not from dead refs. Date stamp now correctly composites
   text beneath the signature image.

3. Typed font previews all looked identical — `SignatureModal.js`: Two bugs: (a) Google
   Fonts CSS2 API requires `family=X&family=Y` params, not `|` separator — no fonts were
   loading. (b) Canvas rendered before fonts were ready. Fixed: corrected URL format;
   added `fontsReady` state via `document.fonts.ready.then(...)` which re-triggers the
   canvas draw effect once fonts are available.

4. Signature placement size too large — `SignatureModal.js`: Reduced `defaultWidth`
   from 300 → 150 PDF points (~2 inches; ~1/4 of a letter page). Corner handles allow
   resizing after placement.

5. Text formatting toolbar unavailable when initially creating a text box —
   `TextBoxOverlay.js`: Root cause: clicking the font dropdown while the fresh empty
   textarea was focused triggered `onBlur` → 120ms → `commitEdit()` → empty text →
   `onDelete()`. The textbox deleted itself before the font change could apply. Fix:
   `handleBlur` now returns early when `isNewlyPlacedRef.current && !editText.trim()`,
   keeping the box alive until the user types or explicitly cancels.

6. Font dropdown shows all options in same typeface — `AnnotationToolbar.js`: Native
   `<select>/<option>` ignores `fontFamily` CSS in most browsers. Replaced with a custom
   `FontFamilyDropdown` component that renders each option button in its own typeface.
   Options use `onMouseDown` with `e.preventDefault()` so clicking them does NOT blur
   the active textarea — font changes apply live while typing.

**What was left unfinished:**
- Signature round-trip: signatures save as flat images, so they will not reload as
  editable overlays on re-open. Acceptable for Phase 1.3.

---

## Next Session Goal

Phase 1.4 — Form Filling:
- Detect existing form fields in PDFs (text inputs, checkboxes, radio buttons, dropdowns)
- Allow users to fill in those fields interactively
- Save the filled form to PDF (flattened or with live form data)

Or Phase 1.5 — Page Management:
- Reorder pages (drag and drop in sidebar)
- Delete pages
- Rotate pages
- Insert blank pages or pages from another PDF

---

## Session Log

| Date | What Was Accomplished |
|---|---|
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
