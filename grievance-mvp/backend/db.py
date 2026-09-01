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
                complainant_name TEXT,
                photo BLOB,
                lat REAL,
                lng REAL,
                address TEXT,
                department TEXT,
                priority TEXT,
                score INTEGER,
                reasons TEXT,
                embedding TEXT,
                duplicate_of INTEGER,
                status TEXT DEFAULT 'Open',
                estimated_resolution_days INTEGER,
                estimated_resolution_hours INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(complaints)")
        }
        if "address" not in columns:
            try:
                conn.execute("ALTER TABLE complaints ADD COLUMN address TEXT")
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error):
                    raise
        if "complainant_name" not in columns:
            try:
                conn.execute(
                    "ALTER TABLE complaints ADD COLUMN complainant_name TEXT"
                )
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error):
                    raise
        if "photo" not in columns:
            try:
                conn.execute("ALTER TABLE complaints ADD COLUMN photo BLOB")
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error):
                    raise
        if "estimated_resolution_days" not in columns:
            try:
                conn.execute(
                    "ALTER TABLE complaints ADD COLUMN estimated_resolution_days INTEGER"
                )
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error):
                    raise
        if "estimated_resolution_hours" not in columns:
            try:
                conn.execute(
                    "ALTER TABLE complaints ADD COLUMN estimated_resolution_hours INTEGER"
                )
            except sqlite3.OperationalError as error:
                if "duplicate column name" not in str(error):
                    raise
        conn.commit()
    finally:
        conn.close()


def insert_complaint(data: dict) -> int:
    reasons = data.get("reasons")
    embedding = data.get("embedding")

    payload = {
        "text": data["text"],
        "complainant_name": data.get("complainant_name"),
        "photo": data.get("photo"),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "address": data.get("address"),
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
                text, complainant_name, photo, lat, lng, address, department,
                priority, score, reasons, embedding, duplicate_of, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["text"],
                payload["complainant_name"],
                payload["photo"],
                payload["lat"],
                payload["lng"],
                payload["address"],
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
            """
            SELECT id, text, complainant_name, lat, lng, address, department,
                   priority, score, reasons, duplicate_of, status,
                   estimated_resolution_days, estimated_resolution_hours,
                   created_at,
                   CASE WHEN photo IS NULL THEN 0 ELSE 1 END AS has_photo
            FROM complaints
            ORDER BY score DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_one(cid):
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT id, text, complainant_name, lat, lng, address, department,
                   priority, score, reasons, duplicate_of, status,
                   estimated_resolution_days, estimated_resolution_hours,
                   created_at,
                   CASE WHEN photo IS NULL THEN 0 ELSE 1 END AS has_photo
            FROM complaints
            WHERE id = ?
            """,
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


def get_embeddings(exclude_id=None):
    conn = get_conn()
    try:
        if exclude_id is None:
            rows = conn.execute(
                """
                SELECT id, embedding, lat, lng
                FROM complaints
                WHERE embedding IS NOT NULL
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, embedding, lat, lng
                FROM complaints
                WHERE embedding IS NOT NULL AND id != ?
                """,
                (exclude_id,),
            ).fetchall()
        result = []
        for row in rows:
            result.append(
                (
                    row["id"],
                    json.loads(row["embedding"]),
                    row["lat"],
                    row["lng"],
                )
            )
        return result
    finally:
        conn.close()


def update_status(cid, status, estimated_days=None, estimated_hours=None):
    conn = get_conn()
    try:
        conn.execute(
            """
            UPDATE complaints
            SET status = ?, estimated_resolution_days = ?,
                estimated_resolution_hours = ?
            WHERE id = ?
            """,
            (status, estimated_days, estimated_hours, cid),
        )
        conn.commit()
    finally:
        conn.close()


def get_pending_complaints():
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT id, text, lat, lng FROM complaints
            WHERE department IS NULL OR priority IS NULL OR score IS NULL
               OR embedding IS NULL
            ORDER BY id
            """
        ).fetchall()
        return [dict(row) for row in rows]
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


def update_classification(cid, data):
    conn = get_conn()
    try:
        conn.execute(
            """
            UPDATE complaints
            SET department = ?, priority = ?, score = ?, reasons = ?
            WHERE id = ?
            """,
            (
                data["department"],
                data["priority"],
                data["score"],
                json.dumps(data["reasons"]),
                cid,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def update_embedding(cid, embedding, duplicate_of):
    conn = get_conn()
    try:
        conn.execute(
            """
            UPDATE complaints
            SET embedding = ?, duplicate_of = ?
            WHERE id = ?
            """,
            (json.dumps(embedding), duplicate_of, cid),
        )
        conn.commit()
    finally:
        conn.close()
