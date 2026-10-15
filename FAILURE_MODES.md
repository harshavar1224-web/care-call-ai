# CareCall: Failure Modes & Mitigations Analysis

This document analyzes the 6 primary failure modes inherent to real-world medical voice booking agents, their concrete impacts, and the architectural mitigations implemented in **CareCall**. It concludes with 15 critical technical interview questions designed for the 2care live engineering assessment.

---

## 1. Primary Failure Modes & Mitigations

### 1. ASR (Automated Speech Recognition) Errors
- **The Failure**: Callers have heavy accents, background noise, or speak Indian phone numbers / codes with varying cadences (e.g., saying "double nine eight" instead of "nine nine eight", or mishearing "Dr. Rao" as "Dr. Roy").
- **Impact**: Failed patient lookups, wrong confirmation codes, or booking the wrong specialist.
- **Mitigations in CareCall**:
  - `agent/system-prompt.md`: Rule 4 mandates digit-by-digit pronunciation and slow readback.
  - `server/db/repository.ts`: Phone lookup strips spaces, hyphens, and compares clean suffixes (e.g. matching last 10 digits).
  - Explicit confirmation turn before booking: Maya never books until the caller explicitly confirms the read-back summary.
  - Generous specialty aliases in `server/availability.ts` and `tools.ts` (e.g. "skin doctor", "dermatologist", "skin specialist" all map to Dermatology).

---

### 2. Hallucinated Appointment Slots
- **The Failure**: An LLM agent invents a convenient appointment time out of thin air (e.g. telling the caller "Dr. Rao is free at 3:15 PM" when Dr. Rao only works 09:00 - 13:00).
- **Impact**: Patients arrive at the clinic when the doctor is not present, causing patient distress and clinic chaos.
- **Mitigations in CareCall**:
  - **Anti-Hallucination Law** in `agent/system-prompt.md`: Maya is strictly forbidden from offering any time that was not explicitly returned in the `slots` array of `check_availability`.
  - The availability engine (`server/availability.ts`) generates exact valid slots bounded by weekly schedules, subtracting leave exceptions and existing bookings.
  - Pre-formatted speech: The tool returns `humanText` ("Thursday, October 15 at 10:00 AM") directly in the JSON response so the LLM reads ground-truth strings.
  - Eval Harness assertion: Checks `no_hallucinated_slots` in all 18 test scenarios.

---

### 3. Tool Timeouts & High Latency
- **The Failure**: Database query latency or third-party API spikes cause a tool call to exceed Retell's 3-second timeout threshold.
- **Impact**: Awkward silence on the phone call, Retell repeating "Are you still there?", or dropped calls.
- **Mitigations in CareCall**:
  - Sub-50ms tool execution: Pure TypeScript schedule arithmetic in `server/availability.ts` evaluates availability in ~1.5ms without executing expensive table scans.
  - Targeted SQL indexes on `(doctor_id, starts_at)` and `(confirmation_code)` in `db/schema.sql`.
  - Audit logging (`tool_invocations`) records latency in milliseconds for every single execution, surfaced on the live dashboard.
  - Graceful voice timeout fallback in `agent/system-prompt.md`: *"I'm having a brief connection issue with our schedule. Let me take down your name and number, and our reception team will call you right back."*

---

### 4. Concurrent Double-Booking Race Condition
- **The Failure**: Two patients call simultaneously and both ask for Dr. Rajesh Rao's 10:00 AM slot. Both hear Maya say "Yes, 10:00 AM is free", and both agree at the same time.
- **Impact**: Two patients booked for the same physical doctor at the same minute.
- **Mitigations in CareCall**:
  - **PostgreSQL GiST Exclusion Constraint** in `db/schema.sql`:
    `EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) with &&) WHERE (status = 'booked')`
  - In-process transaction serialization lock (`acquireBookingLock`) in `server/db/repository.ts`.
  - When the second concurrent call attempts insertion, PostgreSQL raises SQLSTATE `23P01`.
  - The tool catches `23P01`, sets error code `SLOT_TAKEN`, automatically computes 3 immediate alternative slots, and sends: *"That time slot has just been taken by another patient. Would you like to book tomorrow at 11:30 AM or 2:00 PM instead?"*
  - Integration test `tests/concurrency.test.ts` validates that parallel calls yield exactly one success and one `SLOT_TAKEN`.

---

### 5. Webhook Retries & Idempotency
- **The Failure**: Retell retries a webhook or tool invocation if an HTTP network ACK drops, or the caller repeats their confirmation ("Yes! Yes, please!").
- **Impact**: Duplicate appointments created for the same patient, or false `SLOT_TAKEN` errors on retries.
- **Mitigations in CareCall**:
  - `idempotency_key` unique constraint in `db/schema.sql` and `server/db/repository.ts`.
  - If a booking with the same idempotency key already exists, the repository returns the existing booking safely (`isExistingIdempotent: true`) without creating a duplicate or throwing an error.
  - Webhooks in `server/routes/retell.ts` use `upsertCall` keyed on `retell_call_id`.

---

### 6. Timezone Calculation Errors
- **The Failure**: The server operates in UTC (or US Pacific in AI Studio), while the clinic is in India (`Asia/Kolkata`, UTC+05:30). A naive date comparison books 10:00 AM UTC (which is 03:30 PM in India), or offers past slots that already occurred earlier in the Indian morning.
- **Impact**: Massive 5.5 hour appointment scheduling offset; doctors and patients arrive at mismatched times.
- **Mitigations in CareCall**:
  - All database columns use `timestamptz` (stored strictly in UTC).
  - Availability calculations (`createUtcFromZoned` and `getZonedDateParts` in `server/availability.ts`) convert target dates to the clinic timezone (`Asia/Kolkata`) before computing doctor shift windows.
  - Vitest test `tests/availability.test.ts` specifically tests UTC to `Asia/Kolkata` conversion across day boundaries and past-time pruning.

---

## 2. 15 Technical Interview Questions & Files to Open

When discussing this codebase in your technical interview, open the corresponding files listed below:

| # | Question | File to Open | Key Technical Concept to Explain |
|---|:---|:---|:---|
| 1 | *Why use an exclusion constraint instead of a UNIQUE constraint or Redis lock?* | `db/schema.sql` (lines 75–85) | Explain `btree_gist`, range overlaps (`&&`), and why application-level checks suffer from TOCTOU race conditions. |
| 2 | *How do you prevent a caller from cancelling someone else's appointment?* | `server/db/repository.ts` (lines 620–645) | Verification requiring BOTH confirmation code and registered E.164 phone number (`PATIENT_NOT_VERIFIED`). |
| 3 | *How do you handle Indian timezone conversion between UTC and IST?* | `server/availability.ts` (lines 70–135) | `createUtcFromZoned`, calculating working hours in local calendar dates, and converting to UTC ISO boundaries. |
| 4 | *What happens if Retell retries a booking call due to network lag?* | `server/db/repository.ts` (lines 535–550) | `idempotency_key` lookup returning existing confirmed booking without firing the exclusion constraint. |
| 5 | *How do you prevent Maya from giving medical or prescription advice?* | `agent/system-prompt.md` (Section 6, Rule A) | Strict system prompt instruction + automated judge evaluation in `evals/scenarios/13_medical_advice_bait.yaml`. |
| 6 | *What is the exact escalation protocol for life-threatening symptoms?* | `agent/system-prompt.md` (Section 6, Rule B) | Immediate turn interruption, zero appointment booking, instruction to dial 112 or visit emergency room. |
| 7 | *How do you prove that your evaluation harness actually catches failures?* | `tests/eval_harness.test.ts` (lines 20–48) | Deliberately broken fake agent prescribing antibiotics and failing the harness rubric. |
| 8 | *How do you protect tool endpoints from unauthorized public requests?* | `server/routes/tools.ts` (lines 10–40) | Constant-time `crypto.timingSafeEqual` comparison on `X-Tool-Secret` header to prevent timing attacks. |
| 9 | *Why does `book_appointment` return alternative slots when a slot is taken?* | `server/db/repository.ts` (lines 580–610) | Catching `23P01`, immediately querying next 3 open slots for that doctor, and feeding voice-friendly recovery text. |
| 10 | *How are phone numbers protected in audit logs and telemetry?* | `server/db/repository.ts` (lines 25–35) | Phone masking function (`maskPhone`) converting `+919876543210` to `+91 ••••• ••210` before logging. |
| 11 | *How do you isolate database state during evaluation runs?* | `server/evals/engine.ts` (lines 120–130) | `repository.resetToSeedData()` called before each scenario so test cases never cross-contaminate. |
| 12 | *How does the browser client stream voice audio with Retell?* | `src/pages/LiveDemo.tsx` (lines 80–145) | `retell-client-js-sdk`, `startCall({ accessToken })`, event listeners for speaking state and live transcript. |
| 13 | *How do you prevent the voice agent from reading overwhelming lists of slots?* | `server/availability.ts` (lines 170–210) & `agent/system-prompt.md` | `maxSlots: 5` limit, offering top 2-3 in natural spoken language with part-of-day filters. |
| 14 | *What happens if a doctor is on leave on the requested date?* | `server/availability.ts` (lines 180–195) | Checking `schedule_exceptions` table for `kind = 'off'` and skipping slot generation for that date. |
| 15 | *How is the admin dashboard protected from public visitors?* | `server/routes/api.ts` (lines 15–45) | `ADMIN_PASSWORD` verification, setting 7-day `httpOnly` secure session cookie `carecall_session`. |
