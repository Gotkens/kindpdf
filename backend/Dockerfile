# backend/Dockerfile
# KindPDF — Flask backend container
#
# Base: Python 3.11 slim (small footprint, official image)
# Runs: Gunicorn on port 5000 (4 workers, 120 s timeout)
# PyMuPDF 1.25+ ships its own native libraries inside the wheel,
# so no separate libmupdf install is needed.

FROM python:3.11-slim

# ── System dependencies ────────────────────────────────────────────────────
# gcc: needed if any pip dependency has a C extension that must be compiled.
# libgl1: required by some builds of OpenCV that PyMuPDF may link against.
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ──────────────────────────────────────────────────────
WORKDIR /app

# ── Python dependencies ────────────────────────────────────────────────────
# requirements.txt may be UTF-16 (saved by pip on Windows).
# The one-liner below decodes it to UTF-8 before pip reads it.
# gunicorn is added here (production WSGI server) — not in requirements.txt
# because local dev uses the built-in Flask server.
COPY requirements.txt .
RUN python3 -c "\
content = open('requirements.txt','rb').read();\
text = content.decode('utf-16') if content[:2] in (b'\xff\xfe',b'\xfe\xff') else content.decode('utf-8-sig');\
open('/app/requirements_clean.txt','w').write(text)\
" && pip install --no-cache-dir -r /app/requirements_clean.txt gunicorn

# ── Application code ───────────────────────────────────────────────────────
COPY app.py .

# ── Uploads folder ─────────────────────────────────────────────────────────
# Create the folder so Flask can store PDFs. Using an absolute path avoids any
# ambiguity about the working directory at build time.
# In docker-compose this path is mounted as a named volume so uploaded PDFs
# survive container restarts and rebuilds.
RUN mkdir -p /app/uploads

# ── Expose port ───────────────────────────────────────────────────────────
EXPOSE 5000

# ── Start server ──────────────────────────────────────────────────────────
# Gunicorn is the production WSGI server.
# --timeout 120: allows time for large PDFs to be processed.
# For local development outside Docker, "python app.py" still works as before.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "120", "app:app"]
