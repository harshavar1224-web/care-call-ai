import React, { useEffect, useState } from 'react';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Phone,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api';
import { ClinicInfo, EnvCheckItem } from '../types';
import { CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

export const Settings: React.FC = () => {
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [envChecklist, setEnvChecklist] = useState<EnvCheckItem[]>([]);
  const [databaseStatus, setDatabaseStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSettings();
      setClinic(res.clinic);
      setEnvChecklist(res.envChecklist);
      setDatabaseStatus(res.databaseStatus);
    } catch (err: any) {
      setError(err.message || 'Failed to load clinic settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (error || !clinic) {
    return <ErrorState message={error || 'Failed to load settings'} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Clinic Information Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{clinic.name}</h2>
              <span className="text-xs text-slate-500 font-mono">Timezone: {clinic.timezone}</span>
            </div>
          </div>
          <span className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-700 font-medium">
            Active Healthcare Facility
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">Address</span>
              <span>{clinic.address}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">Telephone & Emergency</span>
              <span>{clinic.phone} · Emergency Hotline: <strong className="text-red-700 font-bold">{clinic.emergencyContact}</strong></span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">Operating Hours</span>
              <span>Monday to Saturday: {clinic.openingTime} - {clinic.closingTime} IST (Sundays Closed)</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900 block">Database Storage Mode</span>
              <span className="capitalize">{databaseStatus.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Variables Checklist Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            Environment Variables Checklist
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Confidential configuration state. For security compliance, raw secret values are never displayed.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {envChecklist.map((item) => (
            <div key={item.name} className="p-4 flex items-center justify-between gap-4 text-xs">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{item.name}</span>
                  {item.required && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-medium">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
              </div>

              <div className="shrink-0">
                {item.isSet ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Configured</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
                    <XCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Not Set</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
