# Traceability Refactor: Safe Deletion Path

## Scope
Legacy modules to retire after full migration:
- `processes`
- `subprocesses`
- `subprocess_techniques` assignment-centric flows

## Preconditions (must all be true)
1. `trace_stakeholders`, `trace_sessions`, `trace_evidences`, `trace_findings`, `trace_requirements`, `trace_requirement_findings` contain all active project data.
2. Product navigation no longer links to legacy routes in any primary user flow.
3. No frontend service calls to deprecated endpoints.
4. Deprecation logs show no requests for 30 consecutive days.

## Deletion Sequence
1. Remove frontend links and service calls to deprecated endpoints.
2. Remove backend deprecated route handlers.
3. Archive legacy SQL tables to backup schema.
4. Drop legacy tables in controlled migration.
5. Remove backup schema after retention window.

## Rollback
If migration issues appear:
1. Re-enable deprecated routes.
2. Restore legacy navigation toggles.
3. Replay backup data into legacy tables.
