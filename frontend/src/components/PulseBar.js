'use client';
import { useEffect, useState } from 'react';
import { getPulse } from '@/lib/api';

function scoreColor(score) {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

export default function PulseBar() {
  const [sectors, setSectors] = useState([]);

  useEffect(() => {
    getPulse().then(setSectors).catch(() => {});
  }, []);

  if (!sectors.length) return null;

  return (
    <div className="flex items-stretch border border-slate-800 rounded-xl overflow-x-auto bg-slate-900/50 mb-6 text-xs">
      <div className="px-4 py-3 flex items-center shrink-0 border-r border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold text-cyan-400/70 uppercase tracking-widest text-[10px]">
            Market Pulse
          </span>
        </div>
      </div>

      {sectors.map((s, i) => (
        <div
          key={s.sector}
          className={`flex items-center gap-2.5 px-4 py-3 shrink-0 ${
            i < sectors.length - 1 ? 'border-r border-slate-800' : ''
          }`}
        >
          <span className="text-slate-500 text-[11px]">{s.sector}</span>
          <span className={`font-semibold font-mono tabular-nums ${scoreColor(s.avg_confidence)}`}>
            {s.avg_confidence}
          </span>
          {s.avg_return_7d != null && (
            <span className={`font-mono tabular-nums ${s.avg_return_7d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {s.avg_return_7d >= 0 ? '+' : ''}{s.avg_return_7d}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
