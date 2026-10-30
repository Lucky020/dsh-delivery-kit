#!/usr/bin/env python3
"""读取数据库结构（表名/字段/类型/注释），输出 JSON。

支持 PostgreSQL 与 MySQL；只读 information_schema，不做任何写操作。
"""
import argparse
import json
import sys


def read_postgres(dsn_args):
    import psycopg2

    conn = psycopg2.connect(
        host=dsn_args["host"], port=dsn_args.get("port", 5432),
        user=dsn_args["user"], password=dsn_args.get("password", ""),
        dbname=dsn_args["database"], connect_timeout=8,
    )
    schema = dsn_args.get("schema") or "public"
    out = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.relname, obj_description(c.oid, 'pg_class')
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = %s AND c.relkind = 'r'
            ORDER BY c.relname
            """,
            (schema,),
        )
        tables = cur.fetchall()
        for name, comment in tables:
            cur.execute(
                """
                SELECT a.attname,
                       format_type(a.atttypid, a.atttypmod),
                       a.attnotnull,
                       pg_get_expr(d.adbin, d.adrelid),
                       col_description(a.attrelid, a.attnum)
                FROM pg_attribute a
                LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped
                ORDER BY a.attnum
                """,
                (f"{schema}.{name}",),
            )
            fields = [
                {"name": f[0], "type": f[1], "nullable": not f[2], "default": f[3], "comment": f[4] or ""}
                for f in cur.fetchall()
            ]
            out.append({"name": name, "comment": comment or "", "fields": fields})
    conn.close()
    return out


def read_mysql(dsn_args):
    import pymysql

    conn = pymysql.connect(
        host=dsn_args["host"], port=int(dsn_args.get("port", 3306)),
        user=dsn_args["user"], password=dsn_args.get("password", ""),
        database=dsn_args["database"], connect_timeout=8, charset="utf8mb4",
    )
    out = []
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME
            """,
            (dsn_args["database"],),
        )
        for name, comment in cur.fetchall():
            cur.execute(
                """
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                ORDER BY ORDINAL_POSITION
                """,
                (dsn_args["database"], name),
            )
            fields = [
                {"name": f[0], "type": f[1], "nullable": f[2] == "YES", "default": f[3], "comment": f[4] or ""}
                for f in cur.fetchall()
            ]
            out.append({"name": name, "comment": comment or "", "fields": fields})
    conn.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", default="postgres")
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", type=int)
    ap.add_argument("--user", required=True)
    ap.add_argument("--password", default="")
    ap.add_argument("--database", required=True)
    ap.add_argument("--schema", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    dsn = vars(args)
    try:
        tables = read_postgres(dsn) if args.type == "postgres" else read_mysql(dsn)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False))
        sys.exit(1)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"tables": tables}, f, ensure_ascii=False, indent=1)
    print(json.dumps({"ok": True, "tables": len(tables)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
