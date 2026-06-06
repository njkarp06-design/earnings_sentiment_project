'use client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const tooltipStyle = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 12,
    color: '#0f172a',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  labelStyle: { color: '#94a3b8' },
};

export default function ScoreChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="return"
          orientation="right"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(value, name) => [
            name === 'return_7d' ? `${value}%` : value,
            name === 'score' ? 'Confidence' : '7d Return',
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
          formatter={(name) => (name === 'score' ? 'Confidence' : '7d Return')}
        />
        <Line
          yAxisId="score"
          type="monotone"
          dataKey="score"
          stroke="#1d4ed8"
          strokeWidth={2}
          dot={<circle r={4} fill="#1d4ed8" />}
          activeDot={{ r: 6 }}
        />
        <Line
          yAxisId="return"
          type="monotone"
          dataKey="return_7d"
          stroke="#059669"
          strokeWidth={2}
          dot={<circle r={4} fill="#059669" />}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
