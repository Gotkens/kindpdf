# KindPDF

**The most beautiful, easiest-to-use open source PDF editor in the world.**

KindPDF is a free, self-hostable web app for editing PDFs — designed to be so simple that anyone can sign a document in under 60 seconds without asking for help.

---

## What you can do with KindPDF

- **Highlight, underline, and cross out text** — click and drag, just like in a browser
- **Add sticky notes** — click anywhere to leave a comment
- **Add text** — click to place a text box, choose font and size
- **Draw** — freehand pen tool with adjustable size and color
- **Sign** — draw, type, or upload your signature, then drag it into place
- **Fill in forms** — interactive fields for text, checkboxes, dropdowns, and more
- **Organize pages** — reorder, rotate, delete, or extract pages
- **Merge PDFs** — insert another PDF at any position
- **Lock or unlock** — add or remove a password
- **Print** — send directly to your printer
- **Save** — download the finished PDF with all changes embedded

---

## Install with Docker (recommended)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed. That's the only requirement.

### Step 1 — Download the code

```
git clone https://github.com/Gotkens/kindpdf.git
cd kindpdf
```

If you don't have Git, you can also click **Code → Download ZIP** on GitHub, then unzip the folder.

### Step 2 — Start KindPDF

```
docker compose up --build
```

The first time you run this, Docker will download the necessary pieces and build the app. This takes 3–5 minutes. You will see a lot of text scroll by — that is normal.

When you see a line like:

```
kindpdf-frontend  | nginx: started
```

...the app is ready.

### Step 3 — Open KindPDF

Open your browser and go to:

```
http://localhost:3000
```

That's it. KindPDF is running on your computer.

---

## Stopping KindPDF

Press `Ctrl + C` in the terminal window where KindPDF is running.

To start it again (without rebuilding):

```
docker compose up
```

---

## Updating KindPDF

Pull the latest code, then rebuild:

```
git pull
docker compose up --build
```

---

## Running without Docker (for developers)

If you want to run the code directly without Docker:

**Backend (Python / Flask)**

```
cd backend
python -m venv venv

# On Windows:
.\venv\Scripts\Activate.ps1

# On Mac / Linux:
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

The backend starts at `http://localhost:5000`.

**Frontend (React)**

Open a second terminal window:

```
cd frontend
npm install
npm start
```

The app opens automatically at `http://localhost:3000`.

---

## Troubleshooting

**"Port 3000 is already in use"**
Something else on your computer is using port 3000. Open `docker-compose.yml` in a text editor and change `"3000:80"` to `"3001:80"`, then access KindPDF at `http://localhost:3001`.

**"Port 5000 is already in use"**
Change `"5000:5000"` to `"5001:5000"` in `docker-compose.yml`. Then open `frontend/src/components/PDFViewer.js` and replace every occurrence of `localhost:5000` with `localhost:5001`. Rebuild with `docker compose up --build`.

**The app builds but PDFs won't open**
Make sure the backend container is running. You can check with:
```
docker compose ps
```
All three services (`kindpdf-backend`, `kindpdf-frontend`, `kindpdf-db`) should show `running`.

**I get a blank screen after uploading a PDF**
Try a hard refresh: `Ctrl + Shift + R` (Windows / Linux) or `Cmd + Shift + R` (Mac).

---

## Data and privacy

- PDFs are stored temporarily in the `pdf_uploads` Docker volume on your own computer.
- Nothing is sent to any external server.
- KindPDF does not collect any usage data.

---

## License

KindPDF is open source under the [MIT License](LICENSE).

---

## Pricing

| Edition | Price | What you get |
|---|---|---|
| Community | Free | Everything described above, self-hosted |
| Pro | $99 / year | Storage, team accounts, priority support |
| Business | $499 / year | SSO, audit logs, API access |
| Enterprise | Custom | SLA, custom contract, security review |
| Hosted Cloud | $19 / month | Managed hosting — no server required |

Community edition is and will always be free and open source.
