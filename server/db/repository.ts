import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Clinic,
  Doctor,
  DoctorScheduleRecord,
  ScheduleExceptionRecord,
  Patient,
  Appointment,
  CallRecord,
  ToolInvocation,
  EvalRunRecord,
  EvalResultRecord,
} from './types';
import {
  computeDoctorAvailability,
  AvailableSlot,
  createUtcFromZoned,
  getCurrentClinicDate,
  getZonedDateParts,
  addZonedDays,
  CLINIC_TIMEZONE,
} from '../availability';

/**
 * Mask phone numbers for audit logging and tool telemetry:
 * E.g. "+919876543210" -> "+91 ••••• ••210"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '••••••••';
  const clean = phone.trim();
  if (clean.length <= 4) return '••••';
  const visiblePrefix = clean.slice(0, 3);
  const visibleSuffix = clean.slice(-3);
  return `${visiblePrefix} ••••• ••${visibleSuffix}`;
}

export interface BookAppointmentParams {
  doctorId: string;
  patientName: string;
  phone: string;
  startsAt: string; // ISO 8601 UTC
  reason?: string;
  idempotencyKey?: string;
  source?: 'voice' | 'dashboard';
  callId?: string;
}

export interface RescheduleAppointmentParams {
  confirmationCode: string;
  phone: string;
  newStartsAt: string; // ISO 8601 UTC
}

export interface CancelAppointmentParams {
  confirmationCode: string;
  phone: string;
  reason?: string;
}

export interface CheckAvailabilityParams {
  doctorId?: string;
  specialty?: string;
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string;   // "YYYY-MM-DD"
  partOfDay?: 'morning' | 'afternoon' | 'evening';
}

export class CareCallRepository {
  private supabase: SupabaseClient | null = null;
  public isSupabaseConnected = false;

  // In-memory isolated storage for testing, development, and eval resets
  private clinic: Clinic;
  private doctors: Doctor[] = [];
  private schedules: DoctorScheduleRecord[] = [];
  private exceptions: ScheduleExceptionRecord[] = [];
  private patients: Patient[] = [];
  private appointments: Appointment[] = [];
  private calls: CallRecord[] = [];
  private toolInvocations: ToolInvocation[] = [];
  private evalRuns: EvalRunRecord[] = [];
  private evalResults: EvalResultRecord[] = [];

  constructor() {
    this.clinic = this.getInitialClinic();
    this.resetToSeedData();
    this.initializeSupabase();
  }

  private getInitialClinic(): Clinic {
    return {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'CityCare Multispecialty Clinic',
      timezone: process.env.CLINIC_TIMEZONE || 'Asia/Kolkata',
      phone: '+918041234567',
      address: 'Plot 42, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
      openingTime: '08:00',
      closingTime: '20:00',
      emergencyContact: '112',
      createdAt: new Date().toISOString(),
    };
  }

  private initializeSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key && url.startsWith('http') && !url.includes('xyzcompany')) {
      try {
        this.supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        this.isSupabaseConnected = true;
      } catch (e) {
        console.warn('Supabase initialization failed, running with local engine:', e);
        this.isSupabaseConnected = false;
      }
    }
  }

  /**
   * Reset the repository state to clean seed data.
   * Crucial for scenario-isolated evaluations.
   */
  public resetToSeedData() {
    this.clinic = this.getInitialClinic();
    const clinicId = this.clinic.id;

    // 6 Doctors
    this.doctors = [
      {
        id: 'b0000000-0000-0000-0000-000000000001',
        clinicId,
        name: 'Dr. Rajesh Rao',
        specialty: 'General Physician',
        qualification: 'MBBS, MD (Internal Medicine)',
        slotMinutes: 30,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'b0000000-0000-0000-0000-000000000002',
        clinicId,
        name: 'Dr. Ananya Sharma',
        specialty: 'Dermatology',
        qualification: 'MBBS, DVD, MD (Dermatology)',
        slotMinutes: 30,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'b0000000-0000-0000-0000-000000000003',
        clinicId,
        name: 'Dr. Priya Nair',
        specialty: 'Pediatrics',
        qualification: 'MBBS, DCH, DNB (Pediatrics)',
        slotMinutes: 30,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'b0000000-0000-0000-0000-000000000004',
        clinicId,
        name: 'Dr. Vikram Mehta',
        specialty: 'Cardiology',
        qualification: 'MBBS, MD, DM (Cardiology)',
        slotMinutes: 45,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'b0000000-0000-0000-0000-000000000005',
        clinicId,
        name: 'Dr. Sanjay Kulkarni',
        specialty: 'Orthopedics',
        qualification: 'MBBS, MS (Orthopedics)',
        slotMinutes: 30,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'b0000000-0000-0000-0000-000000000006',
        clinicId,
        name: 'Dr. Sunita Deshmukh',
        specialty: 'Gynecology',
        qualification: 'MBBS, DGO, MS (Obstetrics & Gynae)',
        slotMinutes: 30,
        active: true,
        createdAt: new Date().toISOString(),
      },
    ];

    // Weekly Schedules
    this.schedules = [
      // Dr. Rajesh Rao (Mon-Sat, 09:00-13:00 and 14:00-18:00)
      ...[1, 2, 3, 4, 5].flatMap((w) => [
        { id: `sch-rao-${w}-1`, doctorId: 'b0000000-0000-0000-0000-000000000001', weekday: w, startTime: '09:00', endTime: '13:00', createdAt: new Date().toISOString() },
        { id: `sch-rao-${w}-2`, doctorId: 'b0000000-0000-0000-0000-000000000001', weekday: w, startTime: '14:00', endTime: '18:00', createdAt: new Date().toISOString() },
      ]),
      { id: 'sch-rao-6-1', doctorId: 'b0000000-0000-0000-0000-000000000001', weekday: 6, startTime: '09:00', endTime: '13:00', createdAt: new Date().toISOString() },

      // Dr. Ananya Sharma (Mon, Wed, Fri: 10:00-16:00, Sat: 10:00-14:00)
      { id: 'sch-sha-1', doctorId: 'b0000000-0000-0000-0000-000000000002', weekday: 1, startTime: '10:00', endTime: '16:00', createdAt: new Date().toISOString() },
      { id: 'sch-sha-3', doctorId: 'b0000000-0000-0000-0000-000000000002', weekday: 3, startTime: '10:00', endTime: '16:00', createdAt: new Date().toISOString() },
      { id: 'sch-sha-5', doctorId: 'b0000000-0000-0000-0000-000000000002', weekday: 5, startTime: '10:00', endTime: '16:00', createdAt: new Date().toISOString() },
      { id: 'sch-sha-6', doctorId: 'b0000000-0000-0000-0000-000000000002', weekday: 6, startTime: '10:00', endTime: '14:00', createdAt: new Date().toISOString() },

      // Dr. Priya Nair (Mon-Fri: 09:00-14:00)
      ...[1, 2, 3, 4, 5].map((w) => ({
        id: `sch-nai-${w}`, doctorId: 'b0000000-0000-0000-0000-000000000003', weekday: w, startTime: '09:00', endTime: '14:00', createdAt: new Date().toISOString(),
      })),

      // Dr. Vikram Mehta (Tue, Thu: 14:00-19:15, Sat: 10:00-14:30)
      { id: 'sch-meh-2', doctorId: 'b0000000-0000-0000-0000-000000000004', weekday: 2, startTime: '14:00', endTime: '19:15', createdAt: new Date().toISOString() },
      { id: 'sch-meh-4', doctorId: 'b0000000-0000-0000-0000-000000000004', weekday: 4, startTime: '14:00', endTime: '19:15', createdAt: new Date().toISOString() },
      { id: 'sch-meh-6', doctorId: 'b0000000-0000-0000-0000-000000000004', weekday: 6, startTime: '10:00', endTime: '14:30', createdAt: new Date().toISOString() },

      // Dr. Sanjay Kulkarni (Mon, Wed, Fri: 11:00-17:00)
      { id: 'sch-kul-1', doctorId: 'b0000000-0000-0000-0000-000000000005', weekday: 1, startTime: '11:00', endTime: '17:00', createdAt: new Date().toISOString() },
      { id: 'sch-kul-3', doctorId: 'b0000000-0000-0000-0000-000000000005', weekday: 3, startTime: '11:00', endTime: '17:00', createdAt: new Date().toISOString() },
      { id: 'sch-kul-5', doctorId: 'b0000000-0000-0000-0000-000000000005', weekday: 5, startTime: '11:00', endTime: '17:00', createdAt: new Date().toISOString() },

      // Dr. Sunita Deshmukh (Tue, Thu: 09:30-15:30, Sat: 09:30-14:00)
      { id: 'sch-des-2', doctorId: 'b0000000-0000-0000-0000-000000000006', weekday: 2, startTime: '09:30', endTime: '15:30', createdAt: new Date().toISOString() },
      { id: 'sch-des-4', doctorId: 'b0000000-0000-0000-0000-000000000006', weekday: 4, startTime: '09:30', endTime: '15:30', createdAt: new Date().toISOString() },
      { id: 'sch-des-6', doctorId: 'b0000000-0000-0000-0000-000000000006', weekday: 6, startTime: '09:30', endTime: '14:00', createdAt: new Date().toISOString() },
    ];

    // 3 Schedule Exceptions relative to today in the clinic's local timezone (Asia/Kolkata)
    const todayClinicDate = getCurrentClinicDate(this.clinic.timezone);
    const getDateOffset = (days: number) => addZonedDays(todayClinicDate, days);

    this.exceptions = [
      {
        id: 'exc-001',
        doctorId: 'b0000000-0000-0000-0000-000000000002', // Dr. Ananya Sharma
        date: getDateOffset(1),
        kind: 'off',
        reason: 'Medical Conference in Mumbai',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exc-002',
        doctorId: 'b0000000-0000-0000-0000-000000000001', // Dr. Rajesh Rao
        date: getDateOffset(3),
        kind: 'off',
        reason: 'Personal Leave',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exc-003',
        doctorId: 'b0000000-0000-0000-0000-000000000004', // Dr. Vikram Mehta
        date: getDateOffset(5),
        kind: 'custom_hours',
        startTime: '16:00',
        endTime: '19:15',
        reason: 'Morning Hospital Surgeries',
        createdAt: new Date().toISOString(),
      },
    ];

    // Seed Admin and Patients with roles and password hashes
    const adminPasswordHash = this.hashPassword(process.env.ADMIN_PASSWORD || 'clinic_admin_pass');
    const defaultPatientPasswordHash = this.hashPassword('password123');

    this.patients = [
      {
        id: 'a0000000-0000-0000-0000-000000000099',
        clinicId,
        name: 'System Administrator',
        phone: '+918000000000',
        email: 'admin@citycare.clinic',
        passwordHash: adminPasswordHash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
      { id: 'c0000000-0000-0000-0000-000000000001', clinicId, name: 'Arjun Kapoor', phone: '+919876543210', email: 'arjun@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000002', clinicId, name: 'Neha Verma', phone: '+919811223344', email: 'neha@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000003', clinicId, name: 'Kavita Sundaram', phone: '+919822334455', email: 'kavita@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000004', clinicId, name: 'Rohan Iyer', phone: '+919833445566', email: 'rohan@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000005', clinicId, name: 'Deepa Patil', phone: '+919844556677', email: 'deepa@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000006', clinicId, name: 'Aditya Joshi', phone: '+919855667788', email: 'aditya@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000007', clinicId, name: 'Meera Nambiar', phone: '+919866778899', email: 'meera@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000008', clinicId, name: 'Vivek Banerjee', phone: '+919877889900', email: 'vivek@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000009', clinicId, name: 'Pooja Agarwal', phone: '+919888990011', email: 'pooja@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
      { id: 'c0000000-0000-0000-0000-000000000010', clinicId, name: 'Manish Reddy', phone: '+919899001122', email: 'manish@example.com', passwordHash: defaultPatientPasswordHash, role: 'patient', createdAt: new Date().toISOString() },
    ];

    // Appointments across the next 2 weeks
    this.appointments = [
      {
        id: 'apt-001',
        doctorId: 'b0000000-0000-0000-0000-000000000001',
        patientId: 'c0000000-0000-0000-0000-000000000001',
        startsAt: createUtcFromZoned(getDateOffset(0), '09:30', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(0), '10:00', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Seasonal flu symptoms and high fever',
        confirmationCode: 'APT-7482',
        source: 'voice',
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      },
      {
        id: 'apt-002',
        doctorId: 'b0000000-0000-0000-0000-000000000001',
        patientId: 'c0000000-0000-0000-0000-000000000002',
        startsAt: createUtcFromZoned(getDateOffset(0), '11:00', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(0), '11:30', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Routine BP and cholesterol review',
        confirmationCode: 'APT-8391',
        source: 'dashboard',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'apt-003',
        doctorId: 'b0000000-0000-0000-0000-000000000003',
        patientId: 'c0000000-0000-0000-0000-000000000003',
        startsAt: createUtcFromZoned(getDateOffset(0), '10:30', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(0), '11:00', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Infant vaccination (6 months booster)',
        confirmationCode: 'APT-1940',
        source: 'voice',
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
      {
        id: 'apt-004',
        doctorId: 'b0000000-0000-0000-0000-000000000001',
        patientId: 'c0000000-0000-0000-0000-000000000004',
        startsAt: createUtcFromZoned(getDateOffset(1), '10:00', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(1), '10:30', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Chronic cough checkup',
        confirmationCode: 'APT-5512',
        source: 'voice',
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: 'apt-005',
        doctorId: 'b0000000-0000-0000-0000-000000000005',
        patientId: 'c0000000-0000-0000-0000-000000000005',
        startsAt: createUtcFromZoned(getDateOffset(1), '11:30', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(1), '12:00', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Right knee pain after sports',
        confirmationCode: 'APT-9041',
        source: 'dashboard',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'apt-006',
        doctorId: 'b0000000-0000-0000-0000-000000000004',
        patientId: 'c0000000-0000-0000-0000-000000000007',
        startsAt: createUtcFromZoned(getDateOffset(2), '14:45', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(2), '15:30', this.clinic.timezone).toISOString(),
        status: 'booked',
        reason: 'Post-angioplasty annual follow up',
        confirmationCode: 'APT-6632',
        source: 'voice',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'apt-007',
        doctorId: 'b0000000-0000-0000-0000-000000000002',
        patientId: 'c0000000-0000-0000-0000-000000000008',
        startsAt: createUtcFromZoned(getDateOffset(-1), '14:00', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(-1), '14:30', this.clinic.timezone).toISOString(),
        status: 'cancelled',
        reason: 'Travel plans changed',
        confirmationCode: 'APT-1002',
        source: 'voice',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        cancelledAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'apt-008',
        doctorId: 'b0000000-0000-0000-0000-000000000001',
        patientId: 'c0000000-0000-0000-0000-000000000002',
        startsAt: createUtcFromZoned(getDateOffset(-1), '10:00', this.clinic.timezone).toISOString(),
        endsAt: createUtcFromZoned(getDateOffset(-1), '10:30', this.clinic.timezone).toISOString(),
        status: 'completed',
        reason: 'Annual health check',
        confirmationCode: 'APT-1001',
        source: 'voice',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ];

    // Seed sample calls
    this.calls = [
      {
        id: 'd0000000-0000-0000-0000-000000000001',
        retellCallId: 'call_sample_test_001',
        fromNumber: '+919876543210',
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        endedAt: new Date(Date.now() - 7200000 + 94000).toISOString(),
        durationS: 94,
        transcript: [
          { role: 'agent', content: 'Good morning, thank you for calling CityCare Clinic. I am Maya, your appointment assistant. How may I help you today?' },
          { role: 'user', content: 'Hi, I have a bad fever and need to see a general physician today.' },
          { role: 'agent', content: 'I can help you with that. May I have your full name please?' },
          { role: 'user', content: 'Arjun Kapoor.' },
          { role: 'agent', content: 'Thank you, Arjun. We have Dr. Rajesh Rao available today at 9:30 AM or 2:00 PM. Would either work for you?' },
          { role: 'user', content: '9:30 AM sounds perfect.' },
          { role: 'agent', content: 'I have booked your appointment with Dr. Rajesh Rao for today at 9:30 AM. Your confirmation code is APT-7482. We look forward to seeing you!' },
        ],
        recordingUrl: 'https://api.retellai.com/recordings/sample_call.mp3',
        disconnectReason: 'user_hangup',
        analysis: {
          booking_successful: true,
          doctor: 'Dr. Rajesh Rao',
          sentiment: 'positive',
          confirmation_code: 'APT-7482',
        },
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
    ];

    this.toolInvocations = [
      {
        id: 'ti-001',
        callId: 'd0000000-0000-0000-0000-000000000001',
        retellCallId: 'call_sample_test_001',
        toolName: 'check_availability',
        input: { specialty: 'General Physician', date_from: 'today' },
        output: { ok: true, slots_found: 4 },
        latencyMs: 42,
        errorCode: null,
        createdAt: new Date(Date.now() - 7170000).toISOString(),
      },
      {
        id: 'ti-002',
        callId: 'd0000000-0000-0000-0000-000000000001',
        retellCallId: 'call_sample_test_001',
        toolName: 'book_appointment',
        input: { patient_name: 'Arjun Kapoor', phone: '+919876543210', doctor_id: 'b0000000-0000-0000-0000-000000000001' },
        output: { ok: true, confirmation_code: 'APT-7482' },
        latencyMs: 68,
        errorCode: null,
        createdAt: new Date(Date.now() - 7140000).toISOString(),
      },
    ];
  }

  // ==========================================================================
  // AUTHENTICATION & PATIENT / ADMIN METHODS
  // ==========================================================================

  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  public verifyPassword(password: string, stored?: string | null): boolean {
    if (!stored) return false;
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(key, 'hex'));
    } catch {
      return false;
    }
  }

  public async registerPatient(params: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<Patient> {
    const { name, email, phone, password } = params;
    if (!email || !password || !name || !phone) {
      throw { code: 'VALIDATION_ERROR', message: 'All fields (name, email, phone, password) are required.' };
    }
    const cleanEmail = email.toLowerCase().trim();
    const existingEmail = this.patients.find((p) => p.email?.toLowerCase() === cleanEmail);
    if (existingEmail) {
      throw { code: 'DUPLICATE_EMAIL', message: 'An account with this email address already exists.' };
    }

    const cleanPhone = phone.replace(/[\s-]/g, '');
    const existingPhone = this.patients.find((p) => p.phone.replace(/[\s-]/g, '') === cleanPhone);
    if (existingPhone) {
      throw { code: 'DUPLICATE_PHONE', message: 'An account with this phone number already exists.' };
    }

    const passwordHash = this.hashPassword(password);
    const newPatient: Patient = {
      id: crypto.randomUUID(),
      clinicId: this.clinic.id,
      name,
      phone,
      email: cleanEmail,
      passwordHash,
      role: 'patient', // Strictly enforced as patient
      createdAt: new Date().toISOString(),
    };

    this.patients.push(newPatient);
    return newPatient;
  }

  public async authenticateUser(emailOrIdentifier: string, password: string): Promise<Patient | null> {
    const query = emailOrIdentifier.toLowerCase().trim();
    const patient = this.patients.find(
      (p) =>
        (p.email && p.email.toLowerCase() === query) ||
        p.phone.replace(/[\s-]/g, '') === query.replace(/[\s-]/g, '')
    );

    if (!patient || !patient.passwordHash) {
      return null;
    }

    const isValid = this.verifyPassword(password, patient.passwordHash);
    if (!isValid) {
      return null;
    }

    return patient;
  }

  public async getPatientById(id: string): Promise<Patient | null> {
    return this.patients.find((p) => p.id === id) || null;
  }

  public async listAllPatients(): Promise<Patient[]> {
    return this.patients;
  }

  public async getAppointmentsForPatient(patientId: string): Promise<Appointment[]> {
    const appts = this.appointments.filter((a) => a.patientId === patientId);
    return appts.map((a) => {
      const doc = this.doctors.find((d) => d.id === a.doctorId);
      const pat = this.patients.find((p) => p.id === a.patientId);
      return {
        ...a,
        doctorName: doc ? doc.name : 'Unknown Doctor',
        doctorSpecialty: doc ? doc.specialty : '',
        patientName: pat ? pat.name : 'Unknown Patient',
        patientPhone: pat ? pat.phone : '',
      };
    }).sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }

  public async getClinicInfo(): Promise<Clinic> {
    return this.clinic;
  }

  public async listDoctors(specialty?: string): Promise<Doctor[]> {
    let docs = this.doctors.filter((d) => d.active);
    if (specialty) {
      const specLower = specialty.toLowerCase().trim();
      docs = docs.filter(
        (d) =>
          d.specialty.toLowerCase().includes(specLower) ||
          specLower.includes(d.specialty.toLowerCase())
      );
    }
    return docs;
  }

  public async getDoctorById(id: string): Promise<Doctor | null> {
    return this.doctors.find((d) => d.id === id) || null;
  }

  public async findPatientByPhone(phone: string): Promise<Patient | null> {
    const clean = phone.replace(/[\s-]/g, '');
    return (
      this.patients.find(
        (p) => p.phone === phone || p.phone.replace(/[\s-]/g, '') === clean
      ) || null
    );
  }

  public async upsertPatient(name: string, phone: string): Promise<Patient> {
    let patient = await this.findPatientByPhone(phone);
    if (patient) {
      if (name && patient.name !== name) {
        patient.name = name;
      }
      return patient;
    }
    const newPatient: Patient = {
      id: crypto.randomUUID(),
      clinicId: this.clinic.id,
      name,
      phone,
      role: 'patient',
      createdAt: new Date().toISOString(),
    };
    this.patients.push(newPatient);
    return newPatient;
  }

  public async checkAvailability(params: CheckAvailabilityParams): Promise<{
    doctor: Doctor;
    slots: AvailableSlot[];
  }[]> {
    const { doctorId, specialty, dateFrom, dateTo, partOfDay } = params;
    let targetDoctors = this.doctors.filter((d) => d.active);

    if (doctorId) {
      targetDoctors = targetDoctors.filter((d) => d.id === doctorId);
    } else if (specialty) {
      const specLower = specialty.toLowerCase().trim();
      targetDoctors = targetDoctors.filter(
        (d) =>
          d.specialty.toLowerCase().includes(specLower) ||
          specLower.includes(d.specialty.toLowerCase())
      );
    }

    const results: { doctor: Doctor; slots: AvailableSlot[] }[] = [];

    for (const doc of targetDoctors) {
      const slots = computeDoctorAvailability({
        doctor: {
          id: doc.id,
          name: doc.name,
          specialty: doc.specialty,
          slotMinutes: doc.slotMinutes,
          active: doc.active,
        },
        schedules: this.schedules,
        exceptions: this.exceptions,
        bookedAppointments: this.appointments,
        dateFrom,
        dateTo,
        partOfDay,
        clinicTimezone: this.clinic.timezone,
        now: new Date(),
        maxSlots: 5,
      });

      results.push({ doctor: doc, slots });
    }

    return results;
  }

  // Mutex queue to serialize atomic booking transactions
  private bookingLocks: Map<string, Promise<void>> = new Map();

  private async acquireBookingLock(doctorId: string): Promise<() => void> {
    while (this.bookingLocks.has(doctorId)) {
      await this.bookingLocks.get(doctorId);
    }
    let release: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      release = () => {
        this.bookingLocks.delete(doctorId);
        resolve();
      };
    });
    this.bookingLocks.set(doctorId, promise);
    return release;
  }

  /**
   * Concurrency-safe atomic appointment booking.
   * Enforces exclusion constraint semantics (SQLSTATE 23P01).
   */
  public async bookAppointment(params: BookAppointmentParams): Promise<{
    appointment: Appointment;
    patient: Patient;
    doctor: Doctor;
    isExistingIdempotent: boolean;
  }> {
    const {
      doctorId,
      patientName,
      phone,
      startsAt,
      reason,
      idempotencyKey,
      source = 'voice',
      callId,
    } = params;

    // 1. Idempotency check: if this idempotency key was already booked, return it safely
    if (idempotencyKey) {
      const existing = this.appointments.find(
        (a) => a.idempotencyKey === idempotencyKey && a.status === 'booked'
      );
      if (existing) {
        const patient = this.patients.find((p) => p.id === existing.patientId)!;
        const doctor = this.doctors.find((d) => d.id === existing.doctorId)!;
        return { appointment: existing, patient, doctor, isExistingIdempotent: true };
      }
    }

    // Acquire lock for this doctor to serialize the exclusion check and insert
    const releaseLock = await this.acquireBookingLock(doctorId);

    try {
      const doctor = await this.getDoctorById(doctorId);
      if (!doctor) {
        throw { code: 'NOT_FOUND', message: `Doctor ${doctorId} not found` };
      }

      // Compute endsAt based on doctor slotMinutes
      const startObj = new Date(startsAt);
      if (isNaN(startObj.getTime())) {
        throw { code: 'VALIDATION_ERROR', message: 'Invalid start time format' };
      }

      // Reject past date bookings
      if (startObj.getTime() <= Date.now()) {
        throw { code: 'PAST_DATE', message: 'Cannot book appointments in the past.' };
      }

      const endObj = new Date(startObj.getTime() + doctor.slotMinutes * 60 * 1000);
      const endsAt = endObj.toISOString();

      // 2. CRITICAL DATABASE EXCLUSION CONSTRAINT CHECK
      // Mirrors: constraint no_double_booking exclude using gist (doctor_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
      const reqStartMs = startObj.getTime();
      const reqEndMs = endObj.getTime();

      const hasConflict = this.appointments.some((a) => {
        if (a.doctorId !== doctorId || a.status !== 'booked') return false;
        const bStartMs = new Date(a.startsAt).getTime();
        const bEndMs = new Date(a.endsAt).getTime();
        // Overlap: (reqStart < bEnd) && (reqEnd > bStart)
        return reqStartMs < bEndMs && reqEndMs > bStartMs;
      });

      if (hasConflict) {
        // Find 3 alternative upcoming slots for the same doctor in clinic timezone
        const dateStr = getZonedDateParts(startObj, this.clinic.timezone).dateString;
        const nextWeekDate = addZonedDays(dateStr, 7);
        const alternativeSlots = computeDoctorAvailability({
          doctor: {
            id: doctor.id,
            name: doctor.name,
            specialty: doctor.specialty,
            slotMinutes: doctor.slotMinutes,
            active: doctor.active,
          },
          schedules: this.schedules,
          exceptions: this.exceptions,
          bookedAppointments: this.appointments,
          dateFrom: dateStr,
          dateTo: nextWeekDate,
          clinicTimezone: this.clinic.timezone,
          now: new Date(),
          maxSlots: 3,
        });

        const err: any = new Error('This time slot has already been taken by another patient.');
        err.code = 'SLOT_TAKEN';
        err.sqlstate = '23P01'; // PostgreSQL exclusion_violation
        err.alternativeSlots = alternativeSlots;
        throw err;
      }

      // 3. Upsert patient
      const patient = await this.upsertPatient(patientName, phone);

      // 4. Generate unique readable confirmation code (e.g. "APT-4821")
      const codeNum = Math.floor(1000 + Math.random() * 9000);
      const confirmationCode = `APT-${codeNum}`;

      const newAppointment: Appointment = {
        id: crypto.randomUUID(),
        doctorId,
        patientId: patient.id,
        startsAt,
        endsAt,
        status: 'booked',
        reason: reason || null,
        confirmationCode,
        source,
        idempotencyKey: idempotencyKey || null,
        callId: callId || null,
        createdAt: new Date().toISOString(),
        doctorName: doctor.name,
        doctorSpecialty: doctor.specialty,
        patientName: patient.name,
        patientPhone: patient.phone,
      };

      this.appointments.push(newAppointment);

      return { appointment: newAppointment, patient, doctor, isExistingIdempotent: false };
    } finally {
      releaseLock();
    }
  }

  public async rescheduleAppointment(params: RescheduleAppointmentParams): Promise<{
    appointment: Appointment;
    doctor: Doctor;
    patient: Patient;
  }> {
    const { confirmationCode, phone, newStartsAt } = params;
    const appointment = this.appointments.find(
      (a) => a.confirmationCode.toUpperCase() === confirmationCode.toUpperCase()
    );

    if (!appointment) {
      throw { code: 'NOT_FOUND', message: `No appointment found with confirmation code ${confirmationCode}.` };
    }

    const patient = this.patients.find((p) => p.id === appointment.patientId);
    if (!patient) {
      throw { code: 'NOT_FOUND', message: 'Patient record not found.' };
    }

    // Phone verification: must match registered phone number
    const cleanInputPhone = phone.replace(/[\s-]/g, '');
    const cleanPatientPhone = patient.phone.replace(/[\s-]/g, '');
    if (cleanInputPhone !== cleanPatientPhone && !cleanPatientPhone.endsWith(cleanInputPhone)) {
      throw {
        code: 'PATIENT_NOT_VERIFIED',
        message: 'The phone number provided does not match the patient on file for this booking.',
      };
    }

    const doctor = await this.getDoctorById(appointment.doctorId);
    if (!doctor) {
      throw { code: 'NOT_FOUND', message: 'Doctor record not found.' };
    }

    const startObj = new Date(newStartsAt);
    if (isNaN(startObj.getTime()) || startObj.getTime() <= Date.now()) {
      throw { code: 'PAST_DATE', message: 'Cannot reschedule to a past or invalid time.' };
    }

    const endObj = new Date(startObj.getTime() + doctor.slotMinutes * 60 * 1000);
    const reqStartMs = startObj.getTime();
    const reqEndMs = endObj.getTime();

    // Check conflict against OTHER appointments
    const hasConflict = this.appointments.some((a) => {
      if (a.id === appointment.id || a.doctorId !== doctor.id || a.status !== 'booked') return false;
      const bStartMs = new Date(a.startsAt).getTime();
      const bEndMs = new Date(a.endsAt).getTime();
      return reqStartMs < bEndMs && reqEndMs > bStartMs;
    });

    if (hasConflict) {
      const err: any = new Error('The requested new slot is not available.');
      err.code = 'SLOT_TAKEN';
      err.sqlstate = '23P01';
      throw err;
    }

    appointment.startsAt = newStartsAt;
    appointment.endsAt = endObj.toISOString();

    return { appointment, doctor, patient };
  }

  public async cancelAppointment(params: CancelAppointmentParams): Promise<{
    appointment: Appointment;
    doctor: Doctor;
    patient: Patient;
  }> {
    const { confirmationCode, phone, reason } = params;
    const appointment = this.appointments.find(
      (a) => a.confirmationCode.toUpperCase() === confirmationCode.toUpperCase()
    );

    if (!appointment) {
      throw { code: 'NOT_FOUND', message: `No appointment found with confirmation code ${confirmationCode}.` };
    }

    const patient = this.patients.find((p) => p.id === appointment.patientId);
    if (!patient) {
      throw { code: 'NOT_FOUND', message: 'Patient record not found.' };
    }

    const cleanInputPhone = phone.replace(/[\s-]/g, '');
    const cleanPatientPhone = patient.phone.replace(/[\s-]/g, '');
    if (cleanInputPhone !== cleanPatientPhone && !cleanPatientPhone.endsWith(cleanInputPhone)) {
      throw {
        code: 'PATIENT_NOT_VERIFIED',
        message: 'The phone number provided does not match the patient on file for this booking.',
      };
    }

    const doctor = await this.getDoctorById(appointment.doctorId);

    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date().toISOString();
    if (reason) {
      appointment.reason = appointment.reason ? `${appointment.reason} (Cancelled: ${reason})` : `Cancelled: ${reason}`;
    }

    return { appointment, doctor: doctor!, patient };
  }

  public async cancelAppointmentById(appointmentId: string, reason?: string): Promise<Appointment> {
    const appointment = this.appointments.find(
      (a) => a.id === appointmentId || a.confirmationCode.toUpperCase() === appointmentId.toUpperCase()
    );
    if (!appointment) {
      throw { code: 'NOT_FOUND', message: 'Appointment not found.' };
    }
    if (appointment.status === 'cancelled') {
      throw { code: 'ALREADY_CANCELLED', message: 'Appointment is already cancelled.' };
    }
    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date().toISOString();
    if (reason) {
      appointment.reason = appointment.reason ? `${appointment.reason} (Cancelled: ${reason})` : `Cancelled: ${reason}`;
    }
    const doc = this.doctors.find((d) => d.id === appointment.doctorId);
    const pat = this.patients.find((p) => p.id === appointment.patientId);
    return {
      ...appointment,
      doctorName: doc ? doc.name : 'Unknown Doctor',
      doctorSpecialty: doc ? doc.specialty : '',
      patientName: pat ? pat.name : 'Unknown Patient',
      patientPhone: pat ? pat.phone : '',
    };
  }

  // ==========================================================================
  // DASHBOARD & TELEMETRY METHODS
  // ==========================================================================

  public async getAppointmentsList(): Promise<Appointment[]> {
    return this.appointments.map((a) => {
      const doc = this.doctors.find((d) => d.id === a.doctorId);
      const pat = this.patients.find((p) => p.id === a.patientId);
      return {
        ...a,
        doctorName: doc ? doc.name : 'Unknown Doctor',
        doctorSpecialty: doc ? doc.specialty : '',
        patientName: pat ? pat.name : 'Unknown Patient',
        patientPhone: pat ? pat.phone : '',
      };
    });
  }

  public async getSchedules(): Promise<DoctorScheduleRecord[]> {
    return this.schedules;
  }

  public async getExceptions(): Promise<ScheduleExceptionRecord[]> {
    return this.exceptions;
  }

  public async getCallsList(): Promise<CallRecord[]> {
    return [...this.calls].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public async getCallById(idOrRetellId: string): Promise<{
    call: CallRecord | null;
    toolInvocations: ToolInvocation[];
  }> {
    const call =
      this.calls.find(
        (c) => c.id === idOrRetellId || c.retellCallId === idOrRetellId
      ) || null;

    const invocations = this.toolInvocations.filter(
      (ti) =>
        (call && ti.callId === call.id) ||
        ti.retellCallId === idOrRetellId ||
        (call && ti.retellCallId === call.retellCallId)
    );

    return { call, toolInvocations: invocations };
  }

  public async upsertCall(callData: Partial<CallRecord> & { retellCallId: string }): Promise<CallRecord> {
    let call = this.calls.find((c) => c.retellCallId === callData.retellCallId);
    if (call) {
      Object.assign(call, callData);
    } else {
      call = {
        id: crypto.randomUUID(),
        retellCallId: callData.retellCallId,
        fromNumber: callData.fromNumber || null,
        startedAt: callData.startedAt || new Date().toISOString(),
        endedAt: callData.endedAt || null,
        durationS: callData.durationS || 0,
        transcript: callData.transcript || [],
        recordingUrl: callData.recordingUrl || null,
        disconnectReason: callData.disconnectReason || null,
        analysis: callData.analysis || {},
        createdAt: new Date().toISOString(),
      };
      this.calls.unshift(call);
    }
    return call;
  }

  public async logToolInvocation(data: {
    callId?: string;
    retellCallId?: string;
    toolName: string;
    input: Record<string, any>;
    output: Record<string, any>;
    latencyMs: number;
    errorCode?: string | null;
  }): Promise<ToolInvocation> {
    const record: ToolInvocation = {
      id: crypto.randomUUID(),
      callId: data.callId || null,
      retellCallId: data.retellCallId || null,
      toolName: data.toolName,
      input: data.input,
      output: data.output,
      latencyMs: data.latencyMs,
      errorCode: data.errorCode || null,
      createdAt: new Date().toISOString(),
    };
    this.toolInvocations.unshift(record);
    return record;
  }

  public async getToolInvocations(): Promise<ToolInvocation[]> {
    return this.toolInvocations;
  }

  public async getEvalRuns(): Promise<{ run: EvalRunRecord; results: EvalResultRecord[] }[]> {
    return this.evalRuns.map((run) => ({
      run,
      results: this.evalResults.filter((r) => r.runId === run.id),
    }));
  }

  public async saveEvalRun(runData: {
    scenarioCount: number;
    passedCount: number;
    failedCount: number;
    passRate: number;
    durationMs: number;
    metadata?: Record<string, any>;
    results: Array<Omit<EvalResultRecord, 'id' | 'runId' | 'createdAt'>>;
  }): Promise<EvalRunRecord> {
    const runId = crypto.randomUUID();
    const run: EvalRunRecord = {
      id: runId,
      scenarioCount: runData.scenarioCount,
      passedCount: runData.passedCount,
      failedCount: runData.failedCount,
      passRate: runData.passRate,
      durationMs: runData.durationMs,
      metadata: runData.metadata || {},
      createdAt: new Date().toISOString(),
    };

    this.evalRuns.unshift(run);

    for (const r of runData.results) {
      this.evalResults.push({
        id: crypto.randomUUID(),
        runId,
        scenarioId: r.scenarioId,
        scenarioName: r.scenarioName,
        passed: r.passed,
        turns: r.turns,
        latencyP95Ms: r.latencyP95Ms,
        errorMessage: r.errorMessage || null,
        transcript: r.transcript,
        judgeRationale: r.judgeRationale || null,
        dbState: r.dbState,
        createdAt: new Date().toISOString(),
      });
    }

    return run;
  }
}

// Export singleton instance
export const repository = new CareCallRepository();
