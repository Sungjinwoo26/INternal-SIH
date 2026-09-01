# AI Grievance Platform - Project Overview

## What The Project Does

This is a demo civic complaint platform for citizens and authorities. Citizens register their name, complaint, location, and an optional photo, receive an ID immediately, and later search that ID for the report details and AI result. Authorities see complaints in a score-ordered table, geographic heatmap, and department chart, and can update complaint status.

## Technology

| Area | Technology | Why it is used |
| --- | --- | --- |
| Frontend | React + Vite | Fast component-based interface and development server |
| Styling | Tailwind CSS CDN | Simple responsive styling without configuration files |
| API calls | Axios | Centralized communication with the FastAPI backend |
| Dashboard | Leaflet, leaflet.heat, Recharts | Map markers, hotspots, and department chart |
| Backend | Python + FastAPI | Small REST API with request validation |
| Database | SQLite | Lightweight local storage for the MVP |
| AI | Gemini `gemini-3.6-flash` | Multilingual department and priority analysis |
| Fast classification | Local common-issue catalog | Instant zero-token results for frequent civic complaints |
| Embeddings | Gemini `gemini-embedding-001` | Semantic duplicate detection |
| Similarity | NumPy cosine similarity + Haversine distance | Matches meaning only when complaints are within 500 metres |
| Configuration | python-dotenv | Loads the local `GEMINI_API_KEY` from `.env` |
| File uploads | FastAPI `UploadFile` + python-multipart | Receives the optional image through standard multipart form data |

Backend dependencies are recorded in `backend/requirements.txt`. Frontend dependencies are recorded in `frontend/package.json`.

## Complaint Flow

1. The citizen enters their name and writes a complaint in English, Hindi, or Marathi.
2. They optionally select a photo and choose current location, manual latitude/longitude, or a typed address.
3. React sends the fields and optional image as `multipart/form-data`.
4. `POST /submit` saves the name, original text, location, and image bytes in SQLite first.
5. The API immediately returns a permanent complaint ID with `Registered` state.
6. A daemon worker checks the local common-issue catalog first.
7. Common issues are classified instantly; unfamiliar issues go to Gemini.
8. Classification fields are saved before duplicate processing.
9. Gemini creates an embedding; NumPy compares it with stored embeddings.
10. The Haversine formula first keeps only complaints within 500 metres, then similarity of `0.85` or higher links the closest duplicate.
11. Searching the ID shows `Registered - AI analysis is in progress` until classification arrives, then shows every report detail.

## Reliability And Recovery

Gemini generation and embedding calls have 30-second timeouts. Classification has a safe fallback of Public Safety, MEDIUM, score 50 if Gemini output is invalid. Classification is stored before embeddings, so an embedding quota error cannot leave department, priority, score, or reasons empty.

The local catalog handles common garbage, electricity outage, fallen tree, burst pipe, open manhole, live wire, pothole, and sewage complaints. It is used before Gemini because it is instant, predictable, costs no tokens, and reduces rate-limit pressure. Gemini remains the fallback for unfamiliar or ambiguous reports.

Whenever FastAPI starts, it finds rows missing department, priority, or score and processes them sequentially in one recovery thread. Sequential recovery avoids sending a burst of requests that could trigger Gemini rate limits. Failed rows remain pending and are retried after the next restart.

## Location Features

- **Current Location:** uses browser geolocation; denied access falls back to Mumbai coordinates `19.07, 72.87`.
- **Manual Coordinates:** stores latitude and longitude entered by the citizen.
- **Typed Address:** stores the address exactly as entered without geocoding or extra APIs.
- Address-only complaints appear in lists and ID tracking but not on the heatmap because they have no coordinates.
- Duplicate detection requires coordinates on both reports. Matching text beyond 500 metres, or reports with only typed addresses, are not marked as duplicates.

SQLite automatically adds the `address` column to older databases when the backend starts.

## Multilingual Interface

The React interface has local English, Hindi, and Marathi translations in `src/translations.js`. Headings, buttons, field labels, table headings, and status options switch instantly without an external translation API, cost, or delay. Complaint text is never translated or modified. Gemini is instructed to understand all three languages directly.

## Citizen Interface

- Registers complaint text with one of the three location methods.
- Requires the complainant's name and accepts one optional image from the device.
- Returns the complaint ID before AI processing finishes.
- Tracks a complaint by ID.
- Shows original text, address or coordinates, status, department, priority, score, reasons, and duplicate link.

## Authority Dashboard

- Heatmap and markers for complaints that have coordinates.
- Bar chart showing complaint count per department.
- All complaints ordered by score descending from the backend.
- Table columns: ID, complaint, department, priority, score, duplicate, and status.
- Status options: Open, In Progress, and Resolved.
- Choosing In Progress reveals estimated resolution inputs for days and hours; citizens see the saved estimate when tracking the ID.

## Database

SQLite creates `backend/grievance.db`. The `complaints` table stores:

`id`, `text`, `complainant_name`, `photo`, `lat`, `lng`, `address`, `department`, `priority`, `score`, `reasons`, `embedding`, `duplicate_of`, `status`, `estimated_resolution_days`, `estimated_resolution_hours`, and `created_at`.

The photo is stored directly as a SQLite `BLOB`. API responses return only `has_photo`, not the image bytes, which keeps normal complaint requests small. Reasons and embeddings are JSON-encoded in SQLite. Status defaults to `Open`. The database now contains names, locations, and photos, so it is private local demo data and must not be committed publicly.

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/submit` | Register a report and start background analysis |
| `GET` | `/complaints` | Return all complaints ordered by score |
| `GET` | `/status/{id}` | Return every stored detail for one report |
| `PATCH` | `/status/{id}` | Update complaint status |
| `GET` | `/analytics` | Return counts grouped by department |

CORS allows all origins because this is a local demo.

## Demo Data

`seed_data.csv` contains 20 Mumbai-area complaints across civic departments, including critical issues, geographic clusters, and near-duplicate pairs. `seed.py` sends them sequentially through the same Gemini and duplicate pipeline. Run it once; if Gemini returns `429`, add a short delay between rows.

## Main Decisions

- **Save before AI:** citizens receive an ID even when Gemini is slow or unavailable.
- **Multipart upload:** sends normal fields and the optional image together in one standard request.
- **SQLite BLOB:** stores the demo photo without adding a file-storage service or another dependency.
- **Return `has_photo` only:** prevents large image data from slowing normal dashboard and tracking responses.
- **Background worker:** AI processing does not block registration.
- **Local common-issue catalog:** frequent complaints receive fast, zero-token classification.
- **Store classification before embedding:** duplicate-service quota failures cannot hide visible analysis.
- **Startup recovery:** interrupted reports do not remain permanently unanalyzed.
- **Sequential recovery and seeding:** protects the limited Gemini quota.
- **Embeddings instead of exact text matching:** finds complaints with similar meaning.
- **500 m Haversine check:** prevents similar issues in different neighbourhoods from being linked and requires no map API.
- **Stored resolution estimate:** keeps authority-entered days and hours available to citizen ID tracking.
- **SQLite:** minimal setup and reliable local demos.
- **Local UI translations:** multilingual controls without another paid API.
- **No address geocoding:** typed addresses remain free and unchanged.
- **Plain React tab state:** avoids unnecessary routing dependencies.
- **Local-only secrets:** `backend/.env` is ignored by Git and must never be committed.

## Run The Project

Create `backend/.env` locally:

```env
GEMINI_API_KEY=your_key
```

Backend terminal:

```powershell
cd grievance-mvp/backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Frontend terminal:

```powershell
cd grievance-mvp/frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`
Backend docs: `http://localhost:8000/docs`

## Current Limits

This is an MVP: no login, photo preview/download endpoint, address geocoding, production CORS policy, or durable external job queue. Background work uses local threads, so startup recovery is important after a server restart.
