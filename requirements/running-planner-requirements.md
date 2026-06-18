# Running Planner App Requirements

**Document version:** 1.0  
**Date:** 2026-06-17  
**Working name:** Running Planner  
**Primary user:** Michael Creeth  
**Deployment target:** Self-hosted PWA + backend on Mac mini / Proxmox homelab  
**Primary integration:** Strava API

---

## 1. Product Summary

This app is a **planning-first layer on top of Strava**.

Strava is treated as the system of record for completed activities. This app is the system of record for **planned intent**: what the runner meant to do, why it was scheduled, how it fits into the training block, and how the week should adapt after reality diverges from the plan.

The core product loop is:

```text
Goal → Training block → Weekly plan → Planned workouts → Strava activity sync → Reconciliation → Adjustment
```

The app should answer questions Strava does not naturally answer:

- What was I supposed to do this week?
- Did I actually do what I planned?
- Did the week drift too hard, too long, or too unstructured?
- What should change because of what I actually did?
- Am I progressing toward the target race without ramping too aggressively?

---

## 2. Product Philosophy

### 2.1 Core Principle

The app should preserve the distinction between:

```text
planned training intent
vs.
completed activity data
```

A completed Strava run is not automatically “success.” It must be interpreted against the planned purpose.

Examples:

```text
Planned: 8 miles easy
Actual: 8.2 miles easy
Result: completed as intended

Planned: 8 miles easy
Actual: 10 miles with 25 minutes at threshold
Result: completed distance, violated intensity

Planned: 5×1k workout
Actual: 6 miles easy
Result: replaced workout

Planned: long run
Actual: no Strava activity
Result: missed, skipped, or moved
```

### 2.2 Product Positioning

This is not a Strava clone.

It should not try to replace:

- Strava social feed
- GPS recording
- Segment leaderboards
- Route discovery
- Public activity sharing

It should focus on the missing layer:

```text
training planning + reconciliation + intelligent adjustment
```

---

## 3. Deployment Assumptions

### 3.1 Homelab Topology

Target deployment:

```text
Internet / LAN / Tailscale
        ↓
Caddy LXC
        ↓
Docker host LXC
        ├── frontend container or static files
        ├── backend API container
        ├── worker container
        └── optional Redis container

Postgres LXC
        └── one database and one role for this app
```

Existing infrastructure assumptions:

- Proxmox running on Mac mini.
- Docker host runs inside an LXC.
- Caddy runs in its own LXC.
- Tailscale runs in its own LXC.
- Phone trusts the local Caddy certificate.
- App is intended primarily for personal use.
- Remote access is via Tailscale where possible.
- Uptime Kuma can monitor health endpoints.
- Backups can be written to NAS/NFS.

### 3.2 Public Reachability

The app itself can be private behind Tailscale.

However, Strava webhooks require Strava to reach a callback URL from outside the private network. Therefore the app must support one of two sync modes:

#### MVP Mode: Polling

The worker periodically polls Strava for recent activities.

This avoids exposing a public webhook endpoint.

#### Later Mode: Webhook + Public Callback

If webhooks are implemented, provide a small public endpoint through one of:

- VPS relay
- Cloudflare Tunnel
- Tailscale Funnel, if acceptable
- Public HTTPS endpoint on a restricted subdomain

The webhook handler must not expose the entire app publicly.

---

## 4. External API Constraints

The Strava integration must be designed around the current shape of the Strava API:

- Strava uses OAuth2.
- Access tokens expire and refresh tokens must be stored securely.
- API usage is rate-limited.
- The API is activity-centered.
- Webhooks notify on activity create/delete/update and athlete authorization revocation.
- Strava does not provide a native planned-workout calendar API suitable for making Strava the planning system of record.
- The app must own planned workouts locally.

### 4.1 Required OAuth Scopes

Initial MVP should request the minimum scopes needed:

```text
read
activity:read
activity:read_all
```

`activity:read_all` is needed if the user wants private activities included.

Do not request write/upload scopes unless a later feature explicitly needs them.

### 4.2 Rate Limit Behavior

The sync worker must be rate-limit aware.

Requirements:

- Store recent rate-limit headers when available.
- Avoid aggressive full-history syncs.
- Use incremental sync after initial backfill.
- Back off after failed requests.
- Expose sync status in the UI.
- Manual “sync now” must be throttled.

### 4.3 Raw Payload Preservation

For each imported Strava activity, store:

- Normalized fields used by the app.
- Raw Strava payload as JSONB.

This makes the app resilient to future schema needs without needing to re-fetch everything.

---

## 5. Suggested Technical Stack

This is a recommended stack, not a hard product requirement.

### 5.1 Frontend

Recommended:

```text
React + Vite + TypeScript
```

Alternative acceptable:

```text
SvelteKit + TypeScript
```

Frontend requirements:

- Installable PWA.
- Mobile-first layout.
- Desktop-friendly weekly planning view.
- No hard dependency on native iOS.
- Explicit frontend versioning.
- Minimal service worker caching.

### 5.2 Backend

Recommended:

```text
FastAPI + Python
```

Alternative acceptable:

```text
Node/Express/Fastify/Hono
```

Backend requirements:

- REST API.
- OpenAPI schema if using FastAPI.
- Clear separation between API, worker, and database.
- Background jobs for Strava sync and plan analysis.
- Structured logging.

### 5.3 Database

Recommended:

```text
Postgres
```

Database requirements:

- One database for the app.
- One least-privilege database role for the app.
- Migrations via Alembic, Prisma, Drizzle, or equivalent.
- Use foreign keys and constraints.
- Use JSONB for raw Strava payloads and flexible metadata.
- Nightly logical backup with `pg_dump`.

### 5.4 Worker

The worker is responsible for:

- Strava OAuth token refresh.
- Activity backfill.
- Incremental activity sync.
- Webhook processing, if enabled.
- Planned vs actual matching.
- Weekly summary recalculation.
- AI context generation and suggested plan adjustments.

Worker may run as:

- Separate container.
- Same image as API with a different command.

---

## 6. Core Domain Model

### 6.1 Entities

#### Athlete Account

Represents the local user and linked Strava account.

Fields:

```text
id
display_name
timezone
strava_athlete_id
created_at
updated_at
```

#### Strava OAuth Token

Stores Strava authorization data.

Fields:

```text
id
athlete_account_id
access_token_encrypted
refresh_token_encrypted
expires_at
scope
created_at
updated_at
last_refresh_at
revoked_at
```

Tokens must be encrypted at rest.

#### Goal Race

Represents a target race.

Fields:

```text
id
athlete_account_id
name
race_date
distance
target_time
target_pace
location
altitude_context
priority
notes
created_at
updated_at
```

Examples:

```text
Fall half marathon
Target: sub-1:25
Context: sea-level race
```

#### Training Block

Represents a phase of training.

Fields:

```text
id
athlete_account_id
goal_race_id nullable
name
start_date
end_date
phase
target_weekly_mileage_min
target_weekly_mileage_max
description
created_at
updated_at
```

Allowed phases:

```text
base
pre-block
specific
taper
race
recovery
maintenance
```

#### Training Week

Represents one Monday-Sunday or user-configured week.

Fields:

```text
id
training_block_id
week_start_date
week_end_date
planned_mileage
actual_mileage
planned_time
actual_time
target_long_run_distance
notes
created_at
updated_at
```

Week start day should be configurable, but default to Monday.

#### Planned Workout

The central planning object.

Fields:

```text
id
training_week_id
athlete_account_id
planned_date
title
sport
workout_type
intensity_category
planned_distance
planned_duration
planned_elevation
planned_tss nullable
purpose
instructions
notes
status
created_at
updated_at
```

Allowed sport values:

```text
run
strength
cross_training
rest
mobility
other
```

Allowed workout types:

```text
easy
recovery
long_run
medium_long
tempo
threshold
interval
hill
race
time_trial
progression
strides
strength
mobility
rest
other
```

Allowed intensity categories:

```text
rest
easy
moderate
workout
race
strength
```

Allowed status values:

```text
planned
completed_as_planned
completed_modified
missed
moved
replaced
skipped_intentionally
partial
```

#### Planned Workout Step

Supports structured workouts.

Fields:

```text
id
planned_workout_id
step_order
label
duration
distance
target_pace_min
target_pace_max
target_hr_min
target_hr_max
target_rpe
repetition_group nullable
notes
```

Examples:

```text
2 miles warmup
5 × 1k @ 10k effort, 2:00 jog
2 miles cooldown
```

```text
12 minutes threshold
3 minutes jog
10 minutes threshold
cooldown
```

#### Strava Activity

Represents imported completed activities.

Fields:

```text
id
strava_activity_id
athlete_account_id
name
sport_type
start_date
start_date_local
timezone
distance
moving_time
elapsed_time
total_elevation_gain
average_speed
max_speed
average_heartrate
max_heartrate
average_cadence
average_watts
perceived_exertion nullable
private
trainer
commute
manual
raw_payload_jsonb
created_at
updated_at
deleted_at nullable
```

#### Workout Match

Links planned workouts to Strava activities.

Fields:

```text
id
planned_workout_id
strava_activity_id
match_method
match_confidence
distance_delta
duration_delta
start_time_delta_minutes
assessment
notes
created_at
updated_at
```

Allowed match methods:

```text
automatic
manual
manual_override
```

Allowed assessment values:

```text
matched
short
long
too_hard
too_easy
wrong_type
replaced
partial
uncertain
```

#### Daily Check-In

Captures subjective training context.

Fields:

```text
id
athlete_account_id
date
sleep_quality
fatigue
soreness
motivation
stress
injury_flag
injury_notes
resting_hr nullable
hrv nullable
notes
created_at
updated_at
```

Subjective fields can be 1-5 scales.

Specific injury note support should make it easy to track:

- glute
- hamstring
- peroneal
- calf
- foot
- knee
- hip
- other

#### Shoe / Gear

Tracks shoe mileage.

Fields:

```text
id
athlete_account_id
name
brand
model
start_date
retired_date nullable
max_mileage_target
notes
created_at
updated_at
```

#### Activity Gear Assignment

Fields:

```text
id
strava_activity_id
shoe_id
assigned_manually
created_at
updated_at
```

#### Sync Job

Tracks Strava sync jobs.

Fields:

```text
id
athlete_account_id
job_type
status
started_at
finished_at
error_message
activities_fetched
activities_created
activities_updated
activities_deleted
rate_limit_remaining
metadata_jsonb
```

Allowed job types:

```text
initial_backfill
incremental_poll
manual_sync
webhook_event
token_refresh
```

Allowed statuses:

```text
queued
running
succeeded
failed
partial
cancelled
```

---

## 7. Functional Requirements

## 7.1 Planning Calendar

The app must provide a weekly planning board.

Default view:

```text
Mon | Tue | Wed | Thu | Fri | Sat | Sun
```

Each day should show:

- Planned workouts.
- Completed Strava activities matched to planned workouts.
- Unmatched activities.
- Daily mileage total.
- Daily intensity label.
- Check-in summary if present.

Required interactions:

- Create planned workout.
- Edit planned workout.
- Duplicate planned workout.
- Drag workout to another day.
- Mark as rest day.
- Add note to day.
- Add strength session.
- Move workout and preserve history.
- View planned vs actual for the day.

The weekly board must show:

- Planned mileage.
- Actual mileage.
- Planned time.
- Actual time.
- Number of hard days.
- Long run distance.
- Long run percentage of weekly volume.
- Rolling 7-day actual mileage.
- Rolling 28-day actual mileage.

## 7.2 Planned Workout Editor

The workout editor must support both simple and structured workouts.

Simple workout fields:

- Date.
- Title.
- Workout type.
- Planned distance.
- Planned duration.
- Intensity category.
- Purpose.
- Instructions.
- Notes.

Structured workout fields:

- Warmup.
- Repeating steps.
- Recoveries.
- Cooldown.
- Target pace range.
- Target HR range.
- Target RPE.
- Freeform notes.

The editor should allow saving a workout as a reusable template.

## 7.3 Workout Library

The app must support reusable planned workout templates.

Template examples:

```text
Easy 6
Medium-long 10
Long 14
5×1k @ 10k effort
2×12 min threshold
3 mi tempo
Hill sprints
Strides after easy run
Lower-body strength
```

Template fields:

```text
id
name
workout_type
default_distance
default_duration
default_steps
default_purpose
default_instructions
tags
created_at
updated_at
```

## 7.4 Training Block Builder

The app must support creating a training block.

Required inputs:

- Name.
- Start date.
- End date.
- Goal race optional.
- Phase.
- Target mileage range.
- Preferred hard workout days.
- Preferred long run day.
- Strength days.
- Down week frequency.
- Notes.

The block builder does not need to auto-generate a perfect plan in MVP, but it must create the structure that weeks and workouts attach to.

Later versions should support block templates:

- Half marathon base block.
- Half marathon specific block.
- Marathon base block.
- Maintenance block.
- Recovery block.

## 7.5 Strava OAuth

The app must allow connecting a Strava account.

Required behavior:

- Initiate OAuth flow.
- Handle callback.
- Store tokens encrypted.
- Store granted scopes.
- Show connection status.
- Refresh access token before expiration.
- Allow disconnecting Strava.
- Detect revoked authorization.
- Show clear error if required scopes are missing.

The app must not require Strava write/upload scopes for MVP.

## 7.6 Activity Backfill

After Strava connection, the app must support initial backfill.

MVP default:

```text
last 180 days
```

Configurable options:

```text
last 30 days
last 90 days
last 180 days
last 365 days
custom date range
```

Backfill requirements:

- Rate-limit aware.
- Idempotent.
- Safe to rerun.
- Stores raw payload.
- Normalizes key fields.
- Logs sync job result.
- Does not duplicate activities.

## 7.7 Incremental Sync

The app must import new Strava activities after initial backfill.

MVP:

- Poll periodically.
- Default polling interval: every 1-6 hours.
- Manual sync button available.

Later:

- Webhook ingestion.
- Polling remains as fallback.

Incremental sync requirements:

- Fetch activities after latest known activity date.
- Update activities if Strava fields changed.
- Mark activities deleted if deletion event received or detected.
- Re-run matching for newly imported activities.
- Recalculate affected week summaries.

## 7.8 Planned vs Actual Matching

The app must automatically match Strava activities to planned workouts.

Default matching algorithm:

1. Consider planned workouts within a configurable window around activity start time.
2. Default window: same local day plus adjacent overnight tolerance.
3. Prefer same sport type.
4. Prefer closest planned date/time.
5. Compare distance and duration.
6. Assign confidence score.
7. Auto-match only above confidence threshold.
8. Leave uncertain cases for manual review.

Suggested confidence factors:

```text
same local date
same sport
planned distance close to actual distance
planned duration close to actual duration
only one plausible planned workout that day
workout type compatible with actual effort
```

Manual matching requirements:

- User can match an activity to a planned workout.
- User can unmatch.
- User can override automatic match.
- User can mark a workout as replaced by an activity.
- User can mark an activity as unplanned.

## 7.9 Workout Reconciliation

After matching, the app must classify execution.

Required classifications:

```text
completed_as_planned
completed_modified
partial
short
long
too_hard
too_easy
wrong_type
replaced
missed
moved
skipped_intentionally
uncertain
```

MVP classification can be rule-based.

Example rules:

```text
Distance within ±10% and intensity compatible → completed_as_planned
Distance less than 75% of planned → short or partial
Easy planned but activity has workout-like pace/HR pattern → too_hard
Workout planned but easy run completed → replaced
No matching activity after 36 hours → missed or unresolved
```

User must be able to edit the classification.

## 7.10 Weekly Summary

The app must generate a weekly summary.

Required metrics:

- Planned mileage.
- Actual mileage.
- Planned time.
- Actual time.
- Mileage delta.
- Number of runs.
- Number of hard days.
- Longest run.
- Long run as percentage of weekly volume.
- Strength sessions planned.
- Strength sessions completed.
- Missed workouts.
- Modified workouts.
- Unplanned activities.
- Notes.
- Check-in trend.

Risk indicators:

- Actual mileage exceeds planned by configurable threshold.
- Long run is too large a percentage of week.
- Too many hard days.
- No recovery day.
- Rapid rolling mileage increase.
- Injury flag present.
- Workout completed too hard before another hard day.

## 7.11 Analytics

The app must provide lightweight training analytics.

MVP charts/tables:

- Weekly planned vs actual mileage.
- Rolling 7-day mileage.
- Rolling 28-day mileage.
- Workout completion rate.
- Easy/moderate/hard distribution.
- Long run trend.
- Missed/modified workouts over time.

Later analytics:

- Pace vs HR trend.
- Elevation load.
- Shoe mileage.
- Race-specific workout history.
- Threshold workout progression.
- Fatigue vs workload.
- Injury flag timeline.

## 7.12 Adaptive Planning

The app must provide an “adjust rest of week” feature.

Inputs:

- Current week plan.
- Completed activities.
- Missed or modified workouts.
- Daily check-ins.
- Goal race.
- Recent mileage.
- Recent hard days.
- Injury flags.
- User notes.

Outputs:

- Suggested changes to remaining workouts.
- Explanation for each change.
- Risk notes.
- User approval required before applying.

The AI or rule engine must never silently modify the plan.

Suggested change types:

```text
move workout
reduce volume
convert workout to easy run
add rest day
shorten long run
split tempo into intervals
preserve long run but remove secondary workout
```

The system should preserve training intent when possible.

Example:

```text
If Wednesday threshold was missed, suggest moving it to Thursday only if Friday/Saturday/Sunday structure still makes sense.
Otherwise convert it to a shorter steady run or skip it.
```

## 7.13 AI Planning Assistant

The AI assistant should operate as a planning advisor, not an autonomous coach.

Required behavior:

- Generate suggestions only from explicit context.
- Show reasoning in concise user-facing form.
- Preserve user control.
- Avoid aggressive ramping.
- Consider recent mileage and injury flags.
- Distinguish confidence levels.
- Allow accepting, rejecting, or editing suggestions.

AI functions:

```text
Generate next week draft
Adjust rest of current week
Explain why a week looks risky
Summarize last week
Compare planned vs actual
Suggest workout alternatives
```

AI context package should include:

- Goal race.
- Current training block.
- Last 4-8 weeks planned vs actual.
- Current week plan.
- Completed activities this week.
- Subjective check-ins.
- Injury notes.
- User preferences.
- Constraints entered by user.

AI must not require sending Strava raw payloads unless needed.

## 7.14 Notes and Subjective Check-Ins

The app must make it easy to capture subjective context.

Daily check-in fields:

```text
fatigue: 1-5
soreness: 1-5
sleep quality: 1-5
stress: 1-5
motivation: 1-5
injury flag: yes/no
injury notes: text
general notes: text
```

Workout-level notes:

- Before workout plan note.
- After workout reflection.
- RPE.
- Pain/injury notes.
- Weather/context note optional.

## 7.15 Strength Training

The app must support planned strength sessions.

MVP strength support:

- Add strength session to day.
- Mark complete manually.
- Add notes.
- Include in weekly summary.

Later strength support:

- Exercise library.
- Sets/reps/weight.
- Progress tracking.
- Link strength load to run planning.
- Track PT exercises.

Strength sessions should not require Strava matching, though imported Strava strength activities may be matched manually.

## 7.16 Race and Fitness Context

The app must support target race context.

Goal race fields:

- Race name.
- Race date.
- Distance.
- Target time.
- Target pace.
- Priority.
- Location.
- Altitude context.
- Notes.

The app should display:

- Weeks until race.
- Current block phase.
- Target pace.
- Key upcoming workouts.
- Taper timing.
- Recent mileage trend.

## 7.17 Import and Export

The app must support exporting user data.

MVP export:

- JSON export of all local app data.
- CSV export of planned workouts.
- CSV export of weekly summaries.

Later:

- ICS calendar export.
- Printable weekly plan.
- Markdown summary export.
- Backup restore UI.

## 7.18 Notifications

MVP does not require push notifications.

Later notification options:

- Reminder to review next week.
- Reminder to do daily check-in.
- Warning that workout is still unmatched.
- New Strava activity imported.
- New version available.

Because iOS PWA notification behavior may be constrained, notifications should be optional and not core to the app’s value.

---

## 8. PWA Requirements

## 8.1 Installability

The app must be installable to the iPhone home screen.

Required:

- Manifest file.
- App icon.
- Name and short name.
- Theme color.
- Responsive mobile layout.
- HTTPS.

## 8.2 Service Worker Strategy

The service worker must be intentionally minimal.

Cache:

- Versioned static assets.
- Icons.
- CSS.
- JS bundles.

Do not cache:

- API responses.
- User training data.
- Strava sync responses.
- Authentication responses.
- `/api/version`.

The app should behave primarily as:

```text
a web app that is installable
```

not as:

```text
a fully offline native replacement
```

## 8.3 Versioning and Update Behavior

The app must include explicit version handling to avoid stale iOS PWA behavior.

Required:

- Frontend build has a version/hash.
- Backend exposes `/api/version`.
- Frontend checks version on launch/resume.
- If frontend is stale, show “New version available. Reload required.”
- User can tap to reload.
- If API contract is incompatible, block unsafe actions until reload.

Recommended version endpoint response:

```json
{
  "frontendMinVersion": "1.0.0",
  "backendVersion": "1.0.0",
  "schemaVersion": "2026_06_17_001",
  "forceReload": false
}
```

## 8.4 Offline Behavior

MVP offline behavior can be limited.

When offline:

- App shell may load.
- Previously loaded week may remain visible if already in memory.
- Editing while offline is optional and not required.
- Strava sync is unavailable.
- AI planning is unavailable unless using a local backend reachable on LAN.

The UI must clearly show offline/unreachable state.

---

## 9. Security Requirements

## 9.1 Authentication

Because this is a personal homelab app, MVP authentication can be simple but must not be nonexistent if exposed beyond LAN.

Acceptable options:

- Tailscale-only access plus local app session.
- Single-user login.
- Reverse proxy auth.
- OAuth provider later.

Requirements:

- No unauthenticated access to personal training data.
- CSRF protection if cookie auth is used.
- Secure session cookies.
- HTTPS only.
- Local development exception allowed.

## 9.2 Secrets

Secrets must not be committed to git.

Required secrets:

- Strava client ID.
- Strava client secret.
- Token encryption key.
- Database password.
- Session secret.
- AI provider key, if using cloud AI.

Use:

```text
.env files outside git
Docker secrets
or Proxmox/LXC-level secret management
```

## 9.3 Token Storage

Strava tokens must be encrypted at rest.

Requirements:

- Encrypt access token.
- Encrypt refresh token.
- Store expiration time.
- Rotate access token via refresh token.
- Remove tokens on disconnect.
- Mark revoked tokens.
- Do not log tokens.

## 9.4 Data Privacy

The app contains sensitive personal training and health-adjacent data.

Requirements:

- Do not expose publicly except minimal webhook endpoint if needed.
- Do not send full raw activity history to AI by default.
- Let user inspect what context is sent to AI.
- Keep backups private.
- Avoid logging subjective health/injury notes unnecessarily.

---

## 10. API Requirements

## 10.1 Health and Version

```http
GET /healthz
GET /readyz
GET /api/version
```

`/healthz` checks process health.

`/readyz` checks database connectivity and required configuration.

`/api/version` returns frontend/backend/schema compatibility information.

## 10.2 Strava Auth

```http
GET  /api/auth/strava/start
GET  /api/auth/strava/callback
POST /api/auth/strava/disconnect
GET  /api/auth/strava/status
```

## 10.3 Sync

```http
POST /api/sync/strava/backfill
POST /api/sync/strava/incremental
GET  /api/sync/jobs
GET  /api/sync/jobs/{id}
```

## 10.4 Activities

```http
GET /api/activities
GET /api/activities/{id}
GET /api/activities/unmatched
PATCH /api/activities/{id}
```

## 10.5 Training Blocks

```http
GET    /api/training-blocks
POST   /api/training-blocks
GET    /api/training-blocks/{id}
PATCH  /api/training-blocks/{id}
DELETE /api/training-blocks/{id}
```

## 10.6 Weeks

```http
GET   /api/weeks
GET   /api/weeks/{weekStartDate}
PATCH /api/weeks/{id}
POST  /api/weeks/{id}/recalculate
```

## 10.7 Planned Workouts

```http
GET    /api/planned-workouts
POST   /api/planned-workouts
GET    /api/planned-workouts/{id}
PATCH  /api/planned-workouts/{id}
DELETE /api/planned-workouts/{id}
POST   /api/planned-workouts/{id}/move
POST   /api/planned-workouts/{id}/duplicate
```

## 10.8 Matching

```http
POST /api/matches/auto
POST /api/matches/manual
POST /api/matches/{id}/unmatch
PATCH /api/matches/{id}
GET  /api/matches/review
```

## 10.9 Check-Ins

```http
GET   /api/check-ins
POST  /api/check-ins
GET   /api/check-ins/{date}
PATCH /api/check-ins/{id}
```

## 10.10 AI Planning

```http
POST /api/ai/weekly-draft
POST /api/ai/adjust-week
POST /api/ai/explain-risk
POST /api/ai/summarize-week
```

AI endpoints must return suggested changes separately from applying changes.

Suggested response structure:

```json
{
  "summary": "The week is trending slightly hot.",
  "riskLevel": "moderate",
  "suggestions": [
    {
      "type": "modify_workout",
      "plannedWorkoutId": "uuid",
      "proposedChange": {
        "plannedDistance": 6,
        "intensityCategory": "easy"
      },
      "reason": "You already completed two hard efforts this week."
    }
  ],
  "requiresApproval": true
}
```

---

## 11. UI Requirements

## 11.1 Navigation

Primary navigation:

```text
Week
Plan
Activities
Analytics
Settings
```

Optional later:

```text
Gear
Library
Races
```

## 11.2 Week View

Week view is the home screen.

Must show:

- Current week by default.
- Previous/next week navigation.
- Each day’s planned workouts.
- Matched actuals.
- Unmatched actuals.
- Day totals.
- Weekly planned vs actual totals.
- Risk badges.

Day card examples:

```text
Tue
Workout
5×1k @ 10k effort
Planned: 8 mi
Actual: 8.1 mi
Status: matched
```

```text
Thu
Easy 7
Actual: 9.4 mi
Status: long / possible intensity drift
```

## 11.3 Workout Detail

Must show:

- Plan details.
- Structured workout steps.
- Purpose.
- Instructions.
- Matched Strava activity if any.
- Actual metrics.
- Difference between planned and actual.
- Notes.
- Match controls.

## 11.4 Activities View

Must show:

- Imported Strava activities.
- Sync status.
- Unmatched activities.
- Deleted/hidden state if relevant.
- Manual match action.

## 11.5 Analytics View

MVP analytics:

- Planned vs actual weekly mileage chart.
- Rolling mileage chart.
- Completion summary.
- Hard day count.
- Long run trend.
- Recent injury/check-in flags.

## 11.6 Settings View

Must show:

- Strava connection status.
- Sync settings.
- Week start day.
- Units.
- App version.
- Backend version.
- Database/schema version.
- Export data.
- Backup status if available.
- AI settings.
- PWA cache/version status.

---

## 12. Rules and Guardrails

## 12.1 Training Ramp Rules

The app should warn but not block.

Default warnings:

- Weekly actual mileage exceeds planned by more than 10%.
- Weekly actual mileage exceeds recent 4-week average by more than 15%.
- Long run exceeds 30% of weekly mileage.
- More than 2 hard running days in a week.
- Hard days are scheduled back-to-back.
- Injury flag plus hard workout planned.
- Workout added during down week.
- Planned week exceeds configured target range.

All thresholds should be configurable later.

## 12.2 Matching Rules

The app should avoid false confidence.

If multiple plausible planned workouts exist:

- Do not auto-match.
- Send to review queue.

If activity has unusual mismatch:

- Match with warning or leave unmatched depending on confidence.

## 12.3 AI Guardrails

The AI must:

- Never silently apply plan changes.
- Avoid increasing volume aggressively.
- Respect injury flags.
- Preserve race goal context.
- Explain tradeoffs.
- Prefer conservative modifications when uncertain.
- Be able to say “no change recommended.”

---

## 13. MVP Scope

The first usable version should include:

### Must Have

- PWA shell.
- Secure access through existing Caddy/Tailscale setup.
- Postgres database.
- Basic user/settings record.
- Strava OAuth.
- Last 180 days activity backfill.
- Manual sync.
- Weekly planning board.
- Create/edit/delete planned workouts.
- Drag or move workout to another day.
- Planned vs actual weekly mileage.
- Automatic activity matching.
- Manual match/unmatch.
- Workout status classification.
- Basic weekly summary.
- Minimal versioning system for PWA updates.
- `/healthz`, `/readyz`, and `/api/version`.
- JSON export.

### Should Have

- Workout templates.
- Structured workout steps.
- Daily check-ins.
- Injury notes.
- Sync job history.
- Unmatched activity review.
- Risk badges.
- CSV export.
- Basic AI “adjust rest of week” suggestions.

### Could Have

- Shoe tracking.
- Strength workout detail.
- ICS calendar export.
- Webhook-based Strava sync.
- More advanced analytics.
- Push notifications.
- Native wrapper later.

### Not MVP

- GPS recording.
- Strava activity upload.
- Social features.
- Public multi-user product.
- Apple Health integration.
- Garmin Connect integration.
- Fully offline editing.
- Complex coaching marketplace.
- Native iOS app.

---

## 14. Implementation Phases

## Phase 0: Infrastructure Skeleton

Deliverables:

- Repo structure.
- Docker Compose.
- API container.
- Frontend container or static build.
- Worker container.
- Postgres connection.
- Migrations.
- Health endpoints.
- Caddy route.
- Version endpoint.
- Basic auth/session.

Acceptance criteria:

- App loads from trusted HTTPS URL on iPhone.
- Backend responds through Caddy.
- Database migration runs cleanly.
- Uptime Kuma can monitor health endpoint.
- Version mismatch mechanism can be tested.

## Phase 1: Planning MVP

Deliverables:

- Week view.
- Planned workout CRUD.
- Training week model.
- Weekly planned mileage totals.
- Workout statuses.
- Basic workout templates.

Acceptance criteria:

- User can plan an entire week.
- User can move workouts between days.
- Weekly planned mileage updates instantly.
- Planned workouts persist in database.

## Phase 2: Strava Integration

Deliverables:

- Strava OAuth.
- Token storage.
- Activity backfill.
- Manual sync.
- Activity list.
- Raw payload storage.
- Sync job log.

Acceptance criteria:

- User can connect Strava.
- Last 180 days of activities import.
- Re-running sync does not duplicate data.
- Token refresh works.
- Sync failures are visible.

## Phase 3: Matching and Reconciliation

Deliverables:

- Auto-match engine.
- Manual match UI.
- Planned vs actual status.
- Weekly actual mileage.
- Unmatched activity review.
- Weekly summary.

Acceptance criteria:

- New Strava runs match to planned workouts when obvious.
- Ambiguous matches go to review.
- User can override matches.
- Weekly planned vs actual summary is accurate.

## Phase 4: Adaptive Planning

Deliverables:

- Daily check-ins.
- Risk badges.
- Rule-based adjustment suggestions.
- AI context package.
- AI adjust-week endpoint.
- Accept/reject suggested changes.

Acceptance criteria:

- App can explain why a week is risky.
- App can propose conservative changes to remaining workouts.
- No changes are applied without approval.
- Suggestions reference actual planned and completed workouts.

## Phase 5: Polish and Reliability

Deliverables:

- Backups.
- Export.
- Better mobile UI.
- Better charts.
- Settings screen.
- Optional webhooks.
- Optional shoe tracking.
- Optional calendar export.

Acceptance criteria:

- App can be restored from backup.
- App handles stale PWA frontend safely.
- Sync status is understandable.
- Core workflow feels faster than editing a spreadsheet.

---

## 15. Acceptance Tests

## 15.1 Planning

Given a blank week, when the user adds:

```text
Mon easy 6
Tue workout 8
Wed easy 5 + strength
Thu medium-long 10
Fri rest
Sat long 14
Sun easy 5
```

Then the app shows:

- 48 planned miles.
- 2 quality-ish days if medium-long is flagged moderate.
- 1 long run.
- 1 rest day.
- Strength session included.

## 15.2 Strava Sync

Given Strava is connected, when the user runs manual sync, then:

- New activities are imported.
- Existing activities are updated, not duplicated.
- Sync job status is recorded.
- Errors are visible.
- Rate limit state is stored if available.

## 15.3 Matching

Given a planned easy 6 on Monday and a Strava run of 6.1 miles Monday morning, then:

- The activity auto-matches.
- Status becomes completed_as_planned.
- Weekly actual mileage updates.

Given two planned runs on the same day, when one Strava activity imports, then:

- The app does not guess if confidence is low.
- The activity appears in match review.

## 15.4 Reconciliation

Given planned easy 8 and actual 10 miles with workout-like intensity, then:

- The app flags the workout as completed_modified or too_hard.
- The week risk summary updates.

## 15.5 PWA Versioning

Given the backend minimum frontend version increases, when the installed PWA launches with an old frontend, then:

- The app detects mismatch.
- The app blocks unsafe writes.
- The user sees a reload prompt.

## 15.6 AI Adjustment

Given the user misses a Wednesday workout and logs high fatigue, when they request “adjust rest of week,” then:

- The app proposes a conservative revised week.
- The app explains the change.
- The app does not apply changes until approved.

---

## 16. Data Backup Requirements

Minimum backup:

- Nightly `pg_dump`.
- Retain at least 7 daily backups.
- Retain at least 4 weekly backups.
- Store backup outside the app container.
- Prefer NAS/NFS backup target.
- Periodically test restore.

Backup file naming:

```text
running_planner_YYYY-MM-DD_HHMM.sql.gz
```

Restore documentation must exist in the repo.

---

## 17. Observability Requirements

The app must expose:

```http
GET /healthz
GET /readyz
```

The app should log:

- API startup.
- DB migration status.
- Strava sync job start/end.
- Token refresh success/failure.
- Webhook receipt if enabled.
- Matching job result.
- AI suggestion generation.
- Version mismatch events.

Logs must not include:

- Strava access token.
- Strava refresh token.
- Session secret.
- Full AI prompt if it includes sensitive notes, unless debug mode is explicitly enabled.

---

## 18. Repo Structure Recommendation

Suggested structure:

```text
running-planner/
  README.md
  docker-compose.yml
  .env.example

  frontend/
    src/
    public/
    package.json

  backend/
    app/
      api/
      core/
      db/
      models/
      schemas/
      services/
      workers/
    migrations/
    tests/
    pyproject.toml

  docs/
    architecture.md
    data-model.md
    strava-integration.md
    backup-restore.md
```

---

## 19. Environment Variables

Required:

```text
APP_ENV
APP_BASE_URL
DATABASE_URL
SESSION_SECRET
TOKEN_ENCRYPTION_KEY

STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_REDIRECT_URI

AI_PROVIDER
AI_API_KEY optional
```

Optional:

```text
REDIS_URL
WEBHOOK_PUBLIC_URL
BACKUP_TARGET_PATH
LOG_LEVEL
```

---

## 20. Open Design Decisions

These should be decided before implementation or during Phase 0.

1. Frontend framework: React/Vite vs SvelteKit.
2. Backend framework: FastAPI vs Node.
3. Whether Postgres lives in a dedicated LXC immediately.
4. Whether MVP uses polling only or includes webhook support.
5. Whether AI uses local model, cloud model, or both.
6. Whether authentication relies on Tailscale only or also local login.
7. Week starts Monday by default, but confirm configurability.
8. Whether strength workouts are simple notes or structured from v1.
9. Whether to support only running first or all Strava activities.
10. How much historical data to import by default.

---

## 21. Recommended Initial Decisions

For fastest path with low regret:

```text
Frontend: React + Vite + TypeScript
Backend: FastAPI + Python
Database: Postgres in dedicated LXC
Worker: separate backend container command
Sync: polling MVP, webhooks later
PWA: installable, minimal service worker
Auth: Tailscale/private access + app session
AI: cloud model initially, local later if desired
```

Reasoning:

- React/Vite is simple for a PWA.
- FastAPI is excellent for typed API work and background-friendly Python logic.
- Postgres is a strong fit for relational planning data plus JSONB raw Strava payloads.
- Polling avoids the immediate public webhook problem.
- Minimal service worker avoids iOS stale-cache pain.
- Keeping AI advisory-only reduces risk.

---

## 22. Definition of Done for MVP

The MVP is done when the user can:

1. Open the app from iPhone home screen.
2. Plan a full training week.
3. Connect Strava.
4. Import recent Strava runs.
5. See planned vs actual mileage.
6. See which planned workouts were completed, missed, changed, or unmatched.
7. Manually fix bad matches.
8. Review a weekly summary.
9. Receive a conservative suggestion for adjusting the remaining week.
10. Export the data.
11. Deploy a new version without the installed PWA silently running a stale incompatible frontend.

---

## 23. One-Sentence Build Target

Build a self-hosted, mobile-first running planner that treats Strava as the source of completed activity data while owning the training plan, matching completed runs to planned intent, and helping the runner adapt the week without losing sight of the goal race.
