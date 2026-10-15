-- ============================================================================
-- CareCall Clinic Appointment Database Schema
-- Run this in the Supabase SQL Editor to provision the database.
-- ============================================================================

-- Enable btree_gist extension for PostgreSQL exclusion constraint across UUID & timestamptz
-- WHY: PostgreSQL's standard UNIQUE constraint can only compare scalar equality (=).
-- To prevent overlapping time ranges (where starts_at < existing_ends_at AND ends_at > existing_starts_at),
-- we must compare ranges using the overlap operator (&&).
-- The btree_gist extension allows combining standard btree types (UUID, INT) with GiST range types
-- in a single EXCLUDE constraint. This guarantees at the database storage engine level
-- that two concurrent bookings for the same doctor can NEVER overlap, even under zero-millisecond race conditions.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clinics table
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    opening_time TIME NOT NULL DEFAULT '08:00',
    closing_time TIME NOT NULL DEFAULT '20:00',
    emergency_contact TEXT NOT NULL DEFAULT '112',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doctors table
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    qualification TEXT,
    slot_minutes INT NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 20, 30, 45, 60)),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Doctor Weekly Schedules
-- weekday: 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    weekday INT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_schedule_window CHECK (end_time > start_time)
);

-- Schedule Exceptions (Leaves, holidays, custom working shifts)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('off', 'custom_hours')),
    start_time TIME,
    end_time TIME,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_custom_hours CHECK (
        (kind = 'off') OR 
        (kind = 'custom_hours' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

-- Patients table (phone unique E.164 format)
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calls table (persisting Retell voice call lifecycles & transcripts)
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retell_call_id TEXT UNIQUE NOT NULL,
    from_number TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_s INT DEFAULT 0,
    transcript JSONB DEFAULT '[]'::jsonb,
    recording_url TEXT,
    disconnect_reason TEXT,
    analysis JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointments table
-- Status: 'booked', 'cancelled', 'completed', 'no_show'
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled', 'completed', 'no_show')),
    reason TEXT,
    confirmation_code TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('voice', 'dashboard')),
    idempotency_key TEXT UNIQUE,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT valid_appointment_duration CHECK (ends_at > starts_at),
    -- CRITICAL EXCLUSION CONSTRAINT FOR CONCURRENCY SAFETY:
    -- WHY: Guarantees that no two appointments can overlap for the same doctor while status is 'booked'.
    -- If two callers request the same slot at the exact same millisecond, the database engine serializes
    -- the transaction and rejects the second with SQLSTATE 23P01 (exclusion_violation).
    -- This eliminates double-booking race conditions without relying on brittle application-level locks.
    CONSTRAINT no_double_booking EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (status = 'booked')
);

-- Tool Invocations (Audit log for real-time dashboard telemetry and latency evals)
CREATE TABLE IF NOT EXISTS tool_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    retell_call_id TEXT,
    tool_name TEXT NOT NULL,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB NOT NULL DEFAULT '{}'::jsonb,
    latency_ms INT NOT NULL DEFAULT 0,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Runs (Suite execution sessions)
CREATE TABLE IF NOT EXISTS eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_count INT NOT NULL DEFAULT 0,
    passed_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    pass_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    duration_ms INT NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval Results (Per-scenario results within a run)
CREATE TABLE IF NOT EXISTS eval_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    turns INT NOT NULL DEFAULT 0,
    latency_p95_ms INT NOT NULL DEFAULT 0,
    error_message TEXT,
    transcript JSONB DEFAULT '[]'::jsonb,
    judge_rationale TEXT,
    db_state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- WHY: Fast lookup when checking doctor schedule and availability by date range
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_starts 
    ON appointments (doctor_id, starts_at) 
    WHERE (status = 'booked');

-- WHY: Fast confirmation code lookup during voice reschedule/cancel requests
CREATE INDEX IF NOT EXISTS idx_appointments_confirmation 
    ON appointments (confirmation_code);

-- WHY: Fast caller verification and lookup by phone
CREATE INDEX IF NOT EXISTS idx_patients_phone 
    ON patients (phone);

-- WHY: Fast doctor schedule lookup by weekday
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_weekday 
    ON doctor_schedules (doctor_id, weekday);

-- WHY: Fast exception/leave checks by date
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_doctor_date 
    ON schedule_exceptions (doctor_id, date);

-- WHY: Tool execution timeline retrieval for a specific voice call
CREATE INDEX IF NOT EXISTS idx_tool_invocations_call_id 
    ON tool_invocations (call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_invocations_retell_call_id 
    ON tool_invocations (retell_call_id, created_at DESC);
