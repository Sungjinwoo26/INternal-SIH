import csv

import db
import ai


# Ensure the complaints table exists before inserting any seed rows.
db.init_db()

# Open the seed CSV file and read each complaint row as a dictionary.
with open("seed_data.csv", "r", encoding="utf-8") as file:
    reader = csv.DictReader(file)

    # Process each complaint one by one through the same AI pipeline as live submissions.
    for row in reader:
        # Read the complaint text and convert coordinates from CSV strings to floats.
        text = row["text"]
        lat = float(row["lat"])
        lng = float(row["lng"])

        # Classify the complaint and assign department, priority, score, and reasons.
        result = ai.classify_and_prioritize(text)

        # Create the embedding vector used for duplicate detection.
        vec = ai.embed(text)

        # Compare against already stored embeddings so duplicates link in insertion order.
        stored = db.get_embeddings()
        dup_id, _ = ai.find_duplicate(vec, stored)

        # Insert the complaint with all AI-generated fields and any detected duplicate link.
        db.insert_complaint(
            {
                "text": text,
                "lat": lat,
                "lng": lng,
                "department": result["department"],
                "priority": result["priority"],
                "score": result["score"],
                "reasons": result["reasons"],
                "embedding": vec,
                "duplicate_of": dup_id,
            }
        )

        # Print a short confirmation line for each seeded complaint.
        print(f"Seeded: {text[:40]}")

# Print a final completion message after all rows are inserted.
print("Done")

# Run this once with: python seed.py
# If the free Gemini tier returns a 429 rate-limit error, add a short time.sleep(1)
# between rows, but do not add it by default.
