from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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


class StatusUpdate(BaseModel):
    status: str


@app.post("/submit")
async def submit_complaint(
    text: str = Form(...),
    complainant_name: str = Form(...),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    address: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
):
    photo_bytes = None
    photo_content_type = None
    if photo is not None:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Photo must be an image")
        photo_bytes = await photo.read()
        photo_content_type = photo.content_type

    # Step 1: classify the complaint and assign department, priority, score, and reasons.
    result = ai.classify_and_prioritize(text)

    if result["source"] == "local":
        # Catalog issues can be matched cheaply by issue type plus nearby distance.
        stored = db.get_duplicate_candidates()
        dup_id, similarity = ai.find_local_duplicate(
            text,
            stored,
            lat,
            lng,
            complainant_name,
        )
        vec = None
    else:
        # Unclear issues fall back to embeddings for semantic duplicate matching.
        vec = ai.embed(text)
        stored = db.get_embeddings()
        dup_id, similarity = ai.find_duplicate(
            vec,
            stored,
            lat,
            lng,
            complainant_name,
        )

    if dup_id is not None:
        result = ai.boost_duplicate_priority(result)

    # Step 5: save the complaint record with duplicate_of set if a match was found.
    complaint_id = db.insert_complaint(
        {
            "text": text,
            "complainant_name": complainant_name,
            "photo": photo_bytes,
            "photo_content_type": photo_content_type,
            "lat": lat,
            "lng": lng,
            "address": address,
            "department": result["department"],
            "priority": result["priority"],
            "score": result["score"],
            "reasons": result["reasons"],
            "embedding": vec,
            "duplicate_of": dup_id,
            "analysis_source": result["source"],
            "issue_type": result["issue_type"],
            "analysis_complete": 1,
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


@app.get("/complaints/{cid}/photo")
def get_complaint_photo(cid: int):
    photo = db.get_photo(cid)
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    photo_bytes, content_type = photo
    return Response(content=photo_bytes, media_type=content_type)


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
