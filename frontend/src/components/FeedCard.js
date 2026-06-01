import Link from 'next/link';
import ScoreBar from './ScoreBar';
import ReturnBadge from './ReturnBadge';

function fmtDate(str) {
  if (!str) return '—';
  // Append noon local time so timezone offsets never shift the displayed date.
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function FeedCard({ item }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-slate-500 transition-colors flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/companies/${item.ticker}`}
            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {item.ticker}
          </Link>
          {item.company_name && (
            <span className="text-slate-400 text-sm ml-2">{item.company_name}</span>
          )}
        </div>
        <span className="text-slate-500 text-xs shrink-0">{fmtDate(item.call_date)}</span>
      </div>

      <div>
        <div className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wide">CEO Confidence</div>
        <ScoreBar score={item.confidence_score} />
      </div>

      {item.key_phrases?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.key_phrases.slice(0, 3).map((phrase, i) => (
            <span
              key={i}
              className="text-[11px] bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full"
            >
              {phrase}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-6 pt-3 border-t border-slate-700/70">
        <ReturnBadge value={item.return_1d} label="1-day" />
        <ReturnBadge value={item.return_3d} label="3-day" />
        <ReturnBadge value={item.return_7d} label="7-day" />
      </div>
    </div>
  );
}
