import React, { useEffect, useState } from 'react';
import {
  PhoneCall,
  Clock,
  Sparkles,
  ArrowRight,
  User,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../api';
import { CallItem, ToolInvocation } from '../types';
import { TableSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

export const Calls: React.FC = () => {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallItem | null>(null);
  const [toolInvocations, setToolInvocations] = useState<ToolInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalls = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCalls();
      setCalls(res.calls);
      if (res.calls.length > 0 && !selectedCall) {
        loadCallDetail(res.calls[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load call logs');
    } finally {
      setLoading(false);
    }
  };

  const loadCallDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api.getCallDetails(id);
      setSelectedCall(res.call);
      setToolInvocations(res.toolInvocations);
    } catch (err: any) {
      console.error('Failed to load call detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const getOutcomeBadge = (call: CallItem) => {
    const isBooked = call.analysis?.booking_successful;
    if (isBooked) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Booked</span>
        </span>
      );
    }
    if (call.disconnectReason === 'user_hangup') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <Clock className="w-3.5 h-3.5" />
          <span>Completed Inquiry</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <HelpCircle className="w-3.5 h-3.5" />
        <span>General</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadCalls} />
      ) : calls.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No Voice Calls Recorded"
          description="Inbound calls through Retell or the Live Demo simulator will appear here with full audio recordings and transcripts."
          actionText="Open Live Demo"
          onAction={() => (window.location.href = '/live-demo')}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Call List Column (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recorded Calls</h3>
              <span className="text-xs font-mono text-slate-400">{calls.length} logs</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {calls.map((c) => {
                const isSelected = selectedCall?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => loadCallDetail(c.id)}
                    className={`p-4 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                      isSelected ? 'bg-teal-50/60 border-l-2 border-teal-600' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold text-slate-900">
                        {c.fromNumber || 'Simulator Web Client'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {c.durationS || 0}s
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div>{getOutcomeBadge(c)}</div>
                      <span className="text-[11px] text-slate-400">
                        {new Intl.DateTimeFormat('en-US', {
                          timeZone: 'Asia/Kolkata',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(c.startedAt || c.createdAt))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Call Detail & Transcript Column (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {detailLoading ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center text-xs text-slate-400 animate-pulse">
                Loading call transcript and tool timeline...
              </div>
            ) : selectedCall ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-6">
                {/* Detail Header */}
                <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-teal-700 tracking-wider">
                      Call Session Details
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                      {selectedCall.retellCallId}
                    </h3>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>{selectedCall.fromNumber || 'Web Simulator'}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono tabular-nums">{selectedCall.durationS || 0} seconds</span>
                      <span className="text-slate-300">·</span>
                      <span className="capitalize">{selectedCall.disconnectReason || 'Normal hangup'}</span>
                    </div>
                  </div>

                  {selectedCall.recordingUrl && (
                    <a
                      href={selectedCall.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-slate-600" />
                      <span>Audio Recording</span>
                    </a>
                  )}
                </div>

                {/* Speaker Transcript */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>Speaker-Labelled Transcript</span>
                  </h4>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-72 overflow-y-auto">
                    {selectedCall.transcript.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No transcript recorded for this session.</p>
                    ) : (
                      selectedCall.transcript.map((t, idx) => (
                        <div key={idx} className="text-xs flex gap-3">
                          <span
                            className={`font-semibold shrink-0 w-14 ${
                              t.role === 'agent' ? 'text-teal-700' : 'text-slate-900'
                            }`}
                          >
                            {t.role === 'agent' ? 'Maya:' : 'Caller:'}
                          </span>
                          <span className="text-slate-700 leading-relaxed">{t.content}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Tool Invocations Timeline */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span>Tool Invocations & Latency</span>
                  </h4>

                  <div className="space-y-2">
                    {toolInvocations.length === 0 ? (
                      <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg">
                        No external tool invocations were triggered during this call.
                      </p>
                    ) : (
                      toolInvocations.map((ti) => (
                        <div
                          key={ti.id}
                          className="p-3 rounded-lg border border-slate-200 bg-white text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-teal-800 text-[11px]">
                              {ti.toolName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {ti.latencyMs}ms
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            <span className="font-medium text-slate-700">Response: </span>
                            {ti.output?.message || JSON.stringify(ti.output)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
