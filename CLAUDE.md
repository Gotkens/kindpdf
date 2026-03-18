# KindPDF — Project Memory File

> This file is read by Claude at the start of every session.
> Keep it updated. It is the project's memory.
> Last updated: March 18, 2026

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
│           ├── HomeScreen.js    # Drag and drop upload screen
│           ├── PDFViewer.js     # Main viewer — manages all state
│           ├── Toolbar.js       # Page nav, zoom, search controls
│           └── Sidebar.js       # Thumbnail sidebar
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

**Phase 1.2 complete:** ☐ No

**Phase 1.3 complete:** ☐ No

**Phase 1.4 complete:** ☐ No

**Phase 1.5 complete:** ☐ No

**Phase 1.6 complete:** ☐ No

**Phase 1.7 complete:** ☐ No

**Phase 2 complete:** ☐ No

**Phase 3 complete:** ☐ No

---

## What Is Working Right Now

- ✅ Flask backend runs on port 5000
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

---

## What Is NOT Working / Known Issues

- ☐ No annotation tools yet (Phase 1.2 — next priority)
- ☐ No signature tool yet (Phase 1.3)
- ☐ No form filling yet (Phase 1.4)
- ☐ No page management yet (Phase 1.5)
- ☐ Docker not yet set up (Phase 1.7)

---

## Planned Features Not Yet Built (from design discussions)

- Eraser tool needs TWO modes when annotation tools are built (Phase 1.2):
  1. Brush eraser — erases entire pen stroke it touches
  2. Fine eraser — erases only pixels it touches, with adjustable size
- PWA support (Phase 2) — adds desktop icon, launches in own window, 
  works offline. Makes app feel like a native desktop app for 
  non-technical users.

---

## Last Session Summary

**Date:** March 18, 2026

**What we did:** Completed Phase 1.1 — PDF Viewer

**What was completed:**
- Rebuilt PDFViewer with continuous scroll architecture
- All pages render in a single scrollable column
- IntersectionObserver updates page number in toolbar as user scrolls
- Zoom persists across pages and never resets on navigation
- Fixed React Strict Mode double-render bug (cancelled flag + render 
  task cancellation)
- Built word search using PDF.js getTextContent()
- Yellow highlights drawn on transparent overlay canvas above each page
- Active match highlighted in orange, inactive in yellow
- Match counter, prev/next navigation, scrolls directly to each match
- Ctrl+F intercepted and routed to KindPDF search bar
- Enter key advances through matches after initial search
- Fixed prop name mismatches between App.js, PDFViewer.js, Toolbar.js

**What was left unfinished:**
- Nothing — Phase 1.1 is fully complete

---

## Next Session Goal

Build Phase 1.2 — Annotation Tools:
- Highlight text in yellow, green, pink, or blue
- Underline important text
- Draw a line through text (strikethrough)
- Add a sticky note comment anywhere on the page
- Draw freehand with a pen tool
- Add a text box — type anywhere on the page
- Undo button — always visible, always works
- Save annotations permanently into the PDF

Remember: eraser needs TWO modes — brush eraser and fine pixel eraser.

---

## Session Log

| Date | What Was Accomplished |
|---|---|
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
| Phase 1 — MVP | ~$30–55 | ~$6 |
| Phase 2 — Features | ~$25–45 | $0 |
| Phase 3 — Enterprise | ~$17–28 | $0 |
| **Total** | **~$74–132** | **~$8** |

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