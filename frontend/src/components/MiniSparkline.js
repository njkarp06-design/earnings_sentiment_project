'use client';
import { useId } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  Tooltip,
} from 'recharts';

function SparklineTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { day, pct } = payload[0].payload;
  const pos = pct >= 0;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[10px] leading-tight shadow-lg">
      <span className="text-slate-500">Day {day} </span>
      <span className={pos ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
        {pos ? '+' : ''}{pct.toFixed(2)}%
      </span>
    </div>
  );
}

export default function MiniSparkline({ data, positive, height = 64 }) {
  const uid = useId().replace(/:/g, '');

  if (!data?.length) return null;
  if (!data.some(p => p.pct != null)) return null;

  // null if return_7d unknown → neutral slate color
  const color =
    positive === true  ? '#10b981'  // emerald-500
    : positive === false ? '#ef4444' // red-500
    : '#64748b';                      // slate-500

  const gradientId = `sg${uid}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Baseline — makes it immediately obvious if the stock dipped */}
        <ReferenceLine
          y={0}
          stroke="#475569"
          strokeDasharray="3 2"
          strokeWidth={1}
        />

        <Tooltip
          content={<SparklineTooltip />}
          cursor={{ stroke: '#475569', strokeWidth: 1, strokeDasharray: '3 2' }}
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
