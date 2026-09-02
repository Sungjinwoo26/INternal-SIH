# AI Grievance Platform - Technical Documentation

## 1. Project Purpose

The AI Grievance Platform is a civic complaint management MVP for citizens and local authorities. Citizens can submit a complaint with their name, location, and an optional photo. The system classifies the issue, assigns it to a department, calculates urgency, detects nearby duplicate complaints, and returns a trackable complaint ID.

Authorities can review complaints in priority order, inspect their locations on a heatmap, see department-level analytics, view uploaded photos, update complaint statuses, and optionally attach photographic proof when resolving an issue.

The interface supports English, Hindi, and Marathi.

## 2. Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React 19 | Component-based citizen and authority interfaces |
| Frontend build tool | Vite 8 | Local development server and production builds |
| Styling | Tailwind CSS CDN | Responsive utility-based styling |
| HTTP client | Axios | Communication between React and FastAPI |
| Maps | Leaflet + OpenStreetMap | Complaint markers and geographic display |
| Heatmap | `leaflet.heat` | Complaint hotspot visualization |
| Charts | Recharts | Complaints-per-department bar chart |
| Backend | Python + FastAPI | REST API, validation, uploads, and application logic |
| API server | Uvicorn | Runs the FastAPI application |
| Database | SQLite | Local relational complaint storage |
| AI classification | Gemini `gemini-3.6-flash` | Classifies unfamiliar complaints and rejects meaningless input |
| Embeddings | Gemini `gemini-embedding-001` | Represents unfamiliar complaints for semantic duplicate matching |
| Local AI logic | Python issue catalog | Handles 25 common civic issues without an API request |
| Similarity | NumPy cosine similarity | Compares semantic embeddings |
| Distance | Haversine formula | Restricts duplicate detection to a 500 m radius |
| Configuration | `python-dotenv` | Loads `GEMINI_API_KEY` from `backend/.env` |
| File upload | FastAPI `UploadFile` + `python-multipart` | Receives optional complaint images |
| Localization | Local JavaScript dictionary | Instant English, Hindi, and Marathi UI translation |

## 3. System Architecture

```text
Citizen Browser                         Authority Browser
      |                                      |
      | React forms and tracking             | React dashboard
      +------------------+-------------------+
                         |
                    Axios / HTTP
                         |
                  FastAPI REST API
                         |
          +--------------+---------------+
          |                              |
   Hybrid complaint analyzer       Complaint services
          |                              |
   +------+-------+                +-----+----------------+
   |              |                |                      |
Local catalog   Gemini API      SQLite database      Photo responses
   |          classification,       |                  from BLOBs
issue type,     validation,          |
score rules     embeddings           +-- complaints
   |              |                  +-- locations
   +------+-------+                  +-- status/estimates
          |                          +-- AI results
 Duplicate detection                +-- duplicate links
 issue type or cosine similarity
 + different user + <= 500 metres
```

The frontend and backend are separate applications. The frontend runs by default at `http://localhost:5173`, while the API runs at `http://localhost:8000`. The frontend's API base URL is currently hard-coded to the local backend address.

## 4. Main Components

### Frontend

- `frontend/src/App.jsx` controls the Citizen and Authority top-level views, language selection, and authority login state.
- `frontend/src/Citizen.jsx` provides complaint submission and complaint-ID tracking.
- `frontend/src/Authority.jsx` provides the heatmap, chart, complaint table, photo previews, and status controls.
- `frontend/src/api.js` contains all Axios requests and constructs photo URLs.
- `frontend/src/translations.js` contains the English, Hindi, and Marathi UI text.
- `frontend/index.html` loads Tailwind CSS and Leaflet CSS from CDNs.

The application uses React state to switch views instead of a routing library. Authority login is stored in browser `localStorage`, allowing the session to survive a refresh.

### Backend

- `backend/main.py` defines the FastAPI application and REST endpoints.
- `backend/ai.py` contains the local issue catalog, Gemini integration, score rules, embedding logic, geographic distance calculation, and duplicate detection.
- `backend/db.py` creates and accesses the SQLite database.
- `backend/seed.py` loads demo complaints from `backend/seed_data.csv` through the same analysis and duplicate pipeline.
- `backend/grievance.db` is the local SQLite database.

## 5. Complaint Submission Workflow

1. The citizen enters a complainant name and complaint description.
2. The citizen may attach an image.
3. The citizen selects one of three location methods:
   - Browser current location.
   - Manually entered latitude and longitude.
   - A typed address.
4. If browser geolocation fails, the frontend uses Mumbai coordinates `19.07, 72.87` as a fallback.
5. The frontend packages the data as `multipart/form-data` and sends it to `POST /submit`.
6. FastAPI confirms that an uploaded file has an image MIME type and reads it into memory.
7. The complaint is passed to the hybrid analyzer.
8. A valid complaint receives a department, score, priority, reasons, analysis source, and optional issue type.
9. The system checks whether the complaint is a duplicate.
10. All complaint data and the optional image are inserted into SQLite.
11. The API returns the complaint ID and analysis result to the citizen.

Analysis currently happens synchronously before the database insert. Therefore, the submission request waits for local analysis or any required Gemini calls to finish before the complaint ID is returned.

## 6. Hybrid Analysis Workflow

The system uses a local-first strategy to reduce cost and response time.

### Local Catalog Path

`backend/ai.py` contains a catalog of 25 common issues across these departments:

- Water
- Roads
- Electricity
- Sanitation
- Public Safety
- Health

The catalog recognizes phrases for issues such as gas leaks, burst pipelines, potholes, live wires, garbage collection, sewage, streetlights, fires, unsafe buildings, mosquitoes, food poisoning, and aggressive stray animals. It includes English and selected Hindi and Marathi keywords.

When a catalog keyword matches, the system uses the catalog's department and base score without calling Gemini. Local rules can then increase the score:

| Condition | Score adjustment |
| --- | ---: |
| Danger, flooding, accident, or life-threatening language | `+15` |
| School, hospital, market, or crowded-market location | `+10` |
| Issue continuing for several days | `+10` |

Scores are capped at 100.

### Gemini Path

If no catalog entry matches, Gemini receives the original complaint and is asked to:

- Decide whether it is a meaningful civic complaint.
- Select one supported department.
- Assign a priority and score from 0 to 100.
- Return short reasons as JSON.
- Understand English, Hindi, or Marathi directly.

Meaningless input is stored with status `Invalid` and without department, priority, score, embedding, or duplicate information.

If Gemini fails or returns unusable output, the safe fallback is:

- Department: `Public Safety`
- Priority: `MEDIUM`
- Score: `50`
- Reason: `Auto-fallback classification`

Classification and embedding requests have 30-second timeouts.

### Priority Bands

| Score | Priority |
| ---: | --- |
| 85-100 | `CRITICAL` |
| 70-84 | `HIGH` |
| 45-69 | `MEDIUM` |
| 0-44 | `LOW` |

## 7. Duplicate Complaint Workflow

A new complaint is eligible to be marked as a duplicate only when:

1. Both complaints have latitude and longitude.
2. The complaints are no more than 500 metres apart.
3. The new complainant's normalized name differs from the existing complainant's normalized name.
4. The complaints describe the same issue.

Names are compared case-insensitively after trimming and collapsing whitespace. If either name is missing, the system does not assume that the users are different.

For catalog-recognized complaints, "same issue" means the same local `issue_type`. The nearest matching complaint within 500 metres is selected.

For complaints analyzed through Gemini, the system creates an embedding and compares it with stored embeddings using cosine similarity. Only nearby records are compared, and the best match must have a similarity score of at least `0.85`.

When a match is found:

- The new record's `duplicate_of` field points to the matched complaint ID.
- The new complaint's numerical score increases by `+1`, capped at 100.
- The priority label is recalculated from the new score.
- A repeated-nearby-report reason is added.

The `+1` applies once to each new duplicate complaint. It increases the newly submitted duplicate's score; it does not currently update the original complaint's stored score.

Typed-address-only complaints cannot participate in duplicate detection because the application does not geocode addresses.

## 8. Database Design

SQLite stores all data in the `complaints` table.

| Column | Purpose |
| --- | --- |
| `id` | Auto-incrementing complaint ID |
| `text` | Original complaint text |
| `complainant_name` | Citizen name used for display and duplicate-user checks |
| `photo` | Optional image stored as a BLOB |
| `photo_content_type` | Image MIME type |
| `resolution_photo` | Optional proof image uploaded when resolving a complaint |
| `resolution_photo_content_type` | Resolution image MIME type |
| `lat`, `lng` | Coordinates used by maps and duplicate detection |
| `address` | Optional typed address stored without geocoding |
| `department` | Assigned civic department |
| `priority` | `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` |
| `score` | Urgency score from 0 to 100 |
| `reasons` | JSON-encoded list of scoring reasons |
| `embedding` | JSON-encoded Gemini vector for semantic matching |
| `duplicate_of` | ID of the matched earlier complaint |
| `status` | `Open`, `In Progress`, `Resolved`, or `Invalid` |
| `estimated_resolution_days` | Authority-provided day estimate |
| `estimated_resolution_hours` | Authority-provided hour estimate |
| `analysis_source` | `local`, `gemini`, or `fallback` |
| `issue_type` | Local catalog issue identifier |
| `analysis_complete` | Stored analysis completion marker |
| `created_at` | SQLite creation timestamp |

The database initialization function also adds missing columns to older databases, providing lightweight schema migration for the MVP.

Normal complaint responses return `has_photo` and `has_resolution_photo` instead of returning image bytes. Images are requested separately, which keeps list and tracking responses small. If an older photo has no saved MIME type, the backend detects PNG, JPEG, GIF, or WebP from its file signature.

## 9. API Reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | API health check |
| `POST` | `/submit` | Submit and analyze a complaint |
| `GET` | `/complaints` | List complaints ordered by descending score |
| `GET` | `/status/{id}` | Fetch one complaint for tracking |
| `PATCH` | `/status/{id}` | Update a complaint status |
| `PATCH` | `/status/{id}/resolve` | Mark resolved with an optional proof image |
| `GET` | `/complaints/{id}/photo` | Return the complaint image with its MIME type |
| `GET` | `/complaints/{id}/resolution-photo` | Return the resolution proof image |
| `GET` | `/analytics` | Return complaint counts grouped by department |

FastAPI exposes interactive API documentation at `http://localhost:8000/docs` while the backend is running.

## 10. Citizen Experience

The Citizen area has two views:

- **File Complaint:** collects the name, complaint, optional image, and location, then displays the new complaint ID.
- **Track Complaint:** fetches a complaint by ID and displays its status, location, original photo, department, score, priority, reasons, duplicate link, and estimated resolution time when available. A resolved complaint also displays the authority's proof image when one was uploaded.

Invalid complaints remain trackable, but the interface hides empty AI fields and explains that the submission was rejected as a meaningful civic issue.

## 11. Authority Experience

The Authority area includes:

- A complaint intelligence map centered on Mumbai.
- OpenStreetMap map tiles.
- Department, priority, and time-range map filters.
- A toggleable heat layer whose intensity is based on complaint score.
- Numbered markers that group complaints within 500 metres and scale with report count.
- Live summary cards for active complaints, critical hotspots, and resolution proofs.
- A selected-hotspot panel showing department, priority, highest score, unresolved count, age, and proof count.
- A ranked Top Hotspots list, severity legend, and an inline usage guide.
- A Recharts bar chart of complaint totals by department.
- A score-ordered complaint table.
- Inline photo previews linked to full image responses.
- Status controls for `Open`, `In Progress`, and `Resolved`.
- An optional resolution-proof image picker shown before `Resolved` is saved.

The `Gemini (0/1)` column shows `0` for local catalog results and `1` for Gemini or fallback results.

Authority access is currently a frontend-only demo login. User IDs and passwords are hard-coded in `App.jsx`, and the logged-in username is stored in `localStorage`. It is not secure authentication and does not protect the backend API.

When an authority saves `In Progress`, the frontend sends estimated days and hours with the status update. FastAPI validates these values and passes them to SQLite, making the saved estimate available on the citizen tracking page.

When an authority selects `Resolved`, the dashboard waits for confirmation and offers an optional image picker. The resolve request stores the status and proof together. There is no citizen voting or automated image verification; the image is displayed as authority-provided proof in complaint tracking.

## 12. Multilingual Workflow

The language selector changes UI labels instantly using the local translation dictionary. No translation service is called. The original complaint text is stored unchanged, and Gemini is instructed to understand English, Hindi, and Marathi directly.

## 13. Demo Data Workflow

`backend/seed.py` reads `backend/seed_data.csv` sequentially. Each row receives a unique seed-user name and passes through the same classification, duplicate matching, score adjustment, and database insertion logic used by live submissions.

Sequential processing avoids a sudden burst of Gemini calls. Running the seed script more than once creates additional rows because it does not clear or deduplicate the database beforehand.

## 14. Running the Project

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Start the backend:

```powershell
cd grievance-mvp\backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Start the frontend in another terminal:

```powershell
cd grievance-mvp\frontend
npm install
npm run dev
```

Useful URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- API documentation: `http://localhost:8000/docs`

To create a production frontend bundle:

```powershell
cd grievance-mvp\frontend
npm run build
```

## 15. Current MVP Constraints

- There is no backend authentication or role-based authorization.
- Authority credentials are visible in frontend source code.
- CORS currently allows every origin.
- The Gemini client package in use is deprecated and should eventually move from `google-generativeai` to `google-genai`.
- SQLite and in-database image BLOBs are appropriate for this local MVP but not ideal for high-scale deployment.
- Complaint analysis is synchronous and may delay submission when Gemini is needed.
- There is no durable job queue, retry worker, or automatic recovery flow in the active API code.
- Typed addresses are not geocoded and therefore do not appear on the map or enter duplicate matching.
- Duplicate identity is based on normalized display names rather than verified user IDs.
- New duplicates receive `+1`, but the original complaint does not accumulate those increments.
- External Tailwind, Leaflet CSS, OpenStreetMap tiles, and Gemini services require network availability.
- The local database can contain names, locations, complaint text, original photos, and resolution photos and must be treated as private data.

## 16. End-to-End Summary

The React frontend gathers complaint data and sends it to FastAPI. FastAPI validates the image and invokes the local-first analyzer. Common complaints are classified using deterministic catalog rules; unfamiliar complaints use Gemini. Valid complaints are checked against nearby reports from different users using issue types or semantic embeddings. A duplicate receives a link to the earlier complaint and a `+1` score adjustment. SQLite stores the complete result, and the API returns a complaint ID. Citizens use that ID for tracking, while authorities consume the same API data through maps, charts, photos, and status controls.
