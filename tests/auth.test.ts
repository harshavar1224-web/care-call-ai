import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { dashboardApiRouter } from '../server/routes/api';
import { toolsRouter } from '../server/routes/tools';
import http from 'http';

describe('Admin Authentication & Security Flow', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ADMIN_PASSWORD = 'clinic_admin_pass';
    process.env.TOOL_SECRET = 'carecall_super_secret_tool_key_2026';

    const app = express();
    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api/tools', toolsRouter);
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

  it('rejects login with incorrect password with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong_password' }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it('succeeds login with correct password, sets cookie and returns cryptographically signed token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clinic_admin_pass' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.token).not.toBe('authenticated');
    expect(data.token.split('.').length).toBe(2);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeDefined();
  });

  it('strictly rejects the literal placeholder token "authenticated"', async () => {
    const res = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Authorization: 'Bearer authenticated' },
    });
    expect(res.status).toBe(401);
  });

  it('strictly rejects forged or invalid tokens', async () => {
    const res = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidtoken.sig' },
    });
    expect(res.status).toBe(401);
  });

  it('allows access to protected dashboard endpoints with valid signed token or cookie after login', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clinic_admin_pass' }),
    });
    const loginData = await loginRes.json();
    const cookieHeader = loginRes.headers.get('set-cookie') || '';
    const validToken = loginData.token;

    // Access admin patients with cookie
    const adminRes = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Cookie: cookieHeader },
    });
    expect(adminRes.status).toBe(200);
    const adminData = await adminRes.json();
    expect(adminData.patients).toBeDefined();

    // Access admin patients with Authorization Bearer signed token
    const tokenRes = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(tokenRes.status).toBe(200);
  });

  it('prevents patient sessions from accessing admin APIs', async () => {
    // Register a patient
    const regRes = await fetch(`${baseUrl}/api/auth/patient/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Patient',
        email: 'testpatient@example.com',
        phone: '9876543210',
        password: 'password123',
        passwordConfirmation: 'password123',
      }),
    });
    expect(regRes.status).toBe(200);
    const patientCookie = regRes.headers.get('set-cookie') || '';

    // Try accessing admin patients endpoint with patient cookie
    const adminAccessRes = await fetch(`${baseUrl}/api/admin/patients`, {
      headers: { Cookie: patientCookie },
    });
    expect(adminAccessRes.status).toBe(401);
  });

  it('returns 401 on protected endpoints when unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/admin/patients`);
    expect(res.status).toBe(401);
  });

  it('invalidates session on logout', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'clinic_admin_pass' }),
    });
    const cookieHeader = loginRes.headers.get('set-cookie') || '';

    // Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    expect(logoutRes.status).toBe(200);
    const clearCookieHeader = logoutRes.headers.get('set-cookie') || '';

    // Check auth status after logout
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: clearCookieHeader },
    });
    const meData = await meRes.json();
    expect(meData.authenticated).toBe(false);
  });
});
