# Disaster recovery

Every project, task, risk, cost and audit entry a company puts into Rectangle
lives in one PostgreSQL database. This document is the answer to the question
"what happens when that database is lost or damaged", and it exists because the
answer was previously nothing.

It covers two failures that are not the same and need different tools:

- **loss** — the volume or the service is gone;
- **damage** — the database is healthy and serving, but the data in it is
  wrong, because of an accidental `DROP TABLE`, a faulty migration, or a script
  that updated more rows than it should have.

Snapshots answer loss. Only point-in-time recovery answers damage, because
damage is usually noticed hours after it happened, and the last snapshot may
already contain it.

---

## 1. What is configured

| | |
|---|---|
| Platform | Railway, managed PostgreSQL |
| Mechanism | Point-in-Time Recovery (pgBackRest) |
| Archive destination | Railway storage bucket, `Postgres-PITR` |
| WAL archiving | continuous, `archive_timeout=60` |
| Base backups | full weekly, incremental daily |
| Retention | last 4 full backups — roughly 4 weeks |
| Granularity | any second inside the window |
| Worst-case data loss (RPO) | 60 seconds |
| Restore target | a **new** service; the live one is never touched |

Enabling it: Postgres service → **Backups** tab → **Enable PITR** → confirm.
Railway creates the bucket, sets the `WAL_ARCHIVE_*` variables, redeploys, and
takes the first base backup by itself. The datetime picker appears once
archiving is healthy.

**The window is not retroactive.** It begins at the first base backup after
enabling. Enabling PITR today does not let you restore to yesterday. This is the
single most important sentence in this document.

---

## 2. Restoring

1. Postgres service → **Backups** → PITR section.
2. Pick the target moment. For damage, pick **one minute before the damaging
   statement**, which the activity trail or the deploy log will date.
3. **Restore to this moment.**
4. Railway creates `<source>-restored-YYYYMMDD-HHMM` alongside the original,
   with its own empty volume, restores the newest base backup at or before the
   target, replays WAL forward to the target, and promotes.
5. Verify the fork before touching anything live — see §3.
6. Cut over by pointing `DATABASE_URL` at the fork, or by copying out only the
   rows that were damaged.

The original keeps serving traffic throughout. Nothing about a restore is
destructive, which means a restore may be run to *inspect* a past state without
any commitment to using it.

The fork is plain non-archiving Postgres. If it becomes the live database,
**enable PITR on it**, or the product silently returns to having no recovery.
That step is easy to forget precisely because everything appears to be working.

### If the whole Railway project is gone

PITR does not cover this: the archive bucket lives in the same account. Losing
the account loses both. An off-platform copy is the only defence, and is
recorded as an open decision in `_working_docs/AUDIT_AND_TODO.md` rather than
claimed here.

---

## 3. The restore drill

A backup nobody has restored is a belief, not a backup. Run this quarterly, and
after any change to the schema, the Postgres major version, or the plan.

1. Note the current time as `T`.
2. In the live product, create a project named `restore-drill-<date>`.
3. Wait two minutes, so a WAL segment is certainly archived — `archive_timeout`
   is 60 seconds.
4. Delete that project.
5. Restore to `T + 1 minute` following §2.
6. Connect to the fork and confirm the project **is present**, because that
   moment is before the deletion:

   ```sql
   select id, name, created_at from projects where name like 'restore-drill-%';
   ```

7. Confirm the row count of `projects`, `tasks`, `risks` and `audit_events` in
   the fork is within a plausible margin of the live database.
8. Confirm the fork's `select max(created_at) from audit_events` is at or
   before the target, and not far before it — far before means WAL replay did
   not reach the target and the restore should not be trusted.
9. Delete the fork.
10. Record the date, the target, the observed lag and who ran it in the table
    below.

A drill that is not written down did not happen.

| Date | Target | Outcome | Observed lag | Run by |
|---|---|---|---|---|
| _not yet run_ | | | | |

---

## 4. What is deliberately not automated

Cutting over to a restored database is manual, and should stay manual. Every
mechanism that automatically promotes a fork can also automatically promote the
wrong one, and the moment it would fire is the moment nobody is thinking
clearly. The recovery path is designed so a human confirms the data is right
before it becomes the data everyone uses.
