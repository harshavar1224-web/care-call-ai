export interface Clinic {
  id: string;
  name: string;
  timezone: string;
  phone: string;
  address: string;
  openingTime: string;
  closingTime: string;
  emergencyContact: string;
  createdAt: string;
}

export interface Doctor {
  id: string;
  clinicId: string;
  name: string;
  specialty: string;
  qualification?: string | null;
  slotMinutes: number;
  active: boolean;
  createdAt: string;
}

export interface DoctorScheduleRecord {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface ScheduleExceptionRecord {
  id: string;
  doctorId: string;
  date: string;
  kind: 'off' | 'custom_hours';
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface Patient {
  id: string;
  clinicId: string;
  name: string;
  phone: string;
  email?: string | null;
  passwordHash?: string | null;
  role: 'patient' | 'admin';
  createdAt: string;
}

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  startsAt: string; // ISO UTC
  endsAt: string;   // ISO UTC
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
  reason?: string | null;
  confirmationCode: string;
  source: 'voice' | 'dashboard';
  idempotencyKey?: string | null;
  callId?: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  // Joined fields for API convenience
  doctorName?: string;
  doctorSpecialty?: string;
  patientName?: string;
  patientPhone?: string;
}

export interface CallRecord {
  id: string;
  retellCallId: string;
  fromNumber?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationS?: number | null;
  transcript: Array<{ role: string; content: string }>;
  recordingUrl?: string | null;
  disconnectReason?: string | null;
  analysis: Record<string, any>;
  createdAt: string;
}

export interface ToolInvocation {
  id: string;
  callId?: string | null;
  retellCallId?: string | null;
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
  latencyMs: number;
  errorCode?: string | null;
  createdAt: string;
}

export interface EvalRunRecord {
  id: string;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  passRate: number;
  durationMs: number;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface EvalResultRecord {
  id: string;
  runId: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  turns: number;
  latencyP95Ms: number;
  errorMessage?: string | null;
  transcript: Array<{ role: string; content: string }>;
  judgeRationale?: string | null;
  dbState: Record<string, any>;
  createdAt: string;
}
