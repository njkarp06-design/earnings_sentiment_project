'use client';
import { useState } from 'react';
import clsx from 'clsx';
import MiniSparkline from './MiniSparkline';
import { usePortfolio } from '@/context/PortfolioContext';

function scoreColor(score) {
  if (score >= 70) return 'text-emerald-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

function TrendArrow({ trend }) {
  if (trend === 'up')   return <span className="text-emerald-400 text-xs">↑</span>;
  if (trend === 'down') return <span className="text-red-400 text-xs">↓</span>;
  return null;
}

function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function SuggestionCard({ item, onInspect }) {
  const { watchlist, add } = usePortfolio();
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState(null);

  const saved = watchlist.includes(item.ticker);
  const isPositive = item.return_7d != null ? item.return_7d >= 0 : null;

  const handleAdd = async (e) => {
    e.stopPropagation();
    if (saved) return;
    setSaving(true);
    setAddError(null);
    try {
      await add(item.ticker);
    } catch (err) {
      setAddError(err.message || 'Failed');
      setTimeout(() => setAddError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 hover:shadow-card-hover transition-all duration-200 cursor-pointer"
      onClick={() => onInspect?.(item)}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <span className="font-mono font-bold text-cyan-400 text-sm tracking-tight">{item.ticker}</span>
          {item.company_name && (
            <span className="ml-1.5 text-slate-500 text-xs truncate">{item.company_name}</span>
          )}
        </div>
        {item.sector && (
          <span className="text-[10px] bg-slate-800 border border-slate-700/50 text-slate-500 px-2 py-0.5 rounded-full shrink-0">
            {item.sector}
          </span>
        )}
      </div>

      {/* ── Tiny sparkline ──────────────────────────────────── */}
      {item.price_series?.length > 0 && (
        <div className="px-2">
          <MiniSparkline data={item.price_series} positive={isPositive} height={44} />
        </div>
      )}

      {/* ── Stats + Add button ───────────────────────────────── */}
      <div className="flex flex-col border-t border-slate-800/60">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className={clsx('text-sm font-semibold font-mono tabular-nums', scoreColor(item.confidence_score))}>
                {item.confidence_score}
              </span>
              <TrendArrow trend={item.trend} />
            </div>
            {item.return_7d != null && (
              <span className={clsx(
                'text-xs font-mono tabular-nums font-medium',
                item.return_7d >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}>
                {item.return_7d >= 0 ? '+' : ''}{item.return_7d.toFixed(2)}%
              </span>
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || saved}
            aria-label={saved ? 'Already in portfolio' : 'Add to portfolio'}
            className={clsx(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-60',
              saved
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold',
            )}
          >
            {saved ? <CheckIcon /> : <PlusIcon />}
            {saved ? 'Saved' : 'Add'}
          </button>
        </div>
        {addError && (
          <p className="text-[10px] text-red-400 text-right px-4 pb-2 -mt-1">{addError}</p>
        )}
      </div>

      {/* ── Inspect affordance ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-t border-slate-800/40 text-slate-700 hover:text-cyan-400/60 transition-colors">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
        <span className="text-[10px] uppercase tracking-widest font-medium">Inspect</span>
      </div>
    </div>
  );
}
