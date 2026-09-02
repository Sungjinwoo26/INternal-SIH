import json
import math
import os
import re

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
        "type": "gas_leak",
        "keywords": ["gas leak", "smell of gas", "गैस रिसाव", "गॅस गळती"],
        "department": "Public Safety",
        "score": 98,
        "reasons": ["Immediate fire and public safety risk"],
    },
    {
        "type": "pipeline_burst",
        "keywords": ["pipeline burst", "water pipe burst", "road flooding"],
        "department": "Water",
        "score": 92,
        "reasons": ["Major infrastructure failure", "Flooding safety risk"],
    },
    {
        "type": "live_wire",
        "keywords": ["live wire", "hanging wire", "electric wire exposed", "exposed wire"],
        "department": "Electricity",
        "score": 95,
        "reasons": ["Immediate electrocution risk"],
    },
    {
        "type": "open_manhole",
        "keywords": ["open manhole", "uncovered manhole", "खुला मैनहोल"],
        "department": "Public Safety",
        "score": 95,
        "reasons": ["Immediate accident and injury risk"],
    },
    {
        "type": "fallen_tree",
        "keywords": ["tree fell", "fallen tree", "झाड पड", "पेड़ गिर"],
        "department": "Public Safety",
        "score": 88,
        "reasons": ["Immediate risk to people and property"],
    },
    {
        "type": "unsafe_building",
        "keywords": ["building collapse", "building may collapse", "large wall crack"],
        "department": "Public Safety",
        "score": 90,
        "reasons": ["Serious structural safety risk"],
    },
    {
        "type": "fire",
        "keywords": [
            "building on fire",
            "house on fire",
            "home on fire",
            "fire at my house",
            "fire at my home",
            "house is burning",
            "home is burning",
            "shop on fire",
            "electrical fire",
            "heavy smoke",
        ],
        "department": "Public Safety",
        "score": 98,
        "reasons": ["Immediate fire and life safety risk"],
    },
    {
        "type": "contaminated_water",
        "keywords": ["contaminated water", "dirty drinking water", "foul water supply"],
        "department": "Water",
        "score": 85,
        "reasons": ["Unsafe water creates a serious health risk"],
    },
    {
        "type": "no_water",
        "keywords": ["no water supply", "water supply stopped", "पानी नहीं", "पाणी नाही"],
        "department": "Water",
        "score": 70,
        "reasons": ["Essential water service interruption"],
    },
    {
        "type": "water_leak",
        "keywords": ["water leakage", "leaking water pipe", "tap leaking"],
        "department": "Water",
        "score": 55,
        "reasons": ["Water loss and possible property damage"],
    },
    {
        "type": "low_water_pressure",
        "keywords": ["low water pressure", "weak water supply"],
        "department": "Water",
        "score": 35,
        "reasons": ["Reduced water service quality"],
    },
    {
        "type": "power_outage",
        "keywords": ["no electricity", "power outage", "power cut", "बिजली नहीं", "वीज नाही"],
        "department": "Electricity",
        "score": 70,
        "reasons": ["Electricity service interruption"],
    },
    {
        "type": "transformer_fault",
        "keywords": ["transformer sparks", "transformer smoking", "transformer blast"],
        "department": "Electricity",
        "score": 90,
        "reasons": ["High-risk electrical equipment failure"],
    },
    {
        "type": "streetlight_out",
        "keywords": ["streetlight not working", "street light not working", "dark street"],
        "department": "Electricity",
        "score": 50,
        "reasons": ["Poor visibility creates a local safety risk"],
    },
    {
        "type": "pothole",
        "keywords": ["pothole", "road has a hole", "सड़क में गड्ढा", "रस्त्यावर खड्डा"],
        "department": "Roads",
        "score": 60,
        "reasons": ["Road safety and vehicle damage risk"],
    },
    {
        "type": "damaged_road",
        "keywords": ["road damaged", "broken road", "road surface damaged"],
        "department": "Roads",
        "score": 55,
        "reasons": ["Damaged road affects safe travel"],
    },
    {
        "type": "traffic_signal_fault",
        "keywords": ["traffic signal not working", "traffic light broken"],
        "department": "Public Safety",
        "score": 75,
        "reasons": ["Signal failure increases collision risk"],
    },
    {
        "type": "garbage_collection",
        "keywords": ["garbage not collected", "no garbage pickup", "uncollected garbage", "कचरा उचलला नाही"],
        "department": "Sanitation",
        "score": 55,
        "reasons": ["Waste accumulation and health risk"],
    },
    {
        "type": "illegal_dumping",
        "keywords": ["illegal dumping", "garbage dumped", "waste dumped"],
        "department": "Sanitation",
        "score": 60,
        "reasons": ["Dumped waste creates sanitation and access problems"],
    },
    {
        "type": "sewage_overflow",
        "keywords": ["sewage overflow", "sewer overflowing", "गटर ओवरफ्लो"],
        "department": "Sanitation",
        "score": 80,
        "reasons": ["Sewage exposure creates a serious health risk"],
    },
    {
        "type": "blocked_drain",
        "keywords": ["blocked drain", "clogged drain", "नाली बंद", "गटार तुंबले"],
        "department": "Sanitation",
        "score": 60,
        "reasons": ["Blocked drainage can cause flooding and stagnant water"],
    },
    {
        "type": "dead_animal",
        "keywords": ["dead animal", "animal carcass"],
        "department": "Sanitation",
        "score": 70,
        "reasons": ["Decomposition creates sanitation and disease risk"],
    },
    {
        "type": "mosquito_breeding",
        "keywords": ["mosquito breeding", "many mosquitoes", "stagnant water mosquitoes"],
        "department": "Health",
        "score": 75,
        "reasons": ["Mosquito breeding increases disease risk"],
    },
    {
        "type": "food_poisoning",
        "keywords": ["food poisoning", "people sick after eating", "unsafe food"],
        "department": "Health",
        "score": 90,
        "reasons": ["Possible foodborne illness requires urgent attention"],
    },
    {
        "type": "aggressive_stray_animal",
        "keywords": ["aggressive stray dog", "stray dog attack", "dog biting people"],
        "department": "Public Safety",
        "score": 75,
        "reasons": ["Immediate bite and public safety risk"],
    },
]

DANGER_TERMS = ["dangerous", "flooding", "accident", "life threatening"]
SENSITIVE_PLACE_TERMS = ["school", "hospital", "crowded market", "market"]
PROLONGED_TERMS = ["several days", "many days", "for days", "for a week"]
DUPLICATE_PRIORITY_BONUS = 1


def priority_for_score(score):
    if score >= 85:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def match_common_issue(text):
    """Return a confident catalog match, or None when Gemini is needed."""
    normalized = text.lower()
    for issue in COMMON_ISSUES:
        if any(keyword in normalized for keyword in issue["keywords"]):
            return issue
    return None


def apply_local_adjustments(text, base_score, reasons):
    normalized = text.lower()
    score = base_score
    adjusted_reasons = list(reasons)

    if any(term in normalized for term in DANGER_TERMS):
        score += 15
        adjusted_reasons.append("Danger or accident language increases urgency")
    if any(term in normalized for term in SENSITIVE_PLACE_TERMS):
        score += 10
        adjusted_reasons.append("School, hospital, or crowded area may be affected")
    if any(term in normalized for term in PROLONGED_TERMS) or re.search(
        r"\bfor\s+\d+\s+days?\b", normalized
    ):
        score += 10
        adjusted_reasons.append("Issue has continued for several days")

    return min(score, 100), adjusted_reasons


def normalize_complainant_name(name):
    """Compare names loosely so minor spacing/casing differences do not matter."""
    if not name:
        return None
    normalized = " ".join(name.strip().lower().split())
    return normalized or None


def is_different_complainant(new_name, existing_name):
    """
    Duplicate clustering should reflect multiple residents reporting the same issue.
    Missing names cannot confidently prove a different complainant.
    """
    normalized_new = normalize_complainant_name(new_name)
    normalized_existing = normalize_complainant_name(existing_name)
    if normalized_new is None or normalized_existing is None:
        return False
    return normalized_new != normalized_existing


def boost_duplicate_priority(result):
    """Repeated nearby reports get a small urgency bump."""
    boosted_score = min(int(result["score"]) + DUPLICATE_PRIORITY_BONUS, 100)
    boosted_reasons = list(result["reasons"])
    boosted_reasons.append("Repeated nearby reports from different citizens")
    return {
        **result,
        "score": boosted_score,
        "priority": priority_for_score(boosted_score),
        "reasons": boosted_reasons,
    }


def classify_and_prioritize(text: str) -> dict:
    """
    Classify common issues locally, with one Gemini call only as the fallback.
    Gemini responses must be valid JSON with exactly the required shape.
    """
    issue = match_common_issue(text)
    if issue is not None:
        score, reasons = apply_local_adjustments(
            text, issue["score"], issue["reasons"]
        )
        return {
            "department": issue["department"],
            "priority": priority_for_score(score),
            "score": score,
            "reasons": reasons,
            "source": "local",
            "issue_type": issue["type"],
            "valid": True,
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
  "valid": true,
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

If the text is meaningless gibberish or does not describe an understandable
civic complaint, return "valid": false and use null for department, priority,
and score. Otherwise return "valid": true.
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

        if data.get("valid") is False:
            reasons = data.get("reasons")
            if not isinstance(reasons, list) or not reasons:
                reasons = ["Complaint does not describe a meaningful civic issue"]
            return {
                "department": None,
                "priority": None,
                "score": None,
                "reasons": reasons,
                "source": "gemini",
                "issue_type": None,
                "valid": False,
            }

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
            "source": "gemini",
            "issue_type": None,
            "valid": True,
        }
    except Exception:
        # Safe fallback so the app never crashes if Gemini output is malformed.
        return {
            "department": "Public Safety",
            "priority": "MEDIUM",
            "score": 50,
            "reasons": ["Auto-fallback classification"],
            "source": "fallback",
            "issue_type": None,
            "valid": True,
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


def find_local_duplicate(
    text, stored, lat, lng, complainant_name, radius_metres=500
):
    """Match the same catalog issue locally before requesting an embedding."""
    issue = match_common_issue(text)
    if issue is None or lat is None or lng is None:
        return (None, 0)

    closest_id = None
    closest_distance = None
    for (
        complaint_id,
        stored_text,
        stored_type,
        stored_lat,
        stored_lng,
        stored_name,
    ) in stored:
        if stored_lat is None or stored_lng is None:
            continue
        if not is_different_complainant(complainant_name, stored_name):
            continue

        candidate = match_common_issue(stored_text)
        candidate_type = stored_type or (candidate["type"] if candidate else None)
        if candidate_type != issue["type"]:
            continue

        distance = distance_metres(lat, lng, stored_lat, stored_lng)
        if distance <= radius_metres and (
            closest_distance is None or distance < closest_distance
        ):
            closest_id = complaint_id
            closest_distance = distance

    if closest_id is not None:
        return (closest_id, 1.0)
    return (None, 0)


def find_duplicate(
    new_vec,
    stored,
    lat,
    lng,
    complainant_name,
    threshold=0.85,
    radius_metres=500,
):
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

    for complaint_id, vec, stored_lat, stored_lng, stored_name in stored:
        if stored_lat is None or stored_lng is None:
            continue
        if not is_different_complainant(complainant_name, stored_name):
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
    print(result)
    if result["source"] != "local":
        vector = embed(sample)
        print(len(vector))
