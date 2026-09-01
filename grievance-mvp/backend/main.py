from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import ai


app = FastAPI(title="Grievance MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    # Ensure the SQLite complaints table exists before any API request is processed.
    db.init_db()


class Complaint(BaseModel):
    text: str
    lat: float
    lng: float


class StatusUpdate(BaseModel):
    status: str


@app.post("/submit")
def submit_complaint(c: Complaint):
    # Step 1: classify the complaint and assign department, priority, score, and reasons.
    result = ai.classify_and_prioritize(c.text)

    # Step 2: create the text embedding for duplicate detection.
    vec = ai.embed(c.text)

    # Step 3: fetch all stored embeddings for similarity comparison.
    stored = db.get_embeddings()

    # Step 4: compare to existing complaints and return the best duplicate candidate.
    dup_id, similarity = ai.find_duplicate(vec, stored)

    # Step 5: save the complaint record with duplicate_of set if a match was found.
    complaint_id = db.insert_complaint(
        {
            "text": c.text,
            "lat": c.lat,
            "lng": c.lng,
            "department": result["department"],
            "priority": result["priority"],
            "score": result["score"],
            "reasons": result["reasons"],
            "embedding": vec,
            "duplicate_of": dup_id,
        }
    )

    return {
        "id": complaint_id,
        "department": result["department"],
        "priority": result["priority"],
        "score": result["score"],
        "reasons": result["reasons"],
        "is_duplicate": dup_id is not None,
        "similar_to": dup_id,
        "similarity": similarity,
    }


@app.get("/complaints")
def get_complaints():
    return db.get_all()


@app.get("/status/{cid}")
def get_status(cid: int):
    complaint = db.get_one(cid)
    if complaint is None:
        return {"error": "not found"}
    return complaint


@app.patch("/status/{cid}")
def update_status(cid: int, payload: StatusUpdate):
    db.update_status(cid, payload.status)
    return {"ok": True}


@app.get("/analytics")
def get_analytics():
    complaints = db.get_all()
    counts = {}
    for complaint in complaints:
        dept = complaint.get("department")
        if dept is None:
            continue
        counts[dept] = counts.get(dept, 0) + 1
    return counts


@app.get("/")
def health_check():
    return {"status": "ok"}


# Example curl request for testing the submit pipeline:
# curl -X POST "http://localhost:8000/submit" -H "Content-Type: application/json" -d '{"text":"Water pipeline burst flooding the road and causing danger to nearby residents","lat":19.07,"lng":72.87}'
