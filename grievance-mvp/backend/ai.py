import json
import math
import os

import numpy as np
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables from the backend/.env file so GEMINI_API_KEY is available.
load_dotenv()

# Configure the Gemini API client using the project API key from the environment.
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

# Reusable Gemini model instance for classification + priority scoring.
model = genai.GenerativeModel("gemini-3.6-flash")


COMMON_ISSUES = [
    {
        "keywords": ["garbage", "trash", "waste", "कचरा"],
        "department": "Sanitation",
        "priority": "HIGH",
        "score": 70,
        "reasons": ["Uncollected waste creates a growing public health risk"],
    },
    {
        "keywords": ["no electricity", "power outage", "बिजली", "वीज"],
        "department": "Electricity",
        "priority": "HIGH",
        "score": 70,
        "reasons": ["Electricity service interruption"],
    },
    {
        "keywords": ["tree fell", "fallen tree", "झाड पड"],
        "department": "Public Safety",
        "priority": "CRITICAL",
        "score": 88,
        "reasons": ["Immediate risk to people and property"],
    },
    {
        "keywords": ["pipeline burst", "water pipe burst"],
        "department": "Water",
        "priority": "CRITICAL",
        "score": 92,
        "reasons": ["Major water infrastructure failure and flooding risk"],
    },
    {
        "keywords": ["open manhole"],
        "department": "Public Safety",
        "priority": "CRITICAL",
        "score": 95,
        "reasons": ["Immediate accident and injury risk"],
    },
    {
        "keywords": ["live wire", "hanging wire", "exposed wire"],
        "department": "Electricity",
        "priority": "CRITICAL",
        "score": 95,
        "reasons": ["Immediate electrocution risk"],
    },
    {
        "keywords": ["pothole"],
        "department": "Roads",
        "priority": "MEDIUM",
        "score": 60,
        "reasons": ["Road safety and vehicle damage risk"],
    },
    {
        "keywords": ["sewage overflow"],
        "department": "Sanitation",
        "priority": "HIGH",
        "score": 80,
        "reasons": ["Sewage exposure creates a serious health risk"],
    },
]


def classify_and_prioritize(text: str) -> dict:
    """
    One Gemini call to classify the issue and assign a priority + score together.
    The response must be valid JSON with exactly the required shape.
    """
    normalized = text.lower()
    for issue in COMMON_ISSUES:
        if any(keyword in normalized for keyword in issue["keywords"]):
            return {
                "department": issue["department"],
                "priority": issue["priority"],
                "score": issue["score"],
                "reasons": issue["reasons"],
            }

    prompt = f"""
You are a civic grievance classifier.
The complaint may be written in English, Hindi, or Marathi. Understand it
directly without translating or changing the citizen's stored complaint text.
Classify the complaint into exactly one department from:
["Water","Roads","Electricity","Sanitation","Public Safety","Health"]
Assign a priority from:
["CRITICAL","HIGH","MEDIUM","LOW"]
Assign a score from 0 to 100.
Return valid JSON only, with no markdown fences and no extra explanation.
Use this exact JSON shape:
{{
  "department": "Water",
  "priority": "HIGH",
  "score": 72,
  "reasons": ["short reason", "short reason"]
}}

Consider these factors when scoring:
- public safety risk
- infrastructure failure
- number of people affected
- health risk

Complaint text:
{text}
"""

    try:
        # One Gemini API call for both classification and priority.
        response = model.generate_content(prompt, request_options={"timeout": 30})

        # Gemini may return fenced JSON like ```json ... ```; remove it before parsing.
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()

        # Attempt to parse the cleaned text as JSON.
        data = json.loads(raw_text)

        # Ensure the result has the required keys and valid values.
        if not isinstance(data, dict):
            raise ValueError("Gemini response was not a JSON object.")

        required = ["department", "priority", "score", "reasons"]
        for key in required:
            if key not in data:
                raise ValueError(f"Missing required key: {key}")

        # Coerce numeric score to int and clamp it to the required 0-100 range.
        data["score"] = int(data["score"])
        if data["score"] < 0:
            data["score"] = 0
        if data["score"] > 100:
            data["score"] = 100

        # Ensure reasons is a list of short strings.
        if not isinstance(data["reasons"], list):
            data["reasons"] = ["Auto-classified complaint"]

        return {
            "department": data["department"],
            "priority": data["priority"],
            "score": data["score"],
            "reasons": data["reasons"],
        }
    except Exception:
        # Safe fallback so the app never crashes if Gemini output is malformed.
        return {
            "department": "Public Safety",
            "priority": "MEDIUM",
            "score": 50,
            "reasons": ["Auto-fallback classification"],
        }


def embed(text: str) -> list:
    """
    Create a text embedding using Gemini gemini-embedding-001.
    This returns an embedding vector as a list of floats.
    """
    result = genai.embed_content(
        model="models/gemini-embedding-001",
        content=text,
        request_options={"timeout": 30},
    )
    return result["embedding"]


def cosine(a, b) -> float:
    """Compute cosine similarity between two vectors using NumPy."""
    a_arr = np.asarray(a, dtype=float)
    b_arr = np.asarray(b, dtype=float)
    dot = float(np.dot(a_arr, b_arr))
    norm_a = float(np.linalg.norm(a_arr))
    norm_b = float(np.linalg.norm(b_arr))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def distance_metres(lat1, lng1, lat2, lng2):
    """Calculate straight-line distance between two coordinates."""
    earth_radius = 6371000
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    lat_delta = math.radians(lat2 - lat1)
    lng_delta = math.radians(lng2 - lng1)
    value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(lng_delta / 2) ** 2
    )
    return earth_radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def find_duplicate(new_vec, stored, lat, lng, threshold=0.85, radius_metres=500):
    """
    Compare the new vector against previously stored complaint embeddings.
    This runs locally with zero API cost.
    """
    if not stored:
        return (None, 0)

    best_id = None
    best_sim = 0.0

    if lat is None or lng is None:
        return (None, 0)

    for complaint_id, vec, stored_lat, stored_lng in stored:
        if stored_lat is None or stored_lng is None:
            continue
        if distance_metres(lat, lng, stored_lat, stored_lng) > radius_metres:
            continue

        sim = cosine(new_vec, vec)
        if sim > best_sim:
            best_sim = sim
            best_id = complaint_id

    if best_id is not None and best_sim >= threshold:
        return (best_id, round(best_sim, 2))

    return (None, round(best_sim, 2))


if __name__ == "__main__":
    sample = "Water pipeline burst near a school causing severe flooding and health risk."
    result = classify_and_prioritize(sample)
    vector = embed(sample)
    print(result)
    print(len(vector))
