'use client';
import { useId } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from 'recharts';

function SparklineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { day, pct } = payload[0].payload;
  const pos = pct >= 0;
  return (
    <div className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] leading-tight shadow-md">
      <span className="text-slate-400">Day {day} </span>
      <span className={pos ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
        {pos ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

export default function MiniSparkline({ data, positive, height = 64 }) {
  const uid = useId().replace(/:/g, '');

  if (!data?.length) return null;
  if (data.filter(p => p.pct != null).length < 2) return null;

  const color =
    positive === true  ? '#059669'  // emerald-600
    : positive === false ? '#dc2626' // red-600
    : '#94a3b8';                     // slate-400

  const gradientId = `sg${uid}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        <Tooltip
          content={<SparklineTooltip />}
          cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 2' }}
          isAnimationActive={false}
        />

        <Area
          type="monotone"
          dataKey="pct"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
