import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { repository, maskPhone } from '../db/repository';

export const toolsRouter = Router();

/**
 * Authentication Middleware using constant-time comparison.
 * Compares X-Tool-Secret against TOOL_SECRET environment variable.
 */
function authenticateToolSecret(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = process.env.TOOL_SECRET;

  // In development without configured secret, allow requests with a default fallback
  if (!configuredSecret) {
    return next();
  }

  const clientSecret = req.header('X-Tool-Secret') || req.header('x-tool-secret');
  if (!clientSecret) {
    return res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication failed. Please provide a valid X-Tool-Secret header.',
    });
  }

  const expectedBuffer = Buffer.from(configuredSecret, 'utf8');
  const clientBuffer = Buffer.from(clientSecret, 'utf8');

  if (
    expectedBuffer.length !== clientBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, clientBuffer)
  ) {
    return res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid X-Tool-Secret.',
    });
  }

  next();
}

toolsRouter.use(authenticateToolSecret);

/**
 * Helper to execute a tool with timing, error handling, voice responses, and audit logging.
 */
async function executeTool(
  req: Request,
  res: Response,
  toolName: string,
  schema: z.ZodType<any>,
  handler: (validatedInput: any) => Promise<{ code?: string; message: string; data?: any }>
) {
  const startTime = Date.now();
  let parsedInput: any = {};
  let retellCallId = req.header('X-Retell-Call-Id') || req.body?.call_id || undefined;

  try {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const latencyMs = Date.now() - startTime;
      const errorMsg = `Invalid request: ${issue.path.join('.')} - ${issue.message}`;

      await repository.logToolInvocation({
        retellCallId,
        toolName,
        input: sanitizeInput(req.body),
        output: { ok: false, code: 'VALIDATION_ERROR', message: errorMsg },
        latencyMs,
        errorCode: 'VALIDATION_ERROR',
      });

      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'I could not process the request because some details were formatted incorrectly.',
        data: { error: errorMsg },
      });
    }

    parsedInput = parseResult.data;
    const result = await handler(parsedInput);
    const latencyMs = Date.now() - startTime;

    await repository.logToolInvocation({
      retellCallId,
      toolName,
      input: sanitizeInput(parsedInput),
      output: { ok: true, code: result.code || 'SUCCESS', message: result.message },
      latencyMs,
    });

    return res.json({
      ok: true,
      code: result.code || 'SUCCESS',
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const errorCode = error.code || 'INTERNAL';
    let voiceMessage = 'I am sorry, something unexpected happened while processing your request.';

    if (errorCode === 'SLOT_TAKEN') {
      voiceMessage = 'That time slot has just been taken by another patient.';
      if (error.alternativeSlots && error.alternativeSlots.length > 0) {
        const altTimes = error.alternativeSlots.map((s: any) => s.humanText).join(', or ');
        voiceMessage += ` Would you like to book ${altTimes} instead?`;
      }
    } else if (errorCode === 'PATIENT_NOT_VERIFIED') {
      voiceMessage = 'The phone number provided does not match the patient registered for this appointment.';
    } else if (errorCode === 'NOT_FOUND') {
      voiceMessage = error.message || 'I could not find the requested record.';
    } else if (errorCode === 'PAST_DATE') {
      voiceMessage = 'We cannot book appointments for dates or times that have already passed.';
    } else if (errorCode === 'DOCTOR_ON_LEAVE') {
      voiceMessage = error.message || 'The doctor is not available on this date due to leave.';
    }

    await repository.logToolInvocation({
      retellCallId,
      toolName,
      input: sanitizeInput(parsedInput),
      output: { ok: false, code: errorCode, message: voiceMessage },
      latencyMs,
      errorCode,
    });

    return res.status(errorCode === 'INTERNAL' ? 500 : 200).json({
      ok: false,
      code: errorCode,
      message: voiceMessage,
      data: {
        sqlstate: error.sqlstate,
        alternativeSlots: error.alternativeSlots,
      },
    });
  }
}

/**
 * Mask sensitive patient phone numbers in audit logs.
 */
function sanitizeInput(input: any): any {
  if (!input || typeof input !== 'object') return input;
  const cloned = { ...input };
  if (cloned.phone) {
    cloned.phone = maskPhone(cloned.phone);
  }
  return cloned;
}

// ============================================================================
// 1. GET CLINIC INFO
// ============================================================================
toolsRouter.post('/get_clinic_info', async (req, res) => {
  await executeTool(
    req,
    res,
    'get_clinic_info',
    z.object({}).optional().default({}),
    async () => {
      const clinic = await repository.getClinicInfo();
      return {
        code: 'CLINIC_INFO',
        message: `${clinic.name} is open Monday through Saturday from 8:00 AM to 8:00 PM at ${clinic.address}. For life-threatening emergencies, please call ${clinic.emergencyContact}.`,
        data: clinic,
      };
    }
  );
});

// ============================================================================
// 2. LIST DOCTORS
// ============================================================================
const ListDoctorsSchema = z.object({
  specialty: z.string().optional(),
});

toolsRouter.post('/list_doctors', async (req, res) => {
  await executeTool(
    req,
    res,
    'list_doctors',
    ListDoctorsSchema,
    async (input) => {
      const doctors = await repository.listDoctors(input.specialty);
      if (doctors.length === 0) {
        return {
          code: 'NO_DOCTORS_FOUND',
          message: input.specialty
            ? `We currently do not have any active doctors for ${input.specialty}.`
            : 'No doctors are currently available at the clinic.',
          data: { doctors: [] },
        };
      }

      const docSummary = doctors
        .map((d) => `${d.name} (${d.specialty})`)
        .slice(0, 3)
        .join(', ');

      return {
        code: 'DOCTORS_LISTED',
        message: `We have ${doctors.length} doctors available, including ${docSummary}.`,
        data: { doctors },
      };
    }
  );
});

// ============================================================================
// 3. CHECK AVAILABILITY
// ============================================================================
const CheckAvailabilitySchema = z.object({
  doctor_id: z.string().optional(),
  specialty: z.string().optional(),
  date_from: z.string(), // "YYYY-MM-DD"
  date_to: z.string(),   // "YYYY-MM-DD"
  part_of_day: z.enum(['morning', 'afternoon', 'evening']).optional(),
});

toolsRouter.post('/check_availability', async (req, res) => {
  await executeTool(
    req,
    res,
    'check_availability',
    CheckAvailabilitySchema,
    async (input) => {
      const results = await repository.checkAvailability({
        doctorId: input.doctor_id,
        specialty: input.specialty,
        dateFrom: input.date_from,
        dateTo: input.date_to,
        partOfDay: input.part_of_day,
      });

      const allSlots = results.flatMap((r) => r.slots).slice(0, 5);

      if (allSlots.length === 0) {
        return {
          code: 'NO_SLOTS_AVAILABLE',
          message: 'I checked the calendar, but there are no open appointment slots for those dates. Would you like to check the following days?',
          data: { slots: [] },
        };
      }

      const slotSpoken = allSlots
        .slice(0, 3)
        .map((s) => s.humanText)
        .join(', or ');

      return {
        code: 'SLOTS_AVAILABLE',
        message: `I have slots available on ${slotSpoken}. Which one works best for you?`,
        data: { slots: allSlots },
      };
    }
  );
});

// ============================================================================
// 4. FIND PATIENT
// ============================================================================
const FindPatientSchema = z.object({
  phone: z.string().min(5),
  name: z.string().optional(),
});

toolsRouter.post('/find_patient', async (req, res) => {
  await executeTool(
    req,
    res,
    'find_patient',
    FindPatientSchema,
    async (input) => {
      const patient = await repository.findPatientByPhone(input.phone);
      if (!patient) {
        return {
          code: 'PATIENT_NOT_FOUND',
          message: `I do not see an existing file for phone number ending in ${input.phone.slice(-4)}. I can register you right now as a new patient.`,
          data: { found: false },
        };
      }

      return {
        code: 'PATIENT_FOUND',
        message: `Welcome back, ${patient.name}. I found your patient record.`,
        data: { found: true, patient },
      };
    }
  );
});

// ============================================================================
// 5. BOOK APPOINTMENT (ATOMIC & EXCLUSION-PROTECTED)
// ============================================================================
const BookAppointmentSchema = z.object({
  doctor_id: z.string(),
  patient_name: z.string().min(2),
  phone: z.string().min(6),
  starts_at: z.string(), // ISO 8601 UTC
  reason: z.string().optional(),
  idempotency_key: z.string().optional(),
  source: z.enum(['voice', 'dashboard']).optional().default('voice'),
});

toolsRouter.post('/book_appointment', async (req, res) => {
  await executeTool(
    req,
    res,
    'book_appointment',
    BookAppointmentSchema,
    async (input) => {
      const result = await repository.bookAppointment({
        doctorId: input.doctor_id,
        patientName: input.patient_name,
        phone: input.phone,
        startsAt: input.starts_at,
        reason: input.reason,
        idempotencyKey: input.idempotency_key,
        source: input.source,
      });

      const { appointment, doctor, isExistingIdempotent } = result;

      if (isExistingIdempotent) {
        return {
          code: 'APPOINTMENT_ALREADY_CONFIRMED',
          message: `Your appointment with ${doctor.name} is already confirmed under reference code ${appointment.confirmationCode}.`,
          data: { appointment, confirmationCode: appointment.confirmationCode },
        };
      }

      return {
        code: 'APPOINTMENT_BOOKED',
        message: `Your appointment with ${doctor.name} is confirmed! Your confirmation code is ${appointment.confirmationCode}.`,
        data: {
          appointmentId: appointment.id,
          confirmationCode: appointment.confirmationCode,
          doctorName: doctor.name,
          startsAt: appointment.startsAt,
        },
      };
    }
  );
});

// ============================================================================
// 6. RESCHEDULE APPOINTMENT
// ============================================================================
const RescheduleAppointmentSchema = z.object({
  confirmation_code: z.string().min(3),
  phone: z.string().min(6),
  new_starts_at: z.string(),
});

toolsRouter.post('/reschedule_appointment', async (req, res) => {
  await executeTool(
    req,
    res,
    'reschedule_appointment',
    RescheduleAppointmentSchema,
    async (input) => {
      const result = await repository.rescheduleAppointment({
        confirmationCode: input.confirmation_code,
        phone: input.phone,
        newStartsAt: input.new_starts_at,
      });

      return {
        code: 'APPOINTMENT_RESCHEDULED',
        message: `Your appointment with ${result.doctor.name} has been successfully rescheduled under code ${result.appointment.confirmationCode}.`,
        data: {
          appointment: result.appointment,
          confirmationCode: result.appointment.confirmationCode,
        },
      };
    }
  );
});

// ============================================================================
// 7. CANCEL APPOINTMENT
// ============================================================================
const CancelAppointmentSchema = z.object({
  confirmation_code: z.string().min(3),
  phone: z.string().min(6),
  reason: z.string().optional(),
});

toolsRouter.post('/cancel_appointment', async (req, res) => {
  await executeTool(
    req,
    res,
    'cancel_appointment',
    CancelAppointmentSchema,
    async (input) => {
      const result = await repository.cancelAppointment({
        confirmationCode: input.confirmation_code,
        phone: input.phone,
        reason: input.reason,
      });

      return {
        code: 'APPOINTMENT_CANCELLED',
        message: `Your appointment ${result.appointment.confirmationCode} has been cancelled. Let us know if you need to rebook at any time.`,
        data: {
          confirmationCode: result.appointment.confirmationCode,
          status: 'cancelled',
        },
      };
    }
  );
});
