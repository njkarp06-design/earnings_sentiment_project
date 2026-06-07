'use client';
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
  ReferenceDot,
} from 'recharts';

function fmtPct(val) {
  if (val == null || !isFinite(val)) return '—';
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function calcMean(arr) {
  const v = arr.filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function dayStats(priorCalls, day) {
  const vals = priorCalls
    .map(c => c.price_series.find(p => p.day === day)?.pct)
    .filter(v => v != null);
  if (vals.length < 2) {
    return { mean: vals[0] ?? null, lower: null, bandHeight: null };
  }
  const m   = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
  return { mean: m, lower: m - std, bandHeight: std * 2 };
}

function DriftTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const cur  = payload.find(p => p.dataKey === 'current');
  const hist = payload.find(p => p.dataKey === 'mean');
  if (cur?.value == null && hist?.value == null) return null;
  return (
    <div style={{
      background: '#ffffff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 130,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontSize: 11 }}>Day {label}</div>
      {cur?.value != null && (
        <div style={{ color: '#d97706', fontFamily: 'var(--font-mono),monospace', fontWeight: 600, marginBottom: 2 }}>
          Latest&nbsp;&nbsp;&nbsp;{fmtPct(cur.value)}
        </div>
      )}
      {hist?.value != null && (
        <div style={{ color: '#1d4ed8', fontFamily: 'var(--font-mono),monospace', fontWeight: 600 }}>
          Hist avg&nbsp;{fmtPct(hist.value)}
        </div>
      )}
    </div>
  );
}

function StatCol({ accent, label, sublabel, children }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: accent }}>
          {label}
        </span>
        {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
      </div>
      <div className="flex items-start gap-5 flex-wrap">{children}</div>
    </div>
  );
}

function Pill({ label, value, pending }) {
  const color = pending          ? 'text-amber-600'
    : value == null              ? 'text-slate-400'
    : value >= 0                 ? 'text-emerald-600'
    :                              'text-red-600';
  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">{label}</div>
      <div className={`text-sm font-mono font-semibold tabular-nums ${color} ${pending ? 'animate-pulse' : ''}`}>
        {pending ? '…' : fmtPct(value)}
      </div>
    </div>
  );
}

export default function PostEarningsProfile({ calls, showCurrentStats = true }) {
  if (!calls?.length) return null;

  const current    = calls[0];
  const priorCalls = calls.slice(1).filter(c => c.price_series?.length > 0);

  const hasCurrentSeries = current.price_series?.length > 0;
  const hasHistory       = priorCalls.length >= 1;

  if (!hasCurrentSeries && !hasHistory) return null;

  const days = [0, 1, 2, 3, 4, 5, 6, 7];

  const lastPt  = hasCurrentSeries
    ? current.price_series.filter(p => p.pct != null).sort((a, b) => b.day - a.day)[0]
    : null;
  const lastDay = lastPt?.day ?? null;
  const lastPct = lastPt?.pct ?? null;
  const isLive  = lastDay != null && lastDay < 7;

  const chartData = days.map(day => {
    const row = { day };

    if (hasCurrentSeries) {
      const pt = current.price_series.find(p => p.day === day);
      row.current = pt?.pct ?? null;
    }

    if (hasHistory) {
      priorCalls.forEach((call, i) => {
        const pt = call.price_series.find(p => p.day === day);
        row[`c${i}`] = pt?.pct ?? null;
      });
      const { mean, lower, bandHeight } = dayStats(priorCalls, day);
      row.mean       = mean;
      row.lower      = lower;
      row.bandHeight = bandHeight;
    }

    return row;
  });

  const avg1d     = calcMean(priorCalls.map(c => c.return_1d));
  const avg3d     = calcMean(priorCalls.map(c => c.return_3d));
  const avg7d     = calcMean(priorCalls.map(c => c.return_7d));
  const returns7d = priorCalls.map(c => c.return_7d).filter(v => v != null);
  const hitCount  = returns7d.filter(v => v > 0).length;
  const hitRate   = returns7d.length > 0 ? hitCount / returns7d.length : null;

  const showBand = hasHistory && priorCalls.length >= 2;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          Post-Earnings Drift
        </h2>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {hasCurrentSeries && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-4 border-t-[2.5px] border-amber-600 inline-block rounded" />
              Latest
              {isLive && (
                <span className="px-1 py-px rounded text-[9px] font-bold bg-amber-600/10 text-amber-600 border border-amber-600/20 animate-pulse tracking-wider">
                  LIVE
                </span>
              )}
            </span>
          )}
          {hasHistory && (
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="w-4 border-t-[2px] border-blue-600 inline-block rounded" />
              Historical avg
            </span>
          )}
          {showBand && (
            <span className="flex items-center gap-1.5 text-slate-500" title="±1 standard deviation — the typical spread of returns across prior calls">
              <span className="w-4 h-2 rounded-sm inline-block bg-blue-600/10 border border-blue-600/20" />
              ±1 std dev
            </span>
          )}
          {hasHistory && (
            <span className="text-slate-400">{priorCalls.length} prior call{priorCalls.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -4, bottom: 0 }}>
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
          <Tooltip content={<DriftTooltip />} />
          <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="4 4" />

          {showBand && (
            <>
              <Area
                dataKey="lower"
                fill="transparent"
                stroke="none"
                stackId="band"
                type="monotone"
                legendType="none"
                isAnimationActive={false}
                activeDot={false}
                connectNulls
              />
              <Area
                dataKey="bandHeight"
                fill="#1d4ed8"
                fillOpacity={0.06}
                stroke="none"
                stackId="band"
                type="monotone"
                legendType="none"
                isAnimationActive={false}
                activeDot={false}
                connectNulls
              />
            </>
          )}

          {/* Ghost lines — each prior call */}
          {hasHistory && priorCalls.map((call, i) => (
            <Line
              key={`c${i}`}
              dataKey={`c${i}`}
              stroke={call.return_7d != null
                ? (call.return_7d >= 0 ? '#059669' : '#dc2626')
                : '#94a3b8'}
              strokeWidth={1}
              strokeOpacity={0.1}
              dot={false}
              activeDot={false}
              type="monotone"
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />
          ))}

          {/* Historical average — blue benchmark */}
          {hasHistory && (
            <Line
              dataKey="mean"
              stroke="#1d4ed8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 2 }}
              type="monotone"
              legendType="none"
              isAnimationActive={false}
            />
          )}

          {/* Current call — amber, thickest, always on top */}
          {hasCurrentSeries && (
            <Line
              dataKey="current"
              stroke="#d97706"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, fill: '#d97706', stroke: '#ffffff', strokeWidth: 2 }}
              type="monotone"
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />
          )}

          {/* Pulsing dot at the tip of the current call if still tracking */}
          {isLive && lastDay != null && lastPct != null && (
            <ReferenceDot
              x={lastDay}
              y={lastPct}
              r={4}
              fill="#d97706"
              stroke="#ffffff"
              strokeWidth={2}
              shape={(props) => (
                <g>
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={10}
                    fill="#d97706"
                    fillOpacity={0.2}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }}
                  />
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill="#d97706"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                </g>
              )}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── Stat strip ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-6 pt-4 mt-3 border-t border-slate-200">

        {showCurrentStats && hasCurrentSeries && (
          <StatCol accent="#d97706" label="Latest Call" sublabel={`· ${fmtDate(current.call_date)}`}>
            <Pill label="1d" value={current.return_1d} pending={current.return_1d == null && isLive} />
            <Pill label="3d" value={current.return_3d} pending={current.return_3d == null && isLive} />
            <Pill label="7d" value={current.return_7d} pending={current.return_7d == null && isLive} />
          </StatCol>
        )}

        {showCurrentStats && hasCurrentSeries && hasHistory && (
          <div className="w-px self-stretch bg-slate-200 flex-shrink-0" />
        )}

        {hasHistory && (
          <StatCol accent="#1d4ed8" label="Historical Avg" sublabel={`· ${priorCalls.length} calls`}>
            <Pill label="Avg 1d" value={avg1d} />
            <Pill label="Avg 3d" value={avg3d} />
            <Pill label="Avg 7d" value={avg7d} />
            {hitRate != null && (
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Win Rate</div>
                <div className={`text-sm font-mono font-semibold tabular-nums ${hitRate >= 0.5 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Math.round(hitRate * 100)}%
                  <span className="text-slate-400 text-xs font-normal ml-1">
                    ({hitCount}/{returns7d.length})
                  </span>
                </div>
              </div>
            )}
          </StatCol>
        )}

      </div>
    </div>
  );
}
