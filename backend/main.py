import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


load_dotenv()


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("缺少 DATABASE_URL 环境变量，请先配置 Neon 数据库连接字符串。")

    if "sslmode=" not in database_url:
        separator = "&" if "?" in database_url else "?"
        database_url = f"{database_url}{separator}sslmode=require"

    return database_url


def get_conn():
    return psycopg.connect(get_database_url(), row_factory=dict_row)


def init_db():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS focus_records (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    event_name TEXT NOT NULL,
                    focus_minutes INTEGER NOT NULL,
                    focus_seconds INTEGER NOT NULL,
                    checkin_date DATE NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_focus_user_date
                ON focus_records(user_id, checkin_date);
                """
            )

        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Research Focus Clock API",
    description="科研专注时钟 API",
    version="0.1.0",
    lifespan=lifespan,
)


origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5500,http://localhost:5500",
)

origins = [item.strip() for item in origins_raw.split(",") if item.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CheckInCreate(BaseModel):
    user_id: str = Field(default="demo-user", min_length=1, max_length=100)
    event_name: str = Field(..., min_length=1, max_length=50)
    focus_minutes: int = Field(..., ge=1, le=240)
    focus_seconds: int = Field(..., ge=1, le=240 * 60)
    checkin_date: date


def to_date_string(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def build_stats(user_id: str, today: date):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT checkin_date
                FROM focus_records
                WHERE user_id = %s
                ORDER BY checkin_date ASC;
                """,
                (user_id,),
            )
            date_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_sessions,
                    COALESCE(SUM(focus_minutes), 0) AS total_minutes
                FROM focus_records
                WHERE user_id = %s;
                """,
                (user_id,),
            )
            total_row = cur.fetchone()

            cur.execute(
                """
                SELECT
                    COUNT(*) AS today_sessions,
                    COALESCE(SUM(focus_minutes), 0) AS today_minutes
                FROM focus_records
                WHERE user_id = %s AND checkin_date = %s;
                """,
                (user_id, today),
            )
            today_row = cur.fetchone()

    date_set = {to_date_string(row["checkin_date"]) for row in date_rows}
    today_str = today.isoformat()

    checked_today = today_str in date_set

    cursor = today if checked_today else today - timedelta(days=1)

    streak = 0
    while cursor.isoformat() in date_set:
        streak += 1
        cursor -= timedelta(days=1)

    recent_dates = sorted(date_set, reverse=True)[:30]

    return {
        "user_id": user_id,
        "checked_today": checked_today,
        "continuous_streak": streak,
        "total_checkin_days": len(date_set),
        "total_sessions": total_row["total_sessions"],
        "total_minutes": total_row["total_minutes"],
        "today_sessions": today_row["today_sessions"],
        "today_minutes": today_row["today_minutes"],
        "recent_dates": recent_dates,
    }


@app.get("/")
def root():
    return {
        "message": "Research Focus Clock API",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "Research Focus Clock API is running.",
    }


@app.post("/api/checkins")
def create_checkin(payload: CheckInCreate):
    now = datetime.now()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO focus_records (
                    user_id,
                    event_name,
                    focus_minutes,
                    focus_seconds,
                    checkin_date,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (
                    payload.user_id,
                    payload.event_name,
                    payload.focus_minutes,
                    payload.focus_seconds,
                    payload.checkin_date,
                    now,
                ),
            )
            record = cur.fetchone()

        conn.commit()

    stats = build_stats(payload.user_id, payload.checkin_date)

    return {
        "message": "打卡成功",
        "record_id": record["id"],
        "stats": stats,
    }


@app.get("/api/stats")
def get_stats(
    user_id: str = Query(default="demo-user"),
    today: date | None = Query(default=None),
):
    today_value = today or date.today()
    return build_stats(user_id, today_value)


@app.get("/api/day-records")
def get_day_records(
    user_id: str = Query(default="demo-user"),
    checkin_date: date | None = Query(default=None),
):
    target_date = checkin_date or date.today()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    event_name,
                    focus_minutes,
                    focus_seconds,
                    checkin_date,
                    created_at
                FROM focus_records
                WHERE user_id = %s AND checkin_date = %s
                ORDER BY created_at ASC;
                """,
                (user_id, target_date),
            )
            rows = cur.fetchall()

    records = []

    for row in rows:
        records.append(
            {
                "id": row["id"],
                "event_name": row["event_name"],
                "focus_minutes": row["focus_minutes"],
                "focus_seconds": row["focus_seconds"],
                "checkin_date": to_date_string(row["checkin_date"]),
                "created_at": row["created_at"].isoformat()
                if hasattr(row["created_at"], "isoformat")
                else str(row["created_at"]),
            }
        )

    total_minutes = sum(item["focus_minutes"] for item in records)
    total_seconds = sum(item["focus_seconds"] for item in records)

    return {
        "user_id": user_id,
        "date": target_date.isoformat(),
        "total_events": len(records),
        "total_minutes": total_minutes,
        "total_seconds": total_seconds,
        "records": records,
    }


@app.get("/api/records")
def get_records(
    user_id: str = Query(default="demo-user"),
    limit: int = Query(default=20, ge=1, le=100),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    event_name,
                    focus_minutes,
                    focus_seconds,
                    checkin_date,
                    created_at
                FROM focus_records
                WHERE user_id = %s
                ORDER BY checkin_date DESC, created_at DESC
                LIMIT %s;
                """,
                (user_id, limit),
            )
            rows = cur.fetchall()

    records = []

    for row in rows:
        records.append(
            {
                "id": row["id"],
                "event_name": row["event_name"],
                "focus_minutes": row["focus_minutes"],
                "focus_seconds": row["focus_seconds"],
                "checkin_date": to_date_string(row["checkin_date"]),
                "created_at": row["created_at"].isoformat()
                if hasattr(row["created_at"], "isoformat")
                else str(row["created_at"]),
            }
        )

    return {"records": records}