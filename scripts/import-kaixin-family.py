#!/usr/bin/env python3
"""Import an explicitly supplied private backup using a libpq service.

Requires psycopg 3. The configured PostgreSQL service must use sslmode=verify-full.
The connection and file contents are never printed.
"""
import argparse
import json
import sys
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backup", type=Path)
    parser.add_argument("--service", required=True)
    parser.add_argument("--parent-id", required=True, type=uuid.UUID)
    parser.add_argument("--apply", action="store_true", help="Commit after verification. Default rolls back.")
    args = parser.parse_args()

    payload = json.loads(args.backup.read_bytes())
    if not isinstance(payload, dict) or not isinstance(payload.get("homework"), list):
        raise ValueError("invalid_backup_shape")
    ids = set()
    for task in payload["homework"]:
        task_id = task.get("id") if isinstance(task, dict) else None
        if not isinstance(task_id, str) or not 1 <= len(task_id) <= 128 or task_id in ids:
            raise ValueError("invalid_or_duplicate_homework_id")
        ids.add(task_id)

    import psycopg
    from psycopg.types.json import Jsonb

    with psycopg.connect(service=args.service, sslmode="verify-full", connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute("set local lock_timeout = '5s'")
            cur.execute("set local statement_timeout = '30s'")
            cur.execute(
                "select exists (select 1 from auth.users "
                "where id = %s and email_confirmed_at is not null and not is_anonymous)",
                (args.parent_id,),
            )
            if not cur.fetchone()[0]:
                raise ValueError("verified_parent_missing")
            cur.execute(
                "insert into kaixin_private.production_state(singleton, payload) values (true, %s) "
                "on conflict (singleton) do nothing",
                (Jsonb(payload),),
            )
            cur.execute(
                "select payload = %s, revision from kaixin_private.production_state "
                "where singleton for update",
                (Jsonb(payload),),
            )
            if cur.fetchone() != (True, 0):
                raise ValueError("existing_state_differs_or_has_live_edits")
            cur.execute(
                "insert into kaixin_private.production_members (user_id, role) values (%s, 'parent') "
                "on conflict (user_id) do nothing",
                (args.parent_id,),
            )
            cur.execute(
                "select role from kaixin_private.production_members where user_id = %s for share",
                (args.parent_id,),
            )
            if cur.fetchone() != ("parent",):
                raise ValueError("parent_role_conflict")
        if not args.apply:
            conn.rollback()
    print(f"{'Committed' if args.apply else 'Verified and rolled back'}: {len(ids)} homework records")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Import stopped ({type(exc).__name__}). Transaction rolled back if still open.", file=sys.stderr)
        sys.exit(1)
