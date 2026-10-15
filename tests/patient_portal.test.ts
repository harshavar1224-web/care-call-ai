import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { dashboardApiRouter } from '../server/routes/api';
import http from 'http';

describe('Patient & Admin Portal Security and Role Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ADMIN_PASSWORD = 'clinic_admin_pass';
    const app = express();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', dashboardApiRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('1 & 6. Patient can register with role enforcement (cannot self-assign admin) and log in', async () => {
    // Attempt registration trying to self-assign admin role should fail or be forced to patient
    const badReg = await fetch(`${baseUrl}/api/auth/patient/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hacker Patient',
        email: 'hacker@example.com',
        phone: '+919999999991',
        password: 'password123',
        passwordConfirmation: 'password123',
        role: 'admin',
      }),
    });
    expect(badReg.status).toBe(403);

    // Valid patient registration
    const regRes = await fetch(`${baseUrl}/api/auth/patient/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Patient',
        email: 'testpatient@example.com',
        phone: '+919888877777',
        password: 'password123',
        passwordConfirmation: 'password123',
      }),
    });
    expect(regRes.status).toBe(200);
    const regData = await regRes.json();
    expect(regData.ok).toBe(true);
    expect(regData.patient.role).toBe('patient');
    const cookieHeader = regRes.headers.get('set-cookie') || '';

    // Verify /auth/patient/me
    const meRes = await fetch(`${baseUrl}/api/auth/patient/me`, {
      headers: { Cookie: cookieHeader },
    });
    const meData = await meRes.json();
    expect(meData.authenticated).toBe(true);
    expect(meData.user.role).toBe('patient');
  });

  it('2 & 3. Patient can view availability and book an appointment, then view own appointments', async () => {
    // Login as patient Arjun Kapoor (seeded)
    const loginRes = await fetch(`${baseUrl}/api/auth/patient/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'arjun@example.com', password: 'password123' }),
    });
    expect(loginRes.status).toBe(200);
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    // Check availability
    const availRes = await fetch(`${baseUrl}/api/public/availability`);
    expect(availRes.status).toBe(200);
    const availData = await availRes.json();
    expect(availData.availability).toBeDefined();

    const doctorId = 'b0000000-0000-0000-0000-000000000001';
    // Book appointment for a future date/time
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString();
    const bookRes = await fetch(`${baseUrl}/api/patient/appointments/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        doctorId,
        startsAt: futureDate,
        reason: 'Routine checkup test',
      }),
    });

    expect(bookRes.status).toBe(200);
    const bookData = await bookRes.json();
    expect(bookData.ok).toBe(true);
    expect(bookData.appointment.confirmationCode).toBeDefined();

    // View own appointments
    const apptsRes = await fetch(`${baseUrl}/api/patient/appointments`, {
      headers: { Cookie: cookieHeader },
    });
    expect(apptsRes.status).toBe(200);
    const apptsData = await apptsRes.json();
    expect(Array.isArray(apptsData.appointments)).toBe(true);
    expect(apptsData.appointments.length).toBeGreaterThan(0);
  });

  it('5. Patient cannot access admin APIs', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/patient/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'arjun@example.com', password: 'password123' }),
    });
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    const adminRes = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Cookie: cookieHeader },
    });
    expect(adminRes.status).toBe(401);
  });

  it('Patient can view and update their profile', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/patient/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'arjun@example.com', password: 'password123' }),
    });
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    const getProfile = await fetch(`${baseUrl}/api/patient/profile`, {
      headers: { Cookie: cookieHeader },
    });
    expect(getProfile.status).toBe(200);
    const profileData = await getProfile.json();
    expect(profileData.patient.name).toBe('Arjun Kapoor');

    const updateRes = await fetch(`${baseUrl}/api/patient/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ name: 'Arjun K. Updated', email: 'arjun.updated@example.com', phone: '+919876543210' }),
    });
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.patient.name).toBe('Arjun K. Updated');
    expect(updateData.patient.email).toBe('arjun.updated@example.com');
  });

  it('Patient can book and successfully cancel their appointment, and handle already-cancelled rejection', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/patient/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'neha@example.com', password: 'password123' }),
    });
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    // Book appointment
    const futureDate = new Date(Date.now() + 86400000 * 4).toISOString();
    const bookRes = await fetch(`${baseUrl}/api/patient/appointments/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ doctorId: 'b0000000-0000-0000-0000-000000000001', startsAt: futureDate, reason: 'Cancel test' }),
    });
    expect(bookRes.status).toBe(200);
    const bookData = await bookRes.json();
    const aptId = bookData.appointment.id;

    // Cancel appointment
    const cancelRes = await fetch(`${baseUrl}/api/patient/appointments/${aptId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reason: 'Patient changed mind' }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelData = await cancelRes.json();
    expect(cancelData.appointment.status).toBe('cancelled');

    // Trying to cancel again should be rejected (already cancelled)
    const cancelAgainRes = await fetch(`${baseUrl}/api/patient/appointments/${aptId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ reason: 'Try again' }),
    });
    expect(cancelAgainRes.status).toBe(400);
  });

  it('7. Administrator can access authorized all-patient and all-appointment views', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clinic_admin_pass' }),
    });
    expect(adminLogin.status).toBe(200);
    const cookieHeader = adminLogin.headers.get('set-cookie') || '';

    const patientsRes = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Cookie: cookieHeader },
    });
    expect(patientsRes.status).toBe(200);
    const patientsData = await patientsRes.json();
    expect(patientsData.patients.length).toBeGreaterThan(0);

    const appointmentsRes = await fetch(`${baseUrl}/api/admin/appointments`, {
      headers: { Cookie: cookieHeader },
    });
    expect(appointmentsRes.status).toBe(200);
    const apptsData = await appointmentsRes.json();
    expect(Array.isArray(apptsData.appointments)).toBe(true);
  });

  it('8 & 9. Unauthenticated requests are rejected and logout invalidates session', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/patient/appointments`);
    expect(unauthRes.status).toBe(401);

    const loginRes = await fetch(`${baseUrl}/api/auth/patient/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone: 'arjun@example.com', password: 'password123' }),
    });
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    const logoutRes = await fetch(`${baseUrl}/api/auth/patient/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    expect(logoutRes.status).toBe(200);

    const meRes = await fetch(`${baseUrl}/api/auth/patient/me`, {
      headers: { Cookie: logoutRes.headers.get('set-cookie') || '' },
    });
    const meData = await meRes.json();
    expect(meData.authenticated).toBe(false);
  });
});
