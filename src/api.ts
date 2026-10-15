import {
  ClinicInfo,
  Doctor,
  DoctorSchedule,
  ScheduleException,
  Appointment,
  CallItem,
  ToolInvocation,
  OverviewData,
  EnvCheckItem,
  EvalRun,
  EvalResult,
} from './types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch (e) {
      errorData = { error: res.statusText };
    }
    const err: any = new Error(errorData.error || errorData.message || `Request failed with status ${res.status}`);
    err.status = res.status;
    err.code = errorData.code;
    err.data = errorData;
    throw err;
  }

  return res.json();
}

export const api = {
  // Auth
  async checkAuth(): Promise<boolean> {
    const data = await fetchJson<{ authenticated: boolean }>('/api/auth/me');
    return data.authenticated;
  },

  async login(password: string): Promise<void> {
    await fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  async logout(): Promise<void> {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  },

  // Health
  async getHealth() {
    return fetchJson<{
      status: string;
      database: {
        mode: string;
        status: string;
        doctorsCount: number;
        appointmentsCount: number;
        exclusionConstraintActive: boolean;
      };
      timezone: string;
    }>('/api/health');
  },

  // Overview
  async getOverview(): Promise<OverviewData> {
    return fetchJson<OverviewData>('/api/dashboard/overview');
  },

  // Schedules
  async getSchedules(): Promise<{
    doctors: Doctor[];
    schedules: DoctorSchedule[];
    exceptions: ScheduleException[];
    appointments: Appointment[];
  }> {
    return fetchJson('/api/schedules');
  },

  async manualBookAppointment(data: {
    doctorId: string;
    patientName: string;
    phone: string;
    startsAt: string;
    reason?: string;
  }): Promise<{ ok: boolean; appointment: Appointment }> {
    return fetchJson('/api/appointments/manual-book', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Appointments
  async getAppointments(filters?: { status?: string; doctorId?: string; query?: string }): Promise<{ appointments: Appointment[] }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.doctorId) params.set('doctorId', filters.doctorId);
    if (filters?.query) params.set('query', filters.query);

    return fetchJson(`/api/appointments?${params.toString()}`);
  },

  // Calls
  async getCalls(): Promise<{ calls: CallItem[] }> {
    return fetchJson('/api/calls');
  },

  async getCallDetails(id: string): Promise<{ call: CallItem; toolInvocations: ToolInvocation[] }> {
    return fetchJson(`/api/calls/${id}`);
  },

  // Retell Live Token
  async getWebCallToken(agentId?: string): Promise<{ ok: boolean; access_token: string; call_id: string }> {
    return fetchJson('/api/calls/web-token', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    });
  },

  // Evals
  async getEvalRuns(): Promise<{ runs: Array<{ run: EvalRun; results: EvalResult[] }> }> {
    return fetchJson('/api/evals');
  },

  async runEvalSuite(scenarioId?: string): Promise<{ ok: boolean; run: any }> {
    return fetchJson('/api/evals/run', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    });
  },

  // Settings
  async getSettings(): Promise<{
    clinic: ClinicInfo;
    envChecklist: EnvCheckItem[];
    databaseStatus: string;
  }> {
    return fetchJson('/api/settings');
  },
};
