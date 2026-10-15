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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  const token = typeof window !== 'undefined' ? localStorage.getItem('carecall_auth_token') : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
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
  // Public
  async getPublicClinic(): Promise<{ clinic: ClinicInfo }> {
    return fetchJson('/api/public/clinic');
  },

  async getPublicDoctors(specialty?: string): Promise<{ doctors: Doctor[] }> {
    const params = specialty ? `?specialty=${encodeURIComponent(specialty)}` : '';
    return fetchJson(`/api/public/doctors${params}`);
  },

  async getPublicAvailability(params?: {
    doctorId?: string;
    specialty?: string;
    dateFrom?: string;
    dateTo?: string;
    partOfDay?: string;
  }): Promise<{ availability: Array<{ doctor: Doctor; slots: any[] }> }> {
    const search = new URLSearchParams();
    if (params?.doctorId) search.set('doctorId', params.doctorId);
    if (params?.specialty) search.set('specialty', params.specialty);
    if (params?.dateFrom) search.set('dateFrom', params.dateFrom);
    if (params?.dateTo) search.set('dateTo', params.dateTo);
    if (params?.partOfDay) search.set('partOfDay', params.partOfDay);
    return fetchJson(`/api/public/availability?${search.toString()}`);
  },

  // Patient Auth
  async registerPatient(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    passwordConfirmation: string;
  }): Promise<{ ok: boolean; patient: any }> {
    const res = await fetchJson<any>('/api/auth/patient/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token || res.ok) {
      localStorage.setItem('carecall_auth_token', res.token || 'authenticated');
    }
    return res;
  },

  async loginPatient(data: { emailOrPhone: string; password: string }): Promise<{ ok: boolean; patient: any }> {
    const res = await fetchJson<any>('/api/auth/patient/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token || res.ok) {
      localStorage.setItem('carecall_auth_token', res.token || 'authenticated');
    }
    return res;
  },

  async checkPatientAuth(): Promise<{ authenticated: boolean; user?: any }> {
    return fetchJson('/api/auth/patient/me');
  },

  async logoutPatient(): Promise<void> {
    try {
      await fetchJson('/api/auth/patient/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('carecall_auth_token');
    }
  },

  async getPatientProfile(): Promise<{ ok: boolean; patient: any }> {
    return fetchJson('/api/patient/profile');
  },

  async updatePatientProfile(data: { name: string; email: string; phone: string }): Promise<{ ok: boolean; patient: any }> {
    return fetchJson('/api/patient/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Patient Portal
  async getPatientAppointments(): Promise<{ appointments: Appointment[] }> {
    return fetchJson('/api/patient/appointments');
  },

  async bookPatientAppointment(data: { doctorId: string; startsAt: string; reason?: string }): Promise<{ ok: boolean; appointment: Appointment }> {
    return fetchJson('/api/patient/appointments/book', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async cancelPatientAppointment(id: string, reason?: string): Promise<{ ok: boolean; appointment: Appointment }> {
    return fetchJson(`/api/patient/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Admin Auth
  async adminLogin(password: string, email?: string): Promise<void> {
    const data = await fetchJson<any>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password, email }),
    });
    if (data.token || data.ok) {
      localStorage.setItem('carecall_auth_token', data.token || 'authenticated');
    }
  },

  async checkAdminAuth(): Promise<boolean> {
    try {
      const data = await fetchJson<{ authenticated: boolean }>('/api/auth/admin/me');
      return data.authenticated;
    } catch {
      return false;
    }
  },

  async adminLogout(): Promise<void> {
    try {
      await fetchJson('/api/auth/admin/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('carecall_auth_token');
    }
  },

  // Legacy Admin Methods
  async checkAuth(): Promise<boolean> {
    const data = await fetchJson<{ authenticated: boolean }>('/api/auth/me');
    return data.authenticated;
  },

  async login(password: string): Promise<void> {
    const data = await fetchJson<{ ok: boolean; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (data.token) {
      localStorage.setItem('carecall_auth_token', data.token);
    }
  },

  async logout(): Promise<void> {
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('carecall_auth_token');
    }
  },

  // Admin Data Views
  async getAdminPatients(): Promise<{ patients: any[] }> {
    return fetchJson('/api/admin/patients');
  },

  async getAdminAppointments(filters?: { status?: string; doctorId?: string; query?: string }): Promise<{ appointments: Appointment[] }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.doctorId) params.set('doctorId', filters.doctorId);
    if (filters?.query) params.set('query', filters.query);
    return fetchJson(`/api/admin/appointments?${params.toString()}`);
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
