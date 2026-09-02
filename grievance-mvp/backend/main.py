import threading
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
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


def process_complaint(cid, text, lat, lng, complainant_name):
    """Analyze one already-registered complaint and store its final state."""
    result = ai.classify_and_prioritize(text)

    if not result.get("valid", True):
        db.complete_analysis(cid, result, status="Invalid")
        return

    embedding = None
    duplicate_id = None

    if result["source"] == "local":
        stored = db.get_duplicate_candidates(exclude_id=cid)
        duplicate_id, _ = ai.find_local_duplicate(
            text,
            stored,
            lat,
            lng,
            complainant_name,
        )
    else:
        try:
            embedding = ai.embed(text)
            stored = db.get_embeddings(exclude_id=cid)
            duplicate_id, _ = ai.find_duplicate(
                embedding,
                stored,
                lat,
                lng,
                complainant_name,
            )
        except Exception:
            # Classification is still useful if the separate embedding call fails.
            embedding = None
            duplicate_id = None

    if duplicate_id is not None:
        result = ai.boost_duplicate_priority(result)

    db.complete_analysis(
        cid,
        result,
        embedding=embedding,
        duplicate_of=duplicate_id,
        status="Open",
    )


def recover_pending_complaints():
    # Finish reports left as Registered if the backend stopped during analysis.
    for complaint in db.get_pending_complaints():
        process_complaint(
            complaint["id"],
            complaint["text"],
            complaint["lat"],
            complaint["lng"],
            complaint["complainant_name"],
        )


@app.on_event("startup")
def startup_event():
    # Ensure the SQLite complaints table exists before any API request is processed.
    db.init_db()
    threading.Thread(target=recover_pending_complaints, daemon=True).start()


class StatusUpdate(BaseModel):
    status: str
    estimated_days: Optional[int] = None
    estimated_hours: Optional[int] = None


@app.post("/submit")
async def submit_complaint(
    background_tasks: BackgroundTasks,
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

    # Save first so the citizen receives a permanent ID without waiting for AI.
    complaint_id = db.insert_complaint(
        {
            "text": text,
            "complainant_name": complainant_name,
            "photo": photo_bytes,
            "photo_content_type": photo_content_type,
            "lat": lat,
            "lng": lng,
            "address": address,
            "status": "Registered",
            "analysis_complete": 0,
        }
    )

    # FastAPI starts this task after sending the registration response.
    background_tasks.add_task(
        process_complaint,
        complaint_id,
        text,
        lat,
        lng,
        complainant_name,
    )

    return {
        "id": complaint_id,
        "department": None,
        "priority": None,
        "score": None,
        "reasons": [],
        "is_duplicate": False,
        "similar_to": None,
        "similarity": 0,
        "status": "Registered",
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


@app.get("/complaints/{cid}/resolution-photo")
def get_resolution_photo(cid: int):
    photo = db.get_resolution_photo(cid)
    if photo is None:
        raise HTTPException(status_code=404, detail="Resolution photo not found")
    photo_bytes, content_type = photo
    return Response(content=photo_bytes, media_type=content_type)


@app.patch("/status/{cid}")
def update_status(cid: int, payload: StatusUpdate):
    db.update_status(
        cid,
        payload.status,
        payload.estimated_days,
        payload.estimated_hours,
    )
    return {"ok": True}


@app.patch("/status/{cid}/resolve")
async def resolve_complaint(
    cid: int,
    resolution_photo: Optional[UploadFile] = File(None),
):
    photo_bytes = None
    content_type = None
    if resolution_photo is not None:
        if (
            not resolution_photo.content_type
            or not resolution_photo.content_type.startswith("image/")
        ):
            raise HTTPException(
                status_code=400,
                detail="Resolution proof must be an image",
            )
        photo_bytes = await resolution_photo.read()
        content_type = resolution_photo.content_type

    db.resolve_complaint(cid, photo_bytes, content_type)
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
