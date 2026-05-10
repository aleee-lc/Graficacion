# Workspace Integration Audit

## Decision

`/projects/:id/workspace` is now the primary project experience. The old step pages remain available for compatibility, but the workspace owns the user-facing flow.

## Primary Runtime Flow

Project context -> stakeholders/users -> processes -> techniques -> evidences -> findings -> requirements -> traceability -> AI drafts.

The backend source of truth remains the traceability core:

- `trace_sessions` for discovery techniques.
- `trace_evidences` for notes, transcripts, files and stored artifacts.
- `trace_findings` for analyzed facts/needs/problems.
- `trace_requirements` and `trace_requirement_findings` for requirement coverage.
- `trace_ai_draft_findings` and `trace_ai_draft_requirements` for reviewed AI output.

## Keep

- `project-workspace`: primary UI and orchestration layer.
- `traceability.service`: core frontend integration for stakeholders, sessions, evidences, findings, requirements, traceability and AI.
- `projects.service`: project context and project users.
- `processes.service`: process list/create until a richer process model is migrated into traceability.

## Legacy / Compatibility

- `flow-project`, `flow-sessions`, `flow-findings`, `flow-requirements`, `flow-traceability`: kept as compatibility screens for the original formal flow.
- `project`: kept at `/projects/:id/legacy`.
- `processes`, `subprocesses`, `techniques`: legacy screens backed by deprecated endpoints. Backend already emits deprecation warnings for process/subprocess routes.

## Navigation

- Home project cards open `/projects/:id/workspace`.
- `/projects/:id` redirects to `/projects/:id/workspace`.
- The old context step is available at `/projects/:id/context-legacy`.

## Phase 1 Boundaries

No migrations were added. Technique-specific UI continues to use `trace_sessions` with a technique discriminator. This keeps existing data compatible while making the workspace the professional top-level experience.

