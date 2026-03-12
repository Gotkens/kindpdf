# KindPDF — Project Memory File

> This file is read by Claude at the start of every session.
> Keep it updated. It is the project's memory.
> Last updated: [UPDATE THIS DATE AFTER EVERY SESSION]

---

## What KindPDF Is

An open source, self-hostable web-based PDF editor. Free to download and run yourself. Also available as a paid hosted cloud version.

**The mission in one sentence:** Build the most beautiful, easiest-to-use open source PDF editor in the world — so simple that a 75-year-old with limited computer experience can sign a PDF in under 60 seconds without asking for help.

**Business model:** Open core — free community edition on GitHub, paid enterprise tier with advanced features, plus a $19/month hosted cloud option for users who do not want to self-host.

---

## Non-Negotiable Design Rules

These apply to EVERY feature. Claude must follow all of these automatically.

1. Every button has an icon AND a text label. Never icon-only.
2. Plain English everywhere. No PDF jargon. Say "Hide text permanently" not "Apply redaction."
3. Confirmation dialog before any action that cannot be undone.
4. Undo is always available and always visible on screen.
5. Minimum 16px body text size. High contrast. WCAG AA accessibility compliant.
6. Every tool has a tooltip explaining what it does in one plain sentence.
7. Never show a blank screen to a new user — empty states must guide them.
8. Success and error messages in plain English. Never show raw error codes.
9. All features work on mobile and tablet as well as desktop.
10. Multi-step tasks (like signing) use a clearly numbered guided flow: Step 1 of 3, Step 2 of 3, etc.

**The Grandma Test:** Before any feature is considered done, ask: could someone who rarely uses computers figure this out in 30 seconds without help? If no — simplify it.

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

> UPDATE THIS after each session where files are added or moved.
> To get the current structure, run this in your /kindpdf folder:
> find . -type f | grep -v node_modules | grep -v .git | grep -v __pycache__ | head -80

```
[PASTE YOUR CURRENT FILE STRUCTURE HERE AFTER PHASE 0]
```

---

## Current Status

> UPDATE THESE FIELDS after every session.

**Current Phase:** Phase 0 — Environment Setup

**Phase 0 complete:** ☐ No

**Phase 1 complete:** ☐ No

**Phase 2 complete:** ☐ No

**Phase 3 complete:** ☐ No

---

## What Is Working Right Now

> List every feature that is fully working and tested.
> Be specific. "PDF viewer works" is less useful than "PDF renders, zoom works, page nav works."

- [ ] Nothing yet — Phase 0 not started

---

## What Is NOT Working / Known Issues

> List bugs, broken features, or things that are partially done.
> Include the error message if there is one.

- [ ] Nothing yet — Phase 0 not started

---

## Last Session Summary

> Replace this entire section after every session with what you did.

**Date:** [not started]

**What we did:** Nothing yet — this is a fresh project.

**What was completed:** N/A

**What was left unfinished:** N/A

**Any errors encountered:** N/A

---

## Next Session Goal

> ONE specific, completable goal for the next session.
> Not "work on KindPDF" — something specific like "build the signature drawing canvas."

**Next goal:** Complete Phase 0 — set up development environment, create project folder structure, run Hello World app, push to GitHub.

---

## Session Log

> Add a one-line entry after every session. Newest at the top.

| Date | What Was Accomplished |
|---|---|
| [date] | Project started — CLAUDE.md created |

---

## Key Decisions Made

> Record important decisions here so you never have to re-debate them.

| Decision | Reason |
|---|---|
| Name: KindPDF | Unique, memorable, conveys friendly/approachable philosophy |
| Open core model | Free community edition drives adoption; enterprise tier drives revenue |
| Web-based (not desktop app) | Works on any device including tablets; no installation for end users |
| Flask + React | Proven, well-documented, Claude can build it reliably |
| Docker deployment | One command to self-host; industry standard |
| Senior-friendly UX as #1 priority | Biggest gap in current open source PDF tools; strong differentiator |

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

> Update the Spent column as you go.

| Phase | Estimated Cost | Spent So Far |
|---|---|---|
| Phase 0 — Setup | ~$2–4 | $0 |
| Phase 1 — MVP | ~$30–55 | $0 |
| Phase 2 — Features | ~$25–45 | $0 |
| Phase 3 — Enterprise | ~$17–28 | $0 |
| **Total** | **~$74–132** | **$0** |

---

## People and Resources

| Resource | Details |
|---|---|
| GitHub repo | [ADD YOUR GITHUB URL HERE AFTER PHASE 0] |
| Domain | [ADD YOUR DOMAIN HERE WHEN PURCHASED] |
| Docker Hub | [ADD YOUR DOCKER HUB URL HERE AFTER PHASE 1] |
| Stripe account | [NOTE WHETHER SET UP OR NOT] |

---

## How to Update This File

After every session, update these sections:

1. **Last updated date** — top of file
2. **What Is Working** — add anything newly working
3. **Known Issues** — add any new bugs found
4. **Last Session Summary** — replace with what you did today
5. **Next Session Goal** — write the ONE goal for next time
6. **Session Log** — add one line entry
7. **File Structure** — update if files were added or moved
8. **Build Cost Tracking** — update if you have a sense of tokens used

This takes about 5 minutes and saves 20 minutes of re-explaining at the start of every future session.
