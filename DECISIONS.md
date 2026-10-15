# Architectural Decision Records (ADRs)

This document details every major engineering decision made in **CareCall**, following the required format:
**What I Chose**, **Why**, **Alternatives Rejected**, **How It Fails**, and **What I'd Change in Production**.

---

## 1. Concurrency & Double-Booking Protection: PostgreSQL GiST Exclusion Constraint

### What I Chose
PostgreSQL `btree_gist` extension with an exclusion constraint:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments ADD CONSTRAINT no_double_booking 
EXCLUDE USING gist (
  doctor_id WITH =, 
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status = 'booked');
```

### Why
Standard SQL `UNIQUE` constraints only evaluate exact scalar equality (`doctor_id = X AND starts_at = Y`). They cannot prevent partial overlapping time windows (e.g. 10:00-10:45 overlapping 10:30-11:00). 
The GiST range index with the `&&` overlap operator enforces mutual exclusion at the storage engine level. If two parallel booking requests arrive at the exact same millisecond, PostgreSQL's MVCC and lock manager serialize the transaction and immediately reject the second with SQLSTATE `23P01` (`exclusion_violation`).

### Alternatives Rejected
1. **Application-level SELECT followed by INSERT**: Subject to classic TOCTOU (Time-of-Check to Time-of-Use) race conditions under concurrent voice callers.
2. **Redis distributed locks (`Redlock`)**: Adds external infrastructure dependency, network latency (~10-50ms), and failure modes if locks expire prematurely while database commits are delayed.
3. **Database row locking (`SELECT FOR UPDATE`)**: Requires locking an artificial parent row (e.g., locking the doctor row), which serializes ALL bookings for that doctor across the entire calendar, destroying throughput for unrelated dates.

### How It Fails
If `starts_at` or `ends_at` are passed as naive timestamps without explicit UTC timezone awareness, daylight saving time or offset shifts could cause misaligned ranges. Furthermore, high concurrent contention on the same exact slot will cause `23P01` exceptions that the application layer must catch and translate into friendly alternative slot suggestions.

### What I'd Change in Production
Introduce an optimistic slot reservation lease (e.g. 90-second soft hold in Redis or an `appointments.status = 'pending_confirmation'` with an auto-expiring timer) so Maya can hold the slot while reading it back to the caller, preventing another caller from grabbing it during the 10-second speech confirmation turn.

---

## 2. Timezone Representation: Pure UTC Storage with Zoned Availability

### What I Chose
All database columns use `timestamptz` (stored strictly in UTC). The clinic's physical timezone (`Asia/Kolkata`, UTC+05:30) is stored in the `clinics` table and passed to `server/availability.ts`. Availability computation generates slots based on local clinic working hours, converts each slot to UTC boundaries, and generates voice-friendly spoken text (e.g., *"Thursday, October 15 at 10:00 AM"*).

### Why
Doctors think in clinic local time (09:00 AM IST), but servers run globally in UTC (e.g. Cloud Run, Supabase). Storing local timestamps without offsets leads to severe corruption across server migrations and DST transitions.

### Alternatives Rejected
1. **Storing naive `timestamp without time zone`**: Ambiguous; breaks if the database server timezone changes or if clients run across regions.
2. **Storing ISO strings in VARCHAR columns**: Destroys indexing efficiency, prevents PostgreSQL GiST range comparisons, and requires slow string parsing on every query.

### How It Fails
If the client or voice agent passes a date string like "2026-10-15T10:00:00" without the explicit `Z` or `+05:30` offset, the JavaScript `Date` parser might assume local system time, causing a 5.5 hour discrepancy.

### What I'd Change in Production
Enforce strict ISO-8601 UTC regex in Zod schemas (`z.string().datetime()`) at the API route boundary so any timestamp missing an explicit offset is rejected immediately.

---

## 3. Idempotency Keys in Voice Tool Calls

### What I Chose
Unique `idempotency_key` parameter in `POST /api/tools/book_appointment`. The repository checks if an appointment with that key already exists with status `booked`. If found, it safely returns the existing confirmation code with message: *"Your appointment is already confirmed under reference code APT-XXXX."*

### Why
Voice networks and LLM orchestrators (like Retell) frequently retry tool calls if an HTTP response exceeds a timeout threshold (e.g. 3000ms), or if the caller repeats their confirmation ("Yes! Yes, please!"). Without idempotency keys, Retell tool retries would hit the exclusion constraint and report `SLOT_TAKEN` to the caller, falsely making the user think their booking failed!

### Alternatives Rejected
1. **Deduplicating by (phone + doctor_id + starts_at)**: Causes false collisions if a patient legitimately wants to book back-to-back consultations or rebook after cancellation.
2. **Ignoring idempotency and letting the agent fail**: Leads to awful caller experience where the caller hears *"Sorry, that slot was taken"* when in fact their first attempt had actually succeeded.

### How It Fails
If Retell or the client fails to generate a unique turn ID and sends a static key (or leaves it undefined), idempotency protection falls back to atomic exclusion insertion.

### What I'd Change in Production
Mandate that Retell custom tool headers include `X-Retell-Call-Id` and `X-Turn-Id`, automatically hashing them on the server into the idempotency key if omitted by the agent LLM.

---

## 4. Single-Project Node/Express + Vite Architecture

### What I Chose
A unified TypeScript repository where Express (`server.ts`) mounts Vite development middlewares in dev (`vite.middlewares`), and serves the compiled SPA from `dist/` in production, on a single port (3000).

### Why
Retell AI requires a public HTTPS URL with reachable webhook and tool routes (`/api/tools/*`, `/api/webhooks/retell`). In Google AI Studio, a unified full-stack server exposes both the React admin dashboard and the webhook endpoints under a single public Cloud Run URL without requiring CORS proxies or multi-server orchestration.

### Alternatives Rejected
1. **Separate Frontend and Backend repositories**: Doubles deployment complexity, requires cross-origin cookie sharing, and complicates local testing during take-home evaluation.
2. **Next.js App Router**: Heavier cold starts in container environments; Vite SPA provides near-instant HMR, strict bundling, and simpler integration with WebSocket / Retell client SDKs.

### How It Fails
In a large production enterprise setting, frontend asset delivery is better served via a global CDN (Cloudflare / CloudFront) rather than having Node.js serve static files.

### What I'd Change in Production
Split static frontend hosting to Cloudflare Pages/S3 and run the Express API on Google Cloud Run or AWS ECS behind a unified API gateway.

---

## 5. Tool Response Formatting: Short, Voice-Friendly JSON

### What I Chose
Responses follow `{ ok: boolean, code: string, message: string, data?: any }` where `message` is a concise, natural sentence designed to be read aloud directly by the TTS engine (e.g., *"Your appointment with Dr. Rajesh Rao is confirmed! Your confirmation code is APT-7482."*).

### Why
Voice agents must maintain low turn latency. If tools return bloated database rows with 20 columns, the LLM takes hundreds of milliseconds to parse and summarize the JSON into speech, inflating latency and risking hallucinations. By providing a pre-crafted spoken `message`, the LLM can immediately stream the answer to the caller.

### Alternatives Rejected
1. **Raw Database Entity Dumps**: Inundates the LLM context window with internal UUIDs, created_at timestamps, and foreign keys that should never be spoken to a caller.
2. **Text-only endpoints**: Strips structured data (such as `alternativeSlots` or `confirmationCode`) that the dashboard UI and eval harness need for assertions.

### How It Fails
If the LLM ignores `message` and tries to interpret raw fields in `data`, voice output could become verbose.

### What I'd Change in Production
In the Retell agent prompt, explicitly instruct: *"Prefer reading the 'message' field returned by tools verbatim whenever possible."*

---

## 6. Evaluation Harness: Gemini Simulator + Gemini Judge

### What I Chose
A hybrid testing architecture where:
1. Deterministic assertions verify hard database state and tool execution invariants (required/forbidden tools, 0 double-bookings, status transitions).
2. Gemini 3.8 Flash acts as an LLM judge evaluating the qualitative clinical rubric (no medical advice, empathy, emergency triage).
3. Gemini acts as an autonomous caller persona with hidden constraints.
4. An isolated repository reset (`repository.resetToSeedData()`) runs before EVERY scenario.

### Why
Unit tests alone cannot evaluate conversational flow, prompt injection resistance, or empathy. Pure LLM evaluation without DB assertions is too forgiving and can overlook hallucinated state. Combining deterministic DB invariants with an LLM judge provides strict ground truth.

### Alternatives Rejected
1. **Manual voice calling for evals**: Unrepeatable, slow (takes hours for 18 scenarios), and impossible to run in automated CI pipelines.
2. **Single-turn regex matching**: Fails to capture multi-turn context (e.g. caller changing their mind or answering a clarification question).

### How It Fails
External LLM API latency can slow down test runs if all 18 scenarios run sequentially over network calls.

### What I'd Change in Production
Support parallel execution of independent scenarios (`Promise.all` across isolated worker databases) and cache caller simulation turns for deterministic regression benchmarks.
