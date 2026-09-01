import csv

import db
import ai


# Ensure the complaints table exists before inserting any seed rows.
db.init_db()

# Open the seed CSV file and read each complaint row as a dictionary.
with open("seed_data.csv", "r", encoding="utf-8") as file:
    reader = csv.DictReader(file)

    # Process each complaint one by one through the same AI pipeline as live submissions.
    for index, row in enumerate(reader, start=1):
        # Read the complaint text and convert coordinates from CSV strings to floats.
        text = row["text"]
        lat = float(row["lat"])
        lng = float(row["lng"])
        complainant_name = f"Seed User {index}"

        # Classify the complaint and assign department, priority, score, and reasons.
        result = ai.classify_and_prioritize(text)

        if result["source"] == "local":
            # Common issues use the fast local issue-type and distance check.
            stored = db.get_duplicate_candidates()
            dup_id, _ = ai.find_local_duplicate(
                text,
                stored,
                lat,
                lng,
                complainant_name,
            )
            vec = None
        else:
            # Unclear issues fall back to Gemini embeddings for semantic matching.
            vec = ai.embed(text)
            stored = db.get_embeddings()
            dup_id, _ = ai.find_duplicate(
                vec,
                stored,
                lat,
                lng,
                complainant_name,
            )

        if dup_id is not None:
            result = ai.boost_duplicate_priority(result)

        # Insert the complaint with all AI-generated fields and any detected duplicate link.
        db.insert_complaint(
            {
                "text": text,
                "complainant_name": complainant_name,
                "lat": lat,
                "lng": lng,
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

        # Print a short confirmation line for each seeded complaint.
        print(f"Seeded: {text[:40]}")

# Print a final completion message after all rows are inserted.
print("Done")

# Run this once with: python seed.py
# If the free Gemini tier returns a 429 rate-limit error, add a short time.sleep(1)
# between rows, but do not add it by default.
