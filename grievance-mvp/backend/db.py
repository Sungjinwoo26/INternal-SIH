import json
import sqlite3

DB_NAME = "grievance.db"


def get_conn():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                lat REAL,
                lng REAL,
                department TEXT,
                priority TEXT,
                score INTEGER,
                reasons TEXT,
                embedding TEXT,
                duplicate_of INTEGER,
                status TEXT DEFAULT 'Open',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def insert_complaint(data: dict) -> int:
    reasons = data.get("reasons")
    embedding = data.get("embedding")

    payload = {
        "text": data["text"],
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "department": data.get("department"),
        "priority": data.get("priority"),
        "score": data.get("score"),
        "reasons": json.dumps(reasons) if reasons is not None else None,
        "embedding": json.dumps(embedding) if embedding is not None else None,
        "duplicate_of": data.get("duplicate_of"),
        "status": data.get("status", "Open"),
    }

    conn = get_conn()
    try:
        cursor = conn.execute(
            """
            INSERT INTO complaints (
                text, lat, lng, department, priority, score, reasons,
                embedding, duplicate_of, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["text"],
                payload["lat"],
                payload["lng"],
                payload["department"],
                payload["priority"],
                payload["score"],
                payload["reasons"],
                payload["embedding"],
                payload["duplicate_of"],
                payload["status"],
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_all():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM complaints ORDER BY score DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_one(cid):
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM complaints WHERE id = ?",
            (cid,),
        ).fetchone()
        if row is None:
            return None
        complaint = dict(row)
        if complaint["reasons"] is not None:
            complaint["reasons"] = json.loads(complaint["reasons"])
        return complaint
    finally:
        conn.close()


def get_embeddings():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, embedding FROM complaints WHERE embedding IS NOT NULL"
        ).fetchall()
        result = []
        for row in rows:
            result.append((row["id"], json.loads(row["embedding"])))
        return result
    finally:
        conn.close()


def update_status(cid, status):
    conn = get_conn()
    try:
        conn.execute(
            "UPDATE complaints SET status = ? WHERE id = ?",
            (status, cid),
        )
        conn.commit()
    finally:
        conn.close()


def update_analysis(cid, data):
    conn = get_conn()
    try:
        conn.execute(
            """
            UPDATE complaints
            SET department = ?, priority = ?, score = ?, reasons = ?,
                embedding = ?, duplicate_of = ?
            WHERE id = ?
            """,
            (
                data["department"],
                data["priority"],
                data["score"],
                json.dumps(data["reasons"]),
                json.dumps(data["embedding"]),
                data.get("duplicate_of"),
                cid,
            ),
        )
        conn.commit()
    finally:
        conn.close()
