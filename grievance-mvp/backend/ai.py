import json
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
model = genai.GenerativeModel("gemini-1.5-flash")


def classify_and_prioritize(text: str) -> dict:
    """
    One Gemini call to classify the issue and assign a priority + score together.
    The response must be valid JSON with exactly the required shape.
    """
    prompt = f"""
You are a civic grievance classifier.
Classify the complaint into exactly one department from:
["Water","Roads","Electricity","Sanitation","Public Safety","Health"]
Assign a priority from:
["CRITICAL","HIGH","MEDIUM","LOW"]
Assign a score from 0 to 100.
Return valid JSON only, with no markdown fences and no extra explanation.
Use this exact JSON shape:
{
  "department": "Water",
  "priority": "HIGH",
  "score": 72,
  "reasons": ["short reason", "short reason"]
}

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
        response = model.generate_content(prompt)

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
    Create a text embedding using Gemini text-embedding-004.
    This returns a 768-dim vector (list of floats).
    """
    result = genai.embed_content(model="models/text-embedding-004", content=text)
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


def find_duplicate(new_vec, stored, threshold=0.85):
    """
    Compare the new vector against previously stored complaint embeddings.
    This runs locally with zero API cost.
    """
    if not stored:
        return (None, 0)

    best_id = None
    best_sim = 0.0

    for complaint_id, vec in stored:
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
