# KindPDF — Project Memory File

> This file is read by Claude at the start of every session.
> Keep it updated. It is the project's memory.
> Last updated: March 12, 2026

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
| Frontend | React 18 + Tailwind CSS |
| PDF Rendering | PDF.js |
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
│   ├── venv/              # Python virtual environment (not on GitHub)
│   └── app.py             # Flask server — main backend entry point
├── frontend/
│   ├── node_modules/      # React dependencies (not on GitHub)
│   ├── public/            # Static files
│   └── src/
│       └── App.js         # React root component
├── .gitignore
├── CLAUDE.md
├── KindPDF_Starter_Prompt.docx
├── KindPDF_Task_List.docx
└── README.md
```

---

## Current Status

**Current Phase:** Phase 1 — Core MVP

**Phase 0 complete:** ✅ Yes

**Phase 1 complete:** ☐ No

**Phase 2 complete:** ☐ No

**Phase 3 complete:** ☐ No

---

## What Is Working Right Now

- ✅ Flask backend runs on port 5000
- ✅ React frontend runs on port 3000
- ✅ Frontend calls backend and displays response
- ✅ Code is on GitHub at github.com/Gotkens/kindpdf

---

## What Is NOT Working / Known Issues

- Docker not yet installed (needed for Phase 1 deployment)
- No PDF functionality yet — Hello World only

---

## Last Session Summary

**Date:** March 12, 2026

**What we did:** Complete Phase 0 environment setup from scratch.

**What was completed:**
- Installed Node.js, confirmed Python/Git/VS Code already present
- Fixed PowerShell script execution policy
- Created project folder structure inside existing OneDrive folder
- Built Flask Hello World backend (app.py)
- Built React Hello World frontend (App.js)
- Confirmed frontend and backend talk to each other
- Created .gitignore and README.md
- Pushed everything to GitHub at github.com/Gotkens/kindpdf
- Set up GitHub with private no-reply email for privacy

**What was left unfinished:**
- Docker Desktop not yet installed

**Any errors encountered:**
- npm blocked by PowerShell execution policy — fixed with 
  Set-ExecutionPolicy RemoteSigned
- GitHub token accidentally shared in chat — deleted and regenerated 
  immediately, no harm done

---

## Next Session Goal

Build Phase 1.1 — the PDF Viewer. A real PDF file should open in the 
browser with working page navigation and zoom controls.

---

## Session Log

| Date | What Was Accomplished |
|---|---|
| March 12, 2026 | Phase 0 complete — full dev environment, Hello World app, pushed to GitHub |
| [date] | Project started — CLAUDE.md created |

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
| Phase 1 — MVP | ~$30–55 | $0 |
| Phase 2 — Features | ~$25–45 | $0 |
| Phase 3 — Enterprise | ~$17–28 | $0 |
| **Total** | **~$74–132** | **~$2** |

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
2. cd to project folder
3. Start backend: cd backend → .\venv\Scripts\Activate → python app.py
4. Start frontend: open second PowerShell → cd frontend → npm start
5. Open this CLAUDE.md and paste it into Claude with your question