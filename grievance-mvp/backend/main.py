from threading import Thread

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    pending = db.get_pending_complaints()
    if pending:
        # Recover incomplete reports sequentially to avoid a burst of Gemini calls.
        Thread(target=analyze_pending_complaints, args=(pending,), daemon=True).start()


class StatusUpdate(BaseModel):
    status: str
    estimated_days: int | None = Field(default=None, ge=0)
    estimated_hours: int | None = Field(default=None, ge=0, le=23)


def analyze_complaint(complaint_id, text, lat, lng):
    result = ai.classify_and_prioritize(text)
    # Store visible AI fields before embedding, so quota failures cannot hide them.
    db.update_classification(complaint_id, result)

    vec = ai.embed(text)
    stored = db.get_embeddings(exclude_id=complaint_id)
    dup_id, _ = ai.find_duplicate(vec, stored, lat, lng)
    db.update_embedding(complaint_id, vec, dup_id)


def analyze_pending_complaints(complaints):
    for complaint in complaints:
        try:
            analyze_complaint(
                complaint["id"],
                complaint["text"],
                complaint["lat"],
                complaint["lng"],
            )
        except Exception as error:
            # Leave failed rows pending so another server restart can retry them.
            print(f"Analysis retry failed for complaint #{complaint['id']}: {error}")


@app.post("/submit")
async def submit_complaint(
    text: str = Form(..., min_length=1),
    complainant_name: str = Form(..., min_length=1),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    address: str | None = Form(None),
    photo: UploadFile | None = File(None),
):
    photo_bytes = await photo.read() if photo is not None else None

    # Save first so the citizen receives a permanent report ID immediately.
    complaint_id = db.insert_complaint(
        {
            "text": text,
            "complainant_name": complainant_name,
            "lat": lat,
            "lng": lng,
            "address": address,
            "photo": photo_bytes,
        }
    )

    # Gemini analysis updates this same row without delaying the ID response.
    Thread(
        target=analyze_complaint,
        args=(complaint_id, text, lat, lng),
        daemon=True,
    ).start()

    return {"id": complaint_id, "status": "Registered"}


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
    estimated_days = (
        payload.estimated_days if payload.status == "In Progress" else None
    )
    estimated_hours = (
        payload.estimated_hours if payload.status == "In Progress" else None
    )
    db.update_status(cid, payload.status, estimated_days, estimated_hours)
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
# curl -X POST "http://localhost:8000/submit" -F "complainant_name=Demo User" -F "text=Water pipeline burst flooding the road" -F "lat=19.07" -F "lng=72.87"
