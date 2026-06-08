'use client';
import { useState } from 'react';
import Hint from '@/components/Hint';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Customized,
} from 'recharts';

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return dx === 0 || dy === 0 ? 0 : num / (dx * dy);
}

function linReg(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const denom = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (denom === 0) return { m: 0, b: my };
  const m = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / denom;
  return { m, b: my - m * mx };
}

// Drawn via Customized so it sits inside the chart SVG layer.
// clipPathId (provided by Recharts) restricts the line to the plot area.
function RegressionLine({ xAxisMap, yAxisMap, m, b, x0, x1, clipPathId }) {
  try {
    const xAxis = xAxisMap?.[0] ?? (xAxisMap && Object.values(xAxisMap)[0]);
    const yAxis = yAxisMap?.[0] ?? (yAxisMap && Object.values(yAxisMap)[0]);
    if (!xAxis?.scale || !yAxis?.scale) return null;
    return (
      <g clipPath={clipPathId ? `url(#${clipPathId})` : undefined}>
        <line
          x1={xAxis.scale(x0)} y1={yAxis.scale(m * x0 + b)}
          x2={xAxis.scale(x1)} y2={yAxis.scale(m * x1 + b)}
          stroke="#94a3b8"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          strokeLinecap="round"
        />
      </g>
    );
  } catch {
    return null;
  }
}

function Dot({ cx, cy, payload }) {
  const fill = payload?.ret > 0 ? '#059669' : payload?.ret < 0 ? '#dc2626' : '#94a3b8';
  return <circle cx={cx} cy={cy} r={5} fill={fill} fillOpacity={0.85} stroke="white" strokeWidth={1} />;
}

function ScatterTooltip({ active, payload, period }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.ret == null) return null;
  const date = d.date
    ? new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;
  const retColor = d.ret >= 0 ? '#059669' : '#dc2626';
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 12,
      color: '#0f172a',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      padding: '8px 12px',
      lineHeight: 1.8,
    }}>
      {date && <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}>{date}</div>}
      <div>Score&nbsp;<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.score}</span></div>
      <div style={{ color: retColor }}>
        {period}&nbsp;return&nbsp;
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {d.ret >= 0 ? '+' : ''}{Number(d.ret).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

const FIELDS = { '7d': 'return_7d', '3d': 'return_3d', '1d': 'return_1d' };

export default function PredictabilityScatter({ calls }) {
  const [period, setPeriod] = useState('7d');
  const field = FIELDS[period];

  const valid = calls.filter(c => c.confidence_score != null && c[field] != null);
  if (valid.length < 3) return null;

  const xs = valid.map(c => c.confidence_score);
  const ys = valid.map(c => c[field]);
  const r = pearson(xs, ys);
  const { m, b } = linReg(xs, ys);
  const r2 = r * r;

  const data = valid.map(c => ({ score: c.confidence_score, ret: c[field], date: c.call_date }));
  const x0 = Math.max(0, Math.min(...xs) - 5);
  const x1 = Math.min(100, Math.max(...xs) + 5);

  const latestScore = calls[0]?.confidence_score;
  const predictedReturn = latestScore != null ? m * latestScore + b : null;

  const rAbs = Math.abs(r);
  const rColor = rAbs >= 0.5
    ? (r >= 0 ? 'text-emerald-600' : 'text-red-600')
    : rAbs >= 0.25 ? 'text-amber-600' : 'text-slate-500';
  const rLabel = (r >= 0 ? '+' : '') + r.toFixed(2);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          CEO Confidence vs. Post-Earnings Return
        </h2>
        <div className="flex gap-1">
          {['1d', '3d', '7d'].map(w => (
            <button
              key={w}
              onClick={() => setPeriod(w)}
              className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors ${
                period === w ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline gap-5 mb-3 flex-wrap">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Pearson r</span>
          <Hint text="Correlation between CEO confidence score and stock return (−1 to +1). Closer to ±1 = stronger relationship. Positive = higher confidence tends to mean higher return." />
          <span className={`ml-1.5 text-sm font-mono font-semibold tabular-nums ${rColor}`}>{rLabel}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">R²</span>
          <Hint text="How much of the return variation is explained by the confidence score. 30% means confidence accounts for 30% of the move — the rest is noise." />
          <span className="ml-1.5 text-sm font-mono tabular-nums text-slate-600">{(r2 * 100).toFixed(0)}%</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Calls</span>
          <span className="ml-1.5 text-sm font-mono tabular-nums text-slate-600">{valid.length}</span>
        </div>
      </div>

      {predictedReturn != null && latestScore != null && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg w-fit text-[11px] text-slate-600">
          <span className="text-slate-400 uppercase tracking-widest text-[9px] font-semibold">Predicted ({period})</span>
          <span className="font-mono font-semibold text-slate-800">
            Score {latestScore} → {predictedReturn >= 0 ? '+' : ''}{predictedReturn.toFixed(1)}%
          </span>
          <Hint text={`Based on the linear regression of ${valid.length} historical calls. Prediction quality depends on R² — low R² means high uncertainty.`} />
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 5, right: 16, left: -10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            dataKey="score"
            domain={[x0, x1]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            type="number"
            dataKey="ret"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={<ScatterTooltip period={period} />}
          />
          <Scatter data={data} shape={Dot} />
          <Customized
            component={(props) => (
              <RegressionLine {...props} m={m} b={b} x0={x0} x1={x1} />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-slate-400 mt-2 text-center">
        Each dot = one earnings call · green = positive {period} return · red = negative · dashed = best-fit line
      </p>
    </div>
  );
}
