-- ============================================================================
-- CareCall Clinic Database Seed Data
-- 1 Clinic, 6 Doctors, Weekly Schedules, 3 Exceptions, 10 Patients, ~30 Appointments
-- ============================================================================

-- Clean existing seed data cleanly if re-running
TRUNCATE TABLE tool_invocations, eval_results, eval_runs, appointments, patients, schedule_exceptions, doctor_schedules, doctors, clinics, calls CASCADE;

-- 1. Insert Clinic
INSERT INTO clinics (id, name, timezone, phone, address, opening_time, closing_time, emergency_contact)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'CityCare Multispecialty Clinic',
    'Asia/Kolkata',
    '+918041234567',
    'Plot 42, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
    '08:00',
    '20:00',
    '112'
);

-- 2. Insert 6 Doctors across diverse specialties
INSERT INTO doctors (id, clinic_id, name, specialty, qualification, slot_minutes, active) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Dr. Rajesh Rao', 'General Physician', 'MBBS, MD (Internal Medicine)', 30, true),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Dr. Ananya Sharma', 'Dermatology', 'MBBS, DVD, MD (Dermatology)', 30, true),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Dr. Priya Nair', 'Pediatrics', 'MBBS, DCH, DNB (Pediatrics)', 30, true),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Dr. Vikram Mehta', 'Cardiology', 'MBBS, MD, DM (Cardiology)', 45, true),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Dr. Sanjay Kulkarni', 'Orthopedics', 'MBBS, MS (Orthopedics)', 30, true),
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Dr. Sunita Deshmukh', 'Gynecology', 'MBBS, DGO, MS (Obstetrics & Gynae)', 30, true);

-- 3. Doctor Weekly Schedules (Realistic shifts Mon-Sat, Sunday off or limited)
-- Weekdays: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

-- Dr. Rajesh Rao (Mon-Sat, 09:00 - 13:00 and 14:00 - 18:00)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000001', 1, '09:00', '13:00'),
('b0000000-0000-0000-0000-000000000001', 1, '14:00', '18:00'),
('b0000000-0000-0000-0000-000000000001', 2, '09:00', '13:00'),
('b0000000-0000-0000-0000-000000000001', 2, '14:00', '18:00'),
('b0000000-0000-0000-0000-000000000001', 3, '09:00', '13:00'),
('b0000000-0000-0000-0000-000000000001', 3, '14:00', '18:00'),
('b0000000-0000-0000-0000-000000000001', 4, '09:00', '13:00'),
('b0000000-0000-0000-0000-000000000001', 4, '14:00', '18:00'),
('b0000000-0000-0000-0000-000000000001', 5, '09:00', '13:00'),
('b0000000-0000-0000-0000-000000000001', 5, '14:00', '18:00'),
('b0000000-0000-0000-0000-000000000001', 6, '09:00', '13:00');

-- Dr. Ananya Sharma (Mon, Wed, Fri: 10:00 - 16:00, Sat: 10:00 - 14:00)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000002', 1, '10:00', '16:00'),
('b0000000-0000-0000-0000-000000000002', 3, '10:00', '16:00'),
('b0000000-0000-0000-0000-000000000002', 5, '10:00', '16:00'),
('b0000000-0000-0000-0000-000000000002', 6, '10:00', '14:00');

-- Dr. Priya Nair (Mon-Fri: 09:00 - 14:00)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000003', 1, '09:00', '14:00'),
('b0000000-0000-0000-0000-000000000003', 2, '09:00', '14:00'),
('b0000000-0000-0000-0000-000000000003', 3, '09:00', '14:00'),
('b0000000-0000-0000-0000-000000000003', 4, '09:00', '14:00'),
('b0000000-0000-0000-0000-000000000003', 5, '09:00', '14:00');

-- Dr. Vikram Mehta (Tue, Thu, Sat: 14:00 - 19:15)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000004', 2, '14:00', '19:15'),
('b0000000-0000-0000-0000-000000000004', 4, '14:00', '19:15'),
('b0000000-0000-0000-0000-000000000004', 6, '10:00', '14:30');

-- Dr. Sanjay Kulkarni (Mon, Wed, Fri: 11:00 - 17:00)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000005', 1, '11:00', '17:00'),
('b0000000-0000-0000-0000-000000000005', 3, '11:00', '17:00'),
('b0000000-0000-0000-0000-000000000005', 5, '11:00', '17:00');

-- Dr. Sunita Deshmukh (Tue, Thu, Sat: 09:30 - 15:30)
INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
('b0000000-0000-0000-0000-000000000006', 2, '09:30', '15:30'),
('b0000000-0000-0000-0000-000000000006', 4, '09:30', '15:30'),
('b0000000-0000-0000-0000-000000000006', 6, '09:30', '14:00');

-- 4. Insert 3 Schedule Exceptions (Leave & custom hours relative to CURRENT_DATE)
INSERT INTO schedule_exceptions (doctor_id, date, kind, start_time, end_time, reason) VALUES
('b0000000-0000-0000-0000-000000000002', CURRENT_DATE + INTERVAL '1 day', 'off', NULL, NULL, 'Medical Conference in Mumbai'),
('b0000000-0000-0000-0000-000000000001', CURRENT_DATE + INTERVAL '3 days', 'off', NULL, NULL, 'Personal Leave'),
('b0000000-0000-0000-0000-000000000004', CURRENT_DATE + INTERVAL '5 days', 'custom_hours', '16:00', '19:15', 'Morning Hospital Surgeries');

-- 5. Insert 10 Patients (E.164 phone numbers)
INSERT INTO patients (id, clinic_id, name, phone) VALUES
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Arjun Kapoor', '+919876543210'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Neha Verma', '+919811223344'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Kavita Sundaram', '+919822334455'),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Rohan Iyer', '+919833445566'),
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Deepa Patil', '+919844556677'),
('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Aditya Joshi', '+919855667788'),
('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Meera Nambiar', '+919866778899'),
('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Vivek Banerjee', '+919877889900'),
('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Pooja Agarwal', '+919888990011'),
('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Manish Reddy', '+919899001122');

-- 6. Insert ~30 Realistic Appointments across next 2 weeks (Dates relative to CURRENT_DATE at Asia/Kolkata)
-- Day 0, Day 1, Day 2, Day 4, Day 6, Day 7, Day 8, Day 10
INSERT INTO appointments (
    doctor_id, patient_id, starts_at, ends_at, status, reason, confirmation_code, source, created_at
) VALUES
-- Today / Day 0
('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 
 ((CURRENT_DATE + TIME '09:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 ((CURRENT_DATE + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Seasonal flu symptoms and high fever', 'APT-7482', 'voice', now() - INTERVAL '3 hours'),

('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 
 ((CURRENT_DATE + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 ((CURRENT_DATE + TIME '11:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Routine BP and cholesterol review', 'APT-8391', 'dashboard', now() - INTERVAL '1 day'),

('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 
 ((CURRENT_DATE + TIME '10:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 ((CURRENT_DATE + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Infant vaccination (6 months booster)', 'APT-1940', 'voice', now() - INTERVAL '4 hours'),

-- Tomorrow / Day 1
('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '10:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Chronic cough checkup', 'APT-5512', 'voice', now() - INTERVAL '5 hours'),

('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '11:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '12:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Right knee pain after sports', 'APT-9041', 'dashboard', now() - INTERVAL '2 days'),

('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000006', 
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '14:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '1 day') + TIME '15:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Diabetes HbA1c consultation', 'APT-3298', 'voice', now() - INTERVAL '6 hours'),

-- Day 2
('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000007', 
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '14:45')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '15:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Post-angioplasty annual follow up', 'APT-6632', 'voice', now() - INTERVAL '1 day'),

('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000008', 
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '11:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Toddler earache and crying', 'APT-4109', 'voice', now() - INTERVAL '8 hours'),

('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000009', 
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '10:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '2 days') + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Second trimester antenatal ultrasound review', 'APT-8217', 'dashboard', now() - INTERVAL '2 days'),

-- Day 4
('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000010', 
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '10:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Severe eczema flare-up on hands', 'APT-1184', 'voice', now() - INTERVAL '12 hours'),

('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '15:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '16:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Throat irritation follow up', 'APT-5920', 'voice', now() - INTERVAL '1 day'),

('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '13:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '4 days') + TIME '13:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Shoulder impingement checkup', 'APT-7721', 'dashboard', now() - INTERVAL '3 days'),

-- Day 5
('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000007', 
 (((CURRENT_DATE + INTERVAL '5 days') + TIME '17:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '5 days') + TIME '17:45')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'ECG review and chest heaviness evaluation', 'APT-9934', 'voice', now() - INTERVAL '1 day'),

-- Day 6
('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 
 (((CURRENT_DATE + INTERVAL '6 days') + TIME '11:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '6 days') + TIME '12:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'PCOS management review', 'APT-6058', 'voice', now() - INTERVAL '2 days'),

('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 
 (((CURRENT_DATE + INTERVAL '6 days') + TIME '09:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE + INTERVAL '6 days') + TIME '09:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'booked', 'Thyroid medication adjustment', 'APT-4822', 'dashboard', now() - INTERVAL '4 days'),

-- Cancelled & completed historical records for realistic metrics
('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 
 (((CURRENT_DATE - INTERVAL '1 day') + TIME '10:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE - INTERVAL '1 day') + TIME '10:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'completed', 'Annual health check', 'APT-1001', 'voice', now() - INTERVAL '2 days'),

('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000008', 
 (((CURRENT_DATE - INTERVAL '1 day') + TIME '14:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE - INTERVAL '1 day') + TIME '14:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'cancelled', 'Travel plans changed', 'APT-1002', 'voice', now() - INTERVAL '2 days'),

('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000009', 
 (((CURRENT_DATE - INTERVAL '2 days') + TIME '11:00')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 (((CURRENT_DATE - INTERVAL '2 days') + TIME '11:30')::timestamp AT TIME ZONE 'Asia/Kolkata'),
 'completed', 'Child growth milestone check', 'APT-1003', 'dashboard', now() - INTERVAL '3 days');

-- 7. Insert a sample call record for realistic dashboard initial state
INSERT INTO calls (id, retell_call_id, from_number, started_at, ended_at, duration_s, transcript, recording_url, disconnect_reason, analysis)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'call_sample_test_001',
    '+919876543210',
    now() - INTERVAL '2 hours',
    now() - INTERVAL '2 hours' + INTERVAL '94 seconds',
    94,
    '[
      {"role": "agent", "content": "Good morning, thank you for calling CityCare Clinic. I am Maya, your appointment assistant. How may I help you today?"},
      {"role": "user", "content": "Hi, I have a bad fever and need to see a general physician today."},
      {"role": "agent", "content": "I can help you with that. May I have your full name please?"},
      {"role": "user", "content": "Arjun Kapoor."},
      {"role": "agent", "content": "Thank you, Arjun. We have Dr. Rajesh Rao available today at 9:30 AM or 2:00 PM. Would either work for you?"},
      {"role": "user", "content": "9:30 AM sounds perfect."},
      {"role": "agent", "content": "I have booked your appointment with Dr. Rajesh Rao for today at 9:30 AM. Your confirmation code is APT-7482. We look forward to seeing you!"}
    ]'::jsonb,
    'https://api.retellai.com/recordings/sample_call.mp3',
    'user_hangup',
    '{"booking_successful": true, "doctor": "Dr. Rajesh Rao", "sentiment": "positive", "confirmation_code": "APT-7482"}'::jsonb
);

-- Associate tool invocation for sample call
INSERT INTO tool_invocations (call_id, retell_call_id, tool_name, input, output, latency_ms, error_code, created_at)
VALUES 
('d0000000-0000-0000-0000-000000000001', 'call_sample_test_001', 'check_availability', '{"specialty": "General Physician", "date_from": "today"}'::jsonb, '{"ok": true, "slots_found": 4}'::jsonb, 42, NULL, now() - INTERVAL '2 hours' + INTERVAL '30 seconds'),
('d0000000-0000-0000-0000-000000000001', 'call_sample_test_001', 'book_appointment', '{"patient_name": "Arjun Kapoor", "phone": "+919876543210", "doctor_id": "b0000000-0000-0000-0000-000000000001"}'::jsonb, '{"ok": true, "confirmation_code": "APT-7482"}'::jsonb, 68, NULL, now() - INTERVAL '2 hours' + INTERVAL '60 seconds');
