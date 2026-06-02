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
    <div className="flex items-stretch border border-slate-700 rounded-xl overflow-x-auto bg-slate-800/40 mb-6 text-xs">
      <div className="px-4 py-2.5 flex items-center shrink-0 border-r border-slate-700">
        <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">
          Market Pulse
        </span>
      </div>

      {sectors.map((s, i) => (
        <div
          key={s.sector}
          className={`flex items-center gap-2.5 px-4 py-2.5 shrink-0 ${
            i < sectors.length - 1 ? 'border-r border-slate-700' : ''
          }`}
        >
          <span className="text-slate-400">{s.sector}</span>
          <span className={`font-semibold tabular-nums ${scoreColor(s.avg_confidence)}`}>
            {s.avg_confidence}
          </span>
          {s.avg_return_7d != null && (
            <span
              className={`tabular-nums ${
                s.avg_return_7d >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {s.avg_return_7d >= 0 ? '+' : ''}{s.avg_return_7d}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
