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
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 12,
    color: '#e2e8f0',
  },
  labelStyle: { color: '#64748b' },
};

export default function ScoreChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#1e293b' }}
        />
        <YAxis
          yAxisId="score"
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="return"
          orientation="right"
          tick={{ fill: '#64748b', fontSize: 11 }}
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
          wrapperStyle={{ fontSize: 11, color: '#64748b' }}
          formatter={(name) => (name === 'score' ? 'Confidence' : '7d Return')}
        />
        <Line
          yAxisId="score"
          type="monotone"
          dataKey="score"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={<circle r={4} fill="#06b6d4" />}
          activeDot={{ r: 6 }}
        />
        <Line
          yAxisId="return"
          type="monotone"
          dataKey="return_7d"
          stroke="#10b981"
          strokeWidth={2}
          dot={<circle r={4} fill="#10b981" />}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
