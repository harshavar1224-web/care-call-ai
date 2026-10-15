import React, { useEffect, useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  BarChart3,
  FileText,
  Database,
  AlertTriangle,
  RotateCcw,
  X,
} from 'lucide-react';
import { api } from '../api';
import { EvalRun, EvalResult } from '../types';
import { TableSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

export const Evals: React.FC = () => {
  const [runs, setRuns] = useState<Array<{ run: EvalRun; results: EvalResult[] }>>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedResult, setSelectedResult] = useState<EvalResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [runningSuite, setRunningSuite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEvalRuns();
      setRuns(res.runs);
      if (res.runs.length > 0 && !selectedRunId) {
        setSelectedRunId(res.runs[0].run.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load evaluation history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvals();
  }, []);

  const handleRunSuite = async (scenarioId?: string) => {
    setRunningSuite(true);
    setError(null);
    try {
      await api.runEvalSuite(scenarioId);
      await loadEvals();
    } catch (err: any) {
      setError(err.message || 'Failed to execute evaluation suite');
    } finally {
      setRunningSuite(false);
    }
  };

  const activeRunData = runs.find((r) => r.run.id === selectedRunId) || runs[0];

  return (
    <div className="space-y-6">
      {/* Header with Run Suite Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            CareCall Evaluation Harness (Part B)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            18 clinical and conversational scenarios evaluated with Gemini caller simulation and judge rubrics.
          </p>
        </div>

        <button
          onClick={() => handleRunSuite()}
          disabled={runningSuite}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
        >
          {runningSuite ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Running Suite (18 Scenarios)...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Run Evaluation Suite</span>
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <TableSkeleton rows={6} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadEvals} />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No Evaluation Runs Found"
          description="Click Run Evaluation Suite to test all 18 clinical scenarios against Maya and inspect the pass rate report."
          actionText="Run First Evaluation"
          onAction={() => handleRunSuite()}
        />
      ) : (
        <>
          {/* Active Run Overview Cards */}
          {activeRunData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-medium text-slate-500 block mb-1">Pass Rate</span>
                <div className="text-2xl font-bold font-mono text-teal-700 tabular-nums">
                  {activeRunData.run.passRate}%
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {activeRunData.run.passedCount} passed / {activeRunData.run.failedCount} failed
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-medium text-slate-500 block mb-1">Scenarios Evaluated</span>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {activeRunData.run.scenarioCount}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">100% test matrix coverage</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-medium text-slate-500 block mb-1">Total Duration</span>
                <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  {(activeRunData.run.durationMs / 1000).toFixed(2)}s
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Isolated schema resets per test</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-medium text-slate-500 block mb-1">Selected Run Session</span>
                <select
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 font-mono text-slate-700 focus:outline-none"
                >
                  {runs.map((r) => (
                    <option key={r.run.id} value={r.run.id}>
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: 'Asia/Kolkata',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(r.run.createdAt))}{' '}
                      — {r.run.passRate}% Pass
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Historical runs saved</p>
              </div>
            </div>
          )}

          {/* Scenario Results Table */}
          {activeRunData && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Scenario Breakdown</h3>
                <span className="text-xs text-slate-500">
                  Click any row to inspect conversation transcript, DB assertions, and judge rationale.
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold">
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Scenario</th>
                      <th className="py-3 px-4">Identifier</th>
                      <th className="py-3 px-4 text-center">Turns</th>
                      <th className="py-3 px-4 text-right">Latency p95</th>
                      <th className="py-3 px-4">Judge Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeRunData.results.map((res) => (
                      <tr
                        key={res.id}
                        onClick={() => setSelectedResult(res)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        {/* Status */}
                        <td className="py-3 px-4">
                          {res.passed ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Pass</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                              <XCircle className="w-4 h-4 text-rose-600" />
                              <span>Fail</span>
                            </span>
                          )}
                        </td>

                        {/* Scenario Name */}
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {res.scenarioName}
                        </td>

                        {/* ID */}
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {res.scenarioId}
                        </td>

                        {/* Turns */}
                        <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-700">
                          {res.turns}
                        </td>

                        {/* Latency */}
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {res.latencyP95Ms}ms
                        </td>

                        {/* Judge Rationale */}
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {res.judgeRationale || 'Invariants verified'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Drill-Down Modal */}
          {selectedResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
              <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 space-y-5">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {selectedResult.scenarioName}
                      </span>
                      {selectedResult.passed ? (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          Passed
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                          Failed
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-slate-400">
                      ID: {selectedResult.scenarioId} · {selectedResult.turns} turns · p95: {selectedResult.latencyP95Ms}ms
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedResult(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Judge Rationale Banner */}
                <div
                  className={`p-3.5 rounded-lg text-xs border ${
                    selectedResult.passed
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <span className="font-bold block mb-1">Judge Assessment:</span>
                  <p className="leading-relaxed">{selectedResult.judgeRationale}</p>
                  {selectedResult.errorMessage && (
                    <p className="mt-1 font-mono text-[11px] font-semibold text-rose-700">
                      Error: {selectedResult.errorMessage}
                    </p>
                  )}
                </div>

                {/* DB End State */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Database className="w-3.5 h-3.5 text-teal-600" />
                    <span>Database Verification End-State</span>
                  </span>
                  <pre className="font-mono text-[11px] text-slate-600 overflow-x-auto">
                    {JSON.stringify(selectedResult.dbState, null, 2)}
                  </pre>
                </div>

                {/* Full Transcript */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-600" />
                    <span>Evaluation Transcript</span>
                  </h4>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-60 overflow-y-auto text-xs">
                    {selectedResult.transcript.map((t, idx) => (
                      <div key={idx} className="flex gap-2.5">
                        <span
                          className={`font-semibold shrink-0 w-14 ${
                            t.role === 'agent' ? 'text-teal-700' : 'text-slate-900'
                          }`}
                        >
                          {t.role === 'agent' ? 'Maya:' : 'Caller:'}
                        </span>
                        <span className="text-slate-700 leading-relaxed">{t.content}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSelectedResult(null)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
