## ADDED Requirements

### Requirement: Local mirror persists OFF subset by region

The system SHALL maintain a local Postgres `external_food_catalog` table mirroring the Open Food Facts catalog subset relevant for the deployed organisations' regions, refreshed periodically.

#### Scenario: Initial sync populates the mirror
- **WHEN** the M2 deployment runs the initial sync for region "ES"
- **THEN** the table contains the ES OFF subset (~200k rows expected) with macro, allergen, brand, and license-attribution columns populated

#### Scenario: Weekly cron refreshes incrementally
- **WHEN** the weekly cron triggers with cursor at the previous `lastSyncAt`
- **THEN** the worker pulls only OFF rows with `last_modified_t > lastSyncAt`, upserts them, and advances the cursor

### Requirement: Search by barcode, name, or brand resolves from the mirror first

The system SHALL serve barcode / name / brand searches from the local mirror first; on cache miss, fall through to the OFF REST API and persist on first hit.

#### Scenario: Cache hit returns fast
- **WHEN** a search by barcode "8410173005111" matches a local row
- **THEN** the result returns from Postgres in <50ms with no external network call

#### Scenario: Cache miss falls through to OFF API
- **WHEN** a search by barcode is not in the local mirror
- **THEN** the service queries the OFF REST API; on success, persists the row and returns it; on subsequent identical queries, the local row serves

#### Scenario: OFF API outage degrades gracefully
- **WHEN** the OFF API returns 5xx or times out for a cache-miss query
- **THEN** the service returns "not found" with a soft warning logged; no 5xx propagated to the caller

### Requirement: Health-check exposes sync freshness

The system SHALL expose `/health/external-catalog` returning `lastSyncAt`, total row count, and a freshness flag (`stale=true` if `lastSyncAt > 14 days`).

#### Scenario: Healthy state
- **WHEN** the last successful sync was 3 days ago
- **THEN** `/health/external-catalog` returns `{lastSyncAt, rowCount, stale: false}`

#### Scenario: Stale alert
- **WHEN** the last successful sync was 15 days ago (cron silent failure)
- **THEN** the endpoint returns `{lastSyncAt, rowCount, stale: true}` so monitoring can alert

### Requirement: Admin force-refresh endpoint

The system SHALL expose `POST /external-catalog/sync` (Owner+ role) that triggers an immediate sync run.

#### Scenario: Owner triggers manual sync
- **WHEN** an Owner posts to `/external-catalog/sync`
- **THEN** the worker runs the sync inline (or schedules an immediate background run) and returns 202 Accepted with a job id; on success the cursor advances; failures are logged + returned

#### Scenario: Non-Owner is rejected
- **WHEN** a Manager (not Owner) posts to the same endpoint
- **THEN** the system returns 403 Forbidden

### Requirement: ODbL attribution embedded in mirror rows

The system SHALL persist a `licenseAttribution` column on every `external_food_catalog` row carrying the ODbL attribution text required by Open Food Facts.

#### Scenario: Attribution is present on every row
- **WHEN** any row is read from `external_food_catalog`
- **THEN** the row carries a non-empty `licenseAttribution` string compliant with the ODbL terms; downstream UI consumers SHALL render it
