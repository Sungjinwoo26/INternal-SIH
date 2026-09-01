# AI Grievance Platform - Project Overview

## 1. What This Project Does

This is a demo civic-complaint platform for citizens and local authorities. A citizen submits a complaint, the system uses AI to choose the responsible department and urgency, checks whether a similar complaint already exists, saves it, and returns a complaint ID. Citizens can later use that ID to check its status.

Current status: the backend, demo data, frontend shell, and Citizen interface are implemented. The Authority dashboard is still a placeholder and is planned for Step 8.

## 2. Technology Used

| Area | Technology | Why it is used |
| --- | --- | --- |
| Frontend | React + Vite | Fast, simple frontend development and component-based UI |
| Styling | Tailwind CSS CDN | Quick styling without Tailwind config or build setup |
| HTTP calls | Axios | Connects the React frontend to the backend API |
| Future dashboard | Leaflet, leaflet.heat, Recharts | Installed for the Step 8 map, heatmap, and charts; not used yet |
| Backend | Python + FastAPI | Small, clear REST API with automatic request validation |
| AI | Google Gemini | Classifies complaints, scores priority, and creates embeddings |
| Similarity | NumPy cosine similarity | Compares complaint embeddings to find likely duplicates |
| Database | SQLite | Lightweight local database suitable for an MVP demo |
| Environment | python-dotenv | Loads `GEMINI_API_KEY` from `backend/.env` |

Backend Python imports require `fastapi`, `uvicorn`, `google-generativeai`, `numpy`, and `python-dotenv`. The current `requirements.txt` only records `fastapi` and `uvicorn`, so the other three may need to be installed manually.

## 3. How a Complaint Moves Through the System

1. The citizen enters complaint text and clicks **Submit**.
2. The browser requests the user's location. If permission is denied, Mumbai coordinates `19.07, 72.87` are used.
3. React sends `text`, `lat`, and `lng` to `POST /submit` through `api.js`.
4. Gemini returns one department, a priority, a score from 0-100, and short reasons.
5. Gemini creates a 768-number text embedding representing the complaint's meaning.
6. The backend compares that embedding with all stored embeddings using cosine similarity.
7. A similarity of `0.85` or higher marks the complaint as a possible duplicate.
8. SQLite stores the complaint, AI result, embedding, duplicate link, location, and default status `Open`.
9. The frontend displays the complaint ID, classification, score, reasons, and any duplicate warning.
10. A citizen can enter the ID later; `GET /status/{id}` returns its status and department.

## 4. AI Behavior

Departments are limited to: **Water, Roads, Electricity, Sanitation, Public Safety, and Health**.

Priorities are limited to: **CRITICAL, HIGH, MEDIUM, and LOW**. Gemini considers public safety, infrastructure failure, number of people affected, and health risk. Classification and scoring use one Gemini request to reduce API usage. If Gemini classification returns invalid data or fails, the system safely returns `Public Safety`, `MEDIUM`, score `50` instead of crashing. Embedding errors do not currently have a fallback.

Duplicate detection is semantic, so wording can differ while meaning stays similar. It runs locally after embeddings are created and links a new complaint to the closest existing complaint when the score reaches the `0.85` threshold.

## 5. Database

SQLite creates `backend/grievance.db` when the backend starts. The `complaints` table stores:

`id`, `text`, `lat`, `lng`, `department`, `priority`, `score`, `reasons`, `embedding`, `duplicate_of`, `status`, and `created_at`.

Reasons and embeddings are stored as JSON text. Complaint lists are returned with the highest AI score first. Status starts as `Open` and can be changed through the status PATCH endpoint.

## 6. API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Backend health check |
| `POST` | `/submit` | Analyze, duplicate-check, and save a complaint |
| `GET` | `/complaints` | Return all complaints ordered by score |
| `GET` | `/status/{id}` | Return one complaint or `{ "error": "not found" }` |
| `PATCH` | `/status/{id}` | Update status using `{ "status": "..." }` |
| `GET` | `/analytics` | Return complaint counts grouped by department |

CORS currently allows all origins because this is a local demo.

## 7. Frontend Structure

- `src/App.jsx`: Shows the title and switches between Citizen and Authority tabs using React state; no router is used.
- `src/Citizen.jsx`: Submits complaints, shows AI feedback and duplicate warnings, and tracks status by ID.
- `src/Authority.jsx`: Placeholder for the future dashboard.
- `src/api.js`: Keeps all Axios calls in one place with base URL `http://localhost:8000`.
- `index.html`: Loads Tailwind and Leaflet CSS from CDNs.

## 8. Demo Data

`backend/seed_data.csv` contains 20 Mumbai-area complaints across several departments, geographic hotspots, critical issues, and intentionally similar complaint pairs. `seed.py` sends every row through the real AI and duplicate pipeline before inserting it. Run it only once because repeating it creates repeated records. Gemini's free tier may return a `429` rate-limit error during seeding.

## 9. Main Design Decisions

- **Simple MVP architecture:** React talks directly to FastAPI, and FastAPI talks to Gemini and SQLite.
- **SQLite instead of a hosted database:** easier local setup and reliable demos.
- **One AI classification call:** reduces cost and keeps department and priority reasoning consistent.
- **Embeddings for duplicates:** catches similar meaning rather than only exact matching words.
- **Sequential seeding:** preserves duplicate-link order and keeps behavior easy to understand.
- **Plain tab state instead of routing:** only two demo views are needed.
- **Real location with Mumbai fallback:** submissions still work when location access is denied.
- **Central API helper:** endpoint details stay outside UI components.

## 10. Running the Project

Create `backend/.env` containing `GEMINI_API_KEY=your_key` and run these in separate terminals:

```powershell
cd backend
uvicorn main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

Backend: `http://localhost:8000`  
Frontend: `http://localhost:5173`

Optional demo seeding, run once from `backend/`:

```powershell
python seed.py
```

## 11. Current Limitations

This is intentionally a demo: there is no login, photo upload, advanced error UI, production CORS policy, or Authority dashboard yet. Status updates and analytics already exist in the API for the upcoming Authority interface.
