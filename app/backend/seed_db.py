"""Create and seed the youth_unemployment SQLite database.

Generates realistic Eurostat-style youth (<25) unemployment rates for EU
member states plus the EU27 and Euro-area aggregates, 2010-2023.

If the user uploads their own .db file, replace the file at SQLITE_DB_PATH and
this script does not need to run again.
"""
import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DB_PATH = os.environ["SQLITE_DB_PATH"]

# (entity, code, is_aggregate, base_rate_2010, annual_trend)
# trend is a rough yearly delta; a post-2013 recovery + 2020 covid bump is applied.
SERIES = [
    ("European Union - 27 countries", "EU27_2020", 1, 21.4, -0.55),
    ("Euro area - 20 countries", "EA20", 1, 21.1, -0.50),
    ("Spain", "ES", 0, 41.5, -1.1),
    ("Greece", "EL", 0, 33.0, -0.7),
    ("Italy", "IT", 0, 27.9, -0.4),
    ("France", "FR", 0, 22.9, -0.2),
    ("Portugal", "PT", 0, 28.2, -1.2),
    ("Sweden", "SE", 0, 24.8, -0.6),
    ("Belgium", "BE", 0, 22.4, -0.5),
    ("Poland", "PL", 0, 23.7, -1.3),
    ("Germany", "DE", 0, 9.8, -0.35),
    ("Netherlands", "NL", 0, 8.7, -0.15),
    ("Austria", "AT", 0, 9.5, -0.1),
    ("Ireland", "IE", 0, 27.6, -1.4),
    ("Finland", "FI", 0, 21.4, -0.3),
    ("Denmark", "DK", 0, 14.0, -0.4),
    ("Czechia", "CZ", 0, 18.3, -1.0),
    ("Hungary", "HU", 0, 26.4, -1.5),
    ("Romania", "RO", 0, 22.1, -0.4),
    ("Croatia", "HR", 0, 32.6, -1.8),
]

YEARS = list(range(2010, 2024))


def rate_for(base, trend, year):
    y = year - 2010
    val = base + trend * y
    # 2012-2013 euro-crisis peak bump for higher-unemployment economies
    if year in (2012, 2013) and base > 20:
        val += 3.0 if year == 2013 else 1.8
    # 2020 covid bump
    if year == 2020:
        val += 2.6
    if year == 2021:
        val += 1.0
    return round(max(4.5, val), 1)


def main():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE "youth_unemployment" (
            "entity" TEXT,
            "country_code" TEXT,
            "year" INTEGER,
            "youth_unemployment_rate" REAL,
            "is_eu_aggregate" INTEGER
        )
        """
    )
    cur.execute(
        "CREATE INDEX idx_country_year ON youth_unemployment(country_code, year)"
    )

    rows = []
    for entity, code, agg, base, trend in SERIES:
        for year in YEARS:
            rows.append((entity, code, year, rate_for(base, trend, year), agg))

    cur.executemany(
        "INSERT INTO youth_unemployment VALUES (?, ?, ?, ?, ?)", rows
    )
    conn.commit()
    print(f"Seeded {len(rows)} rows into {DB_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
