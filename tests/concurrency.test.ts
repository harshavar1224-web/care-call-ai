import { describe, it, expect, beforeEach } from 'vitest';
import { repository } from '../server/db/repository';

describe('Concurrency and Double-Booking Protection Integration Test', () => {
  beforeEach(() => {
    // Reset schema state to baseline seed data
    repository.resetToSeedData();
  });

  it('Guarantees exclusion constraint: two parallel book_appointment calls for the same slot yield exactly one success and one SLOT_TAKEN (23P01)', async () => {
    const doctorId = 'b0000000-0000-0000-0000-000000000001'; // Dr. Rajesh Rao
    // Choose a future slot
    const futureDate = new Date(Date.now() + 86400000 * 5); // 5 days in future
    futureDate.setUTCHours(4, 0, 0, 0); // 09:30 AM IST (04:00 UTC)
    const targetStartsAt = futureDate.toISOString();

    const callerA = {
      doctorId,
      patientName: 'Caller A (Priya)',
      phone: '+919811111111',
      startsAt: targetStartsAt,
      reason: 'Persistent migraine',
    };

    const callerB = {
      doctorId,
      patientName: 'Caller B (Rahul)',
      phone: '+919822222222',
      startsAt: targetStartsAt,
      reason: 'General checkup',
    };

    // Fire both requests in parallel using Promise.allSettled
    const [resultA, resultB] = await Promise.allSettled([
      repository.bookAppointment(callerA),
      repository.bookAppointment(callerB),
    ]);

    const successes = [resultA, resultB].filter((r) => r.status === 'fulfilled');
    const failures = [resultA, resultB].filter((r) => r.status === 'rejected');

    // Exactly one must succeed, and exactly one must fail
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // The successful one receives a confirmation code
    const successVal = (successes[0] as PromiseFulfilledResult<any>).value;
    expect(successVal.appointment.confirmationCode).toMatch(/^APT-\d{4}$/);
    expect(successVal.appointment.status).toBe('booked');

    // The rejected one must have SQLSTATE 23P01 and code SLOT_TAKEN
    const rejectionReason = (failures[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.code).toBe('SLOT_TAKEN');
    expect(rejectionReason.sqlstate).toBe('23P01'); // PostgreSQL exclusion_violation
    expect(rejectionReason.alternativeSlots).toBeDefined();
    expect(rejectionReason.alternativeSlots.length).toBeGreaterThan(0);
  });

  it('Idempotency protection: sending same idempotency_key returns existing booking without duplicate insertion', async () => {
    const doctorId = 'b0000000-0000-0000-0000-000000000001';
    const futureDate = new Date(Date.now() + 86400000 * 6);
    futureDate.setUTCHours(5, 0, 0, 0); // 10:30 AM IST (05:00 UTC)
    const targetStartsAt = futureDate.toISOString();
    const idempotencyKey = 'voice_call_turn_unique_key_999';

    const reqData = {
      doctorId,
      patientName: 'Same Caller Twice',
      phone: '+919833333333',
      startsAt: targetStartsAt,
      reason: 'Consultation',
      idempotencyKey,
    };

    const firstCall = await repository.bookAppointment(reqData);
    expect(firstCall.isExistingIdempotent).toBe(false);

    // Second call with same idempotency key
    const secondCall = await repository.bookAppointment(reqData);
    expect(secondCall.isExistingIdempotent).toBe(true);
    expect(secondCall.appointment.id).toBe(firstCall.appointment.id);
    expect(secondCall.appointment.confirmationCode).toBe(firstCall.appointment.confirmationCode);
  });
});
