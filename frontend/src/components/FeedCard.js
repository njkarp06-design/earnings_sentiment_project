'use client';
import Link from 'next/link';
import clsx from 'clsx';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';
import MiniSparkline from './MiniSparkline';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// 2px top accent border signals sentiment at a glance before reading the score
function accentBorder(score) {
  if (score >= 70) return 'border-t-emerald-500/70';
  if (score >= 45) return 'border-t-amber-500/70';
  return 'border-t-red-500/70';
}

export default function FeedCard({ item }) {
  const isPositive = item.return_7d != null ? item.return_7d >= 0 : null;

  return (
    <div
      className={clsx(
        'bg-slate-800 border border-slate-700 border-t-2 rounded-xl overflow-hidden',
        'flex flex-col hover:border-slate-500 transition-colors',
        accentBorder(item.confidence_score),
      )}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <Link
            href={`/companies/${item.ticker}`}
            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {item.ticker}
          </Link>
          {item.company_name && (
            <span className="ml-2 text-slate-400 text-sm truncate">{item.company_name}</span>
          )}
        </div>
        <span className="text-slate-500 text-xs shrink-0 mt-0.5">{fmtDate(item.call_date)}</span>
      </div>

      {/* ── 7-day price sparkline ────────────────────────────── */}
      {item.price_series?.length > 0 && (
        <div className="px-2 pb-1">
          <MiniSparkline data={item.price_series} positive={isPositive} height={64} />
        </div>
      )}

      {/* ── Post-call returns ────────────────────────────────── */}
      <div className="flex gap-6 px-5 py-3 border-t border-slate-700/50">
        <ReturnBadge value={item.return_1d} label="1-day" />
        <ReturnBadge value={item.return_3d} label="3-day" />
        <ReturnBadge value={item.return_7d} label="7-day" />
      </div>

      {/* ── CEO confidence + key phrases ─────────────────────── */}
      <div className="flex flex-col gap-3 px-5 pt-3 pb-5 border-t border-slate-700/50">
        <div>
          <div className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">CEO Confidence</div>
          <ScoreBar score={item.confidence_score} />
        </div>

        {item.key_phrases?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.key_phrases.slice(0, 3).map((phrase, i) => (
              <span
                key={i}
                className="text-[11px] bg-slate-700/80 text-slate-300 px-2.5 py-0.5 rounded-full"
              >
                {phrase}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
