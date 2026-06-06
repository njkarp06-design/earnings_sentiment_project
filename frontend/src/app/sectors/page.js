'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import SearchOverlay from '@/components/SearchOverlay';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { getSectors, getSectorDetail } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(val) {
  if (val == null || !isFinite(val)) return '—';
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function pctColor(val) {
  if (val == null) return 'text-slate-400';
  return val >= 0 ? 'text-emerald-600' : 'text-red-600';
}

function winColor(rate) {
  if (rate == null) return 'text-slate-400';
  return rate >= 0.5 ? 'text-emerald-600' : 'text-red-600';
}

// ── Sector drift chart ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entry = payload.find(p => p.dataKey === 'mean');
  if (entry?.value == null) return null;
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4, fontSize: 11 }}>Day {label}</div>
      <div style={{ color: '#1d4ed8', fontFamily: 'var(--font-mono),monospace', fontWeight: 600 }}>
        {fmtPct(entry.value)}
      </div>
    </div>
  );
}

function SectorDriftChart({ avgPath }) {
  if (!avgPath?.length) return null;
  const showBand = avgPath.some(p => p.bandHeight != null && p.bandHeight > 0);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={avgPath} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="day"
          tickFormatter={d => `D${d}`}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => (typeof v === 'number' && isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '')}
          width={54}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="4 4" />

        {showBand && (
          <>
            <Area dataKey="lower" fill="transparent" stroke="none" stackId="band"
              type="monotone" isAnimationActive={false} activeDot={false} connectNulls legendType="none" />
            <Area dataKey="bandHeight" fill="#1d4ed8" fillOpacity={0.06} stroke="none" stackId="band"
              type="monotone" isAnimationActive={false} activeDot={false} connectNulls legendType="none" />
          </>
        )}

        <Line
          dataKey="mean"
          stroke="#1d4ed8"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 3, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 2 }}
          type="monotone"
          legendType="none"
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Sector card ───────────────────────────────────────────────────────────────

function SectorCard({ sector, selected, onClick }) {
  const positive = sector.avg_7d >= 0;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left bg-white border rounded-xl p-5 transition-all duration-200 shadow-sm',
        'hover:border-slate-300 hover:shadow-card-hover',
        selected
          ? 'border-blue-500/40 shadow-[0_0_0_1px_rgba(29,78,216,0.15)]'
          : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-slate-900 text-sm leading-snug">{sector.sector}</h3>
        <span className={clsx(
          'text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border shrink-0',
          sector.win_rate >= 0.5
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-700 border-red-200',
        )}>
          {Math.round(sector.win_rate * 100)}% win
        </span>
      </div>

      <div className={clsx(
        'text-2xl font-bold font-mono tabular-nums mb-0.5',
        positive ? 'text-emerald-600' : 'text-red-600',
      )}>
        {fmtPct(sector.avg_7d)}
      </div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-4">Avg 7d return</div>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono border-t border-slate-200 pt-3">
        <span>{sector.avg_1d != null ? fmtPct(sector.avg_1d) : '—'}</span>
        <span className="text-slate-400">·</span>
        <span>{sector.avg_3d != null ? fmtPct(sector.avg_3d) : '—'}</span>
        <span className="text-slate-400">·</span>
        <span>{fmtPct(sector.avg_7d)}</span>
        <span className="text-slate-400 ml-auto">{sector.call_count} calls · {sector.company_count} co.</span>
      </div>
    </button>
  );
}

// ── Sector detail panel ───────────────────────────────────────────────────────

function SectorDetail({ sector, detail, loading, onCompanyClick }) {
  return (
    <div className="bg-white border border-blue-200 rounded-xl overflow-hidden mb-6 shadow-sm">

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{sector}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
              Aggregate post-earnings drift · all companies in sector
            </p>
          </div>
          {detail && (
            <div className="flex items-center gap-6">
              <Stat label="Avg 7d" value={fmtPct(calcAvg(detail.companies, 'avg_7d'))} color={pctColor(calcAvg(detail.companies, 'avg_7d'))} />
              <Stat label="Win Rate" value={`${Math.round(calcWinRate(detail.companies) * 100)}%`} color={winColor(calcWinRate(detail.companies))} />
              <Stat label="Companies" value={detail.companies.length} />
              <Stat label="Total Calls" value={detail.companies.reduce((a, c) => a + c.call_count, 0)} />
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 animate-pulse font-mono text-sm">
          Loading…
        </div>
      ) : detail ? (
        <>
          {/* Drift chart */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3 px-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                Avg price path D0 → D7
              </span>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-[2px] border-blue-600 inline-block" />
                  Sector avg
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-2 rounded-sm inline-block bg-blue-600/10 border border-blue-600/20" />
                  ±1σ
                </span>
              </div>
            </div>
            <SectorDriftChart avgPath={detail.avg_path} />
          </div>

          {/* Company rankings */}
          {detail.companies.length > 0 && (
            <div className="border-t border-slate-200 mt-2">
              <div className="px-6 py-3 text-[10px] text-slate-400 uppercase tracking-widest">
                Company Rankings
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-6 py-2 text-left text-[10px] text-slate-400 uppercase tracking-widest w-8">#</th>
                      <th className="px-4 py-2 text-left text-[10px] text-slate-400 uppercase tracking-widest">Company</th>
                      <th className="px-4 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest">Calls</th>
                      <th className="px-4 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 1d</th>
                      <th className="px-4 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 3d</th>
                      <th className="px-4 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest">Avg 7d</th>
                      <th className="px-4 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {detail.companies.map((co, i) => (
                      <tr
                        key={co.ticker}
                        onClick={() => onCompanyClick?.({ ticker: co.ticker, company_name: co.company_name, has_data: true })}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-2.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-blue-700 text-sm">{co.ticker}</span>
                          {co.company_name && (
                            <span className="text-slate-500 text-xs ml-2">{co.company_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono tabular-nums text-slate-500 text-xs">{co.call_count}</td>
                        <td className={clsx('px-4 py-2.5 text-center font-mono tabular-nums text-sm', pctColor(co.avg_1d))}>{fmtPct(co.avg_1d)}</td>
                        <td className={clsx('px-4 py-2.5 text-center font-mono tabular-nums text-sm', pctColor(co.avg_3d))}>{fmtPct(co.avg_3d)}</td>
                        <td className={clsx('px-4 py-2.5 text-center font-mono tabular-nums text-sm font-semibold', pctColor(co.avg_7d))}>{fmtPct(co.avg_7d)}</td>
                        <td className={clsx('px-4 py-2.5 text-center font-mono tabular-nums text-sm font-semibold', winColor(co.win_rate))}>
                          {co.win_rate != null ? `${Math.round(co.win_rate * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">{label}</div>
      <div className={clsx('text-sm font-mono font-semibold tabular-nums', color ?? 'text-slate-800')}>{value}</div>
    </div>
  );
}

function calcAvg(companies, field) {
  const vals = companies.map(c => c[field]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function calcWinRate(companies) {
  const vals = companies.map(c => c.win_rate).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SectorsPage() {
  const [sectors, setSectors]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [selected, setSelected]           = useState(null);
  const [detail, setDetail]               = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overlayItem, setOverlayItem]     = useState(null);

  useEffect(() => {
    getSectors()
      .then(setSectors)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (sectorName) => {
    if (selected === sectorName) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(sectorName);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await getSectorDetail(sectorName);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sector Pulse</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Average post-earnings stock performance by sector — click any sector to see the drift chart and company rankings
        </p>
      </div>

      {loading && <SkeletonGrid />}

      {error && <p className="text-center py-12 text-red-600">{error}</p>}

      {!loading && !error && sectors.length === 0 && (
        <div className="text-center py-16 flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-slate-700">No sector data yet</p>
          <p className="text-sm text-slate-500">Returns must be correlated for entries to appear.</p>
        </div>
      )}

      {!loading && !error && sectors.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            {sectors.map(s => (
              <SectorCard
                key={s.sector}
                sector={s}
                selected={selected === s.sector}
                onClick={() => handleSelect(s.sector)}
              />
            ))}
          </div>

          {selected && (
            <SectorDetail
              sector={selected}
              detail={detail}
              loading={detailLoading}
              onCompanyClick={setOverlayItem}
            />
          )}
        </>
      )}

      {overlayItem && (
        <SearchOverlay item={overlayItem} onClose={() => setOverlayItem(null)} />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3 shadow-sm">
          <div className="h-4 bg-slate-200 rounded w-2/3" />
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-2 bg-slate-200 rounded w-full" />
        </div>
      ))}
    </div>
  );
}
