import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Retell from 'retell-sdk';
import { repository } from '../db/repository';

export const retellRouter = Router();

// Initialize Retell SDK if API key is present
const retellApiKey = process.env.RETELL_API_KEY;
let retellClient: Retell | null = null;

if (retellApiKey && !retellApiKey.includes('...')) {
  try {
    retellClient = new Retell({ apiKey: retellApiKey });
  } catch (err) {
    console.warn('Could not initialize Retell SDK client:', err);
  }
}

/**
 * Verify Retell Webhook Signature.
 * Retell signs webhooks with HMAC-SHA256 using the API Key.
 */
async function verifyRetellSignature(req: Request): Promise<boolean> {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey || apiKey.includes('...')) {
    // If running in development without live key, allow through
    return true;
  }

  const signature = req.headers['x-retell-signature'] as string;
  if (!signature) {
    return false;
  }

  try {
    // retell-sdk webhook verification
    if (retellClient) {
      return await Retell.verify(
        JSON.stringify(req.body),
        apiKey,
        signature
      );
    }

    // Direct HMAC verification fallback
    const expected = crypto
      .createHmac('sha256', apiKey)
      .update(JSON.stringify(req.body))
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

/**
 * POST /api/webhooks/retell
 * Handles call lifecycle events: call_started, call_ended, call_analyzed.
 */
retellRouter.post('/retell', async (req: Request, res: Response) => {
  const isValid = await verifyRetellSignature(req);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid Retell webhook signature' });
  }

  const { event, call } = req.body;
  if (!call || !call.call_id) {
    return res.status(400).json({ error: 'Missing call object or call_id in webhook payload' });
  }

  const retellCallId = call.call_id;

  try {
    if (event === 'call_started') {
      await repository.upsertCall({
        retellCallId,
        fromNumber: call.from_number || null,
        startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : new Date().toISOString(),
        transcript: [],
        analysis: {},
      });
    } else if (event === 'call_ended') {
      // Format transcript array into clean speaker turns
      const transcriptList = Array.isArray(call.transcript_object)
        ? call.transcript_object.map((t: any) => ({
            role: t.role === 'agent' ? 'agent' : 'user',
            content: t.content,
          }))
        : [];

      await repository.upsertCall({
        retellCallId,
        fromNumber: call.from_number || null,
        startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : undefined,
        endedAt: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : new Date().toISOString(),
        durationS: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
        transcript: transcriptList,
        recordingUrl: call.recording_url || null,
        disconnectReason: call.disconnection_reason || null,
        analysis: call.call_analysis || {},
      });
    } else if (event === 'call_analyzed') {
      await repository.upsertCall({
        retellCallId,
        analysis: call.call_analysis || {},
      });
    }

    return res.json({ received: true, event, retell_call_id: retellCallId });
  } catch (err: any) {
    console.error('Error processing Retell webhook:', err);
    return res.status(500).json({ error: 'Failed to process webhook event' });
  }
});

/**
 * POST /api/calls/web-token
 * Creates a Retell Web Call session and returns the access token for browser audio streaming.
 */
retellRouter.post('/web-token', async (req: Request, res: Response) => {
  const agentId = process.env.RETELL_AGENT_ID || req.body.agent_id;
  const apiKey = process.env.RETELL_API_KEY;

  if (!apiKey || apiKey.includes('...')) {
    return res.status(400).json({
      ok: false,
      error: 'RETELL_API_KEY is not configured in environment variables. Please add your key to test live voice calls.',
    });
  }

  if (!agentId || agentId.includes('...')) {
    return res.status(400).json({
      ok: false,
      error: 'RETELL_AGENT_ID is not configured. Please create an agent in your Retell dashboard and provide the Agent ID.',
    });
  }

  try {
    if (!retellClient) {
      retellClient = new Retell({ apiKey });
    }

    // Call Retell API to create a web call
    const webCallResponse = await retellClient.call.createWebCall({
      agent_id: agentId,
      metadata: {
        source: 'carecall_dashboard_web_client',
      },
    });

    return res.json({
      ok: true,
      access_token: webCallResponse.access_token,
      call_id: webCallResponse.call_id,
    });
  } catch (error: any) {
    console.error('Failed to create Retell web call:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create Retell web call session',
    });
  }
});
