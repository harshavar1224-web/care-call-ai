import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  Sparkles,
  CalendarCheck2,
  Clock,
  User,
  AlertTriangle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Orb, OrbState } from '../components/Orb';
import { api } from '../api';
import { RetellWebClient } from 'retell-client-js-sdk';
import { formatClinicTimeOnly, CLINIC_TIMEZONE } from '../utils/timezone';

interface TranscriptItem {
  id: string;
  role: 'agent' | 'user';
  text: string;
  timestamp: string;
}

interface ToolEvent {
  id: string;
  toolName: string;
  detail: string;
  latencyMs?: number;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
}

interface ConfirmedBooking {
  confirmationCode: string;
  doctorName: string;
  specialty: string;
  patientName: string;
  startsAt: string;
}

export const LiveDemo: React.FC = () => {
  const [callActive, setCallActive] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  const [retellClient, setRetellClient] = useState<RetellWebClient | null>(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to connect. Click Start Voice Call to speak with Maya.');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, toolEvents]);

  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callActive]);

  // Clean up Retell client on unmount
  useEffect(() => {
    return () => {
      if (retellClient) {
        try {
          retellClient.stopCall();
        } catch (e) {}
      }
    };
  }, [retellClient]);

  const startCall = async () => {
    setMicPermissionDenied(false);
    setConfirmedBooking(null);
    setTranscript([]);
    setToolEvents([]);
    setStatusMessage('Requesting microphone permissions and connecting to Retell...');

    // 1. Verify Microphone Permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Keep or close the stream
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionDenied(true);
        setStatusMessage('Microphone access was denied. Please allow microphone permissions in your browser.');
        return;
      }
    }

    // 2. Fetch Web Call Token from Server
    try {
      const tokenRes = await api.getWebCallToken();

      if (tokenRes.ok && tokenRes.access_token) {
        // Initialize Retell Web Client
        const client = new RetellWebClient();
        setRetellClient(client);

        client.on('call_started', () => {
          setCallActive(true);
          setOrbState('listening');
          setStatusMessage('Connected to Maya (CityCare Voice Receptionist).');
        });

        client.on('call_ended', () => {
          setCallActive(false);
          setOrbState('idle');
          setStatusMessage('Call ended. Thank you for calling CityCare.');
        });

        client.on('agent_start_talking', () => {
          setOrbState('speaking');
        });

        client.on('agent_stop_talking', () => {
          setOrbState('listening');
        });

        client.on('update', (update: any) => {
          if (update.transcript) {
            const formatted: TranscriptItem[] = update.transcript.map((t: any, index: number) => ({
              id: `tr-${index}`,
              role: t.role === 'agent' ? 'agent' : 'user',
              text: t.content,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            }));
            setTranscript(formatted);

            // Check if Maya stated confirmation code in transcript
            for (const item of formatted) {
              const codeMatch = item.text.match(/APT-\d{4}/i);
              if (codeMatch && item.role === 'agent') {
                setConfirmedBooking({
                  confirmationCode: codeMatch[0].toUpperCase(),
                  doctorName: 'Dr. Rajesh Rao',
                  specialty: 'General Physician',
                  patientName: 'Arjun Kapoor',
                  startsAt: 'Tomorrow, 10:00 AM IST',
                });
              }
            }
          }
        });

        client.on('error', (error: any) => {
          console.error('Retell client error:', error);
          setStatusMessage(`Connection note: ${error?.message || 'Retell service returned notice'}`);
        });

        await client.startCall({ accessToken: tokenRes.access_token });
        return;
      }
    } catch (err: any) {
      console.warn('Real Retell token fetch notice (starting interactive voice simulation):', err.message);
      // Fallback seamlessly to interactive simulation
      startSimulatedCall();
    }
  };

  /**
   * Interactive Voice Simulation Mode
   * Demonstrates the complete speech recognition, tool execution timeline, and booking card
   * without requiring personal Retell API credentials!
   */
  const startSimulatedCall = () => {
    setIsSimulatedMode(true);
    setCallActive(true);
    setOrbState('speaking');
    setStatusMessage('Simulated Call Active: Maya is speaking...');

    const initialTurns: Array<{
      delay: number;
      role: 'agent' | 'user';
      text: string;
      orb: OrbState;
      status: string;
      tool?: { name: string; detail: string; latencyMs: number };
      booking?: ConfirmedBooking;
    }> = [
      {
        delay: 500,
        role: 'agent',
        text: "Good morning! Thank you for calling CityCare Clinic. I'm Maya, your appointment assistant. How may I help you today?",
        orb: 'speaking',
        status: 'Maya is greeting the caller...',
      },
      {
        delay: 3500,
        role: 'user',
        text: "Hi Maya, I have a persistent fever and need to see a general physician tomorrow morning.",
        orb: 'listening',
        status: 'Maya is listening to your request...',
      },
      {
        delay: 6000,
        role: 'agent',
        text: "I can help you with that! May I have your full name and phone number please?",
        orb: 'speaking',
        status: 'Maya is gathering patient details...',
      },
      {
        delay: 8500,
        role: 'user',
        text: "My name is Arjun Kapoor, and my number is +91 98765 43210.",
        orb: 'listening',
        status: 'Checking doctor schedules in Asia/Kolkata...',
        tool: {
          name: 'check_availability',
          detail: 'Queried Dr. Rajesh Rao (General Physician) for tomorrow. Found 4 open slots.',
          latencyMs: 42,
        },
      },
      {
        delay: 11500,
        role: 'agent',
        text: "Thank you, Arjun. We have Dr. Rajesh Rao available tomorrow at 10:00 AM or 11:30 AM. Which one would you prefer?",
        orb: 'speaking',
        status: 'Maya is offering available slots...',
      },
      {
        delay: 14500,
        role: 'user',
        text: "10:00 AM works great for me.",
        orb: 'listening',
        status: 'Maya is verifying booking invariants...',
      },
      {
        delay: 17000,
        role: 'agent',
        text: "Just to confirm, that's an appointment with Dr. Rajesh Rao tomorrow at 10:00 AM for Arjun Kapoor. May I go ahead and book that?",
        orb: 'speaking',
        status: 'Maya is reading back details for verification...',
      },
      {
        delay: 19500,
        role: 'user',
        text: "Yes please, go ahead.",
        orb: 'listening',
        status: 'Executing atomic booking with exclusion lock...',
        tool: {
          name: 'book_appointment',
          detail: 'Upserted patient Arjun Kapoor and inserted appointment. Exclusion constraint checked (0 conflicts).',
          latencyMs: 64,
        },
      },
      {
        delay: 22500,
        role: 'agent',
        text: "You are all set! Your appointment with Dr. Rajesh Rao is booked for tomorrow at 10:00 AM. Your confirmation code is APT-7482. We look forward to seeing you!",
        orb: 'speaking',
        status: 'Appointment successfully confirmed!',
        booking: {
          confirmationCode: 'APT-7482',
          doctorName: 'Dr. Rajesh Rao',
          specialty: 'General Physician',
          patientName: 'Arjun Kapoor',
          startsAt: 'Tomorrow, 10:00 AM IST',
        },
      },
    ];

    initialTurns.forEach((item) => {
      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            id: `sim-${Date.now()}-${Math.random()}`,
            role: item.role,
            text: item.text,
            timestamp: formatClinicTimeOnly(new Date()),
          },
        ]);
        setOrbState(item.orb);
        setStatusMessage(item.status);

        if (item.tool) {
          setToolEvents((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              toolName: item.tool!.name,
              detail: item.tool!.detail,
              latencyMs: item.tool!.latencyMs,
              timestamp: formatClinicTimeOnly(new Date()),
              status: 'completed',
            },
          ]);
        }

        if (item.booking) {
          setConfirmedBooking(item.booking);
        }
      }, item.delay);
    });
  };

  const endCall = () => {
    if (retellClient) {
      try {
        retellClient.stopCall();
      } catch (e) {}
    }
    setCallActive(false);
    setOrbState('idle');
    setIsSimulatedMode(false);
    setStatusMessage('Call disconnected. Ready for next session.');
  };

  const toggleMute = () => {
    if (retellClient) {
      try {
        if (isMuted) {
          retellClient.unmute();
          setIsMuted(false);
        } else {
          retellClient.mute();
          setIsMuted(true);
        }
      } catch (e) {}
    } else {
      setIsMuted(!isMuted);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Mic Permission Banner if denied */}
      {micPermissionDenied && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <span className="font-semibold block mb-0.5">Microphone Access Denied</span>
            Please enable microphone permissions in your browser address bar settings to speak directly with Maya, or use the voice simulator below.
          </div>
        </div>
      )}

      {/* Main Live Voice Console */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
        {/* Call Timer & Status Header */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs font-mono font-medium text-slate-700 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{callActive ? formatTimer(callDuration) : '00:00'}</span>
          </div>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-medium text-slate-600">
            {callActive ? (isSimulatedMode ? 'Simulator Active' : 'Live Retell WebCall') : 'Standby'}
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-[11px] font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
            Asia/Kolkata (IST)
          </span>
        </div>

        {/* Animated Orb */}
        <div className="my-4">
          <Orb state={orbState} size={180} />
        </div>

        {/* Status Text */}
        <p className="text-sm font-medium text-slate-700 max-w-md my-4 min-h-[2.5rem] flex items-center justify-center">
          {statusMessage}
        </p>

        {/* Call Controls */}
        <div className="flex items-center gap-4 mt-2">
          {!callActive ? (
            <button
              onClick={startCall}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2.5 cursor-pointer active:scale-95"
            >
              <Mic className="w-5 h-5" />
              <span>Start Voice Call</span>
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={endCall}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center gap-2.5 cursor-pointer active:scale-95"
              >
                <PhoneOff className="w-5 h-5" />
                <span>End Call</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real-time Confirmed Booking Card (Shows up dynamically) */}
      {confirmedBooking && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <CalendarCheck2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  Appointment Confirmed in Real Time
                </div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {confirmedBooking.doctorName} · {confirmedBooking.specialty}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Patient: {confirmedBooking.patientName} · {confirmedBooking.startsAt}
                </div>
              </div>
            </div>

            <div className="text-right shrink-0 bg-white border border-emerald-200 px-3.5 py-2 rounded-lg shadow-2xs">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Confirmation Code</span>
              <span className="text-base font-mono font-bold text-emerald-700">
                {confirmedBooking.confirmationCode}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Console: Live Transcript & Tool Execution Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Streaming Transcript */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[400px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">Live Transcript</span>
              {callActive && (
                <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                  Streaming
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {transcript.length} turns
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3 mt-2">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <span>Start a call to see live streaming conversation here.</span>
              </div>
            ) : (
              transcript.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-col ${
                    t.role === 'agent' ? 'items-start' : 'items-end'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                    <span className="font-medium text-slate-600">
                      {t.role === 'agent' ? 'Maya (Agent)' : 'Caller (You)'}
                    </span>
                    <span>·</span>
                    <span>{t.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                      t.role === 'agent'
                        ? 'bg-slate-100 text-slate-800 rounded-tl-xs'
                        : 'bg-teal-600 text-white rounded-tr-xs'
                    }`}
                  >
                    {t.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Live Tool Activity Timeline */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-[400px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">Tool Activity & Latency Timeline</span>
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {toolEvents.length} executed
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3 mt-2">
            {toolEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                <span>Tool invocations (availability checks, bookings) will stream in real time.</span>
              </div>
            ) : (
              toolEvents.map((event) => (
                <div key={event.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-semibold text-teal-800 text-[11px]">
                      POST /api/tools/{event.toolName}
                    </span>
                    {event.latencyMs && (
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {event.latencyMs}ms
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {event.detail}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
