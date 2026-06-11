'use client';
import { useEffect, useRef, useState } from 'react';
import { inspectCall } from '@/lib/api';

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function BoldLine({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="text-slate-900 font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function AnalysisBody({ text }) {
  const lines = text.split('\n');
  return (
    <div>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3
              key={i}
              className="text-slate-900 font-semibold text-sm mt-6 mb-2 first:mt-0 pb-1 border-b border-slate-200"
            >
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2 mb-1">
              <span className="text-slate-400 shrink-0 mt-0.5">·</span>
              <p className="text-slate-600 text-sm leading-relaxed">
                <BoldLine text={line.slice(2)} />
              </p>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-slate-600 text-sm leading-relaxed mb-1">
            <BoldLine text={line} />
          </p>
        );
      })}
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 py-10 justify-center">
      <SparkleIcon />
      <span className="text-slate-500 text-sm ml-1">Analysing with Claude</span>
      <span className="flex gap-1 ml-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="inline-block w-1 h-1 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T12:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function InspectModal({ item, onClose }) {
  const [analysis, setAnalysis] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    const wasAlreadyLocked = document.body.style.overflow === 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      if (!wasAlreadyLocked) document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [analysis]);

  useEffect(() => {
    let mounted = true;

    inspectCall(
      {
        ticker:           item.ticker,
        company_name:     item.company_name,
        call_date:        item.call_date,
        confidence_score: item.confidence_score,
        key_phrases:      item.key_phrases,
        return_1d:        item.return_1d,
        return_3d:        item.return_3d,
        return_7d:        item.return_7d,
      },
      (chunk) => { if (mounted) setAnalysis((prev) => prev + chunk); },
      ()      => { if (mounted) setDone(true); },
      (msg)   => { if (mounted) setError(msg); },
    );

    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col"
        style={{ maxHeight: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <SparkleIcon />
              <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-widest">
                Deep Analysis
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-bold font-mono text-slate-900 tracking-tight">{item.ticker}</span>
              {item.company_name && (
                <span className="text-slate-500 text-sm">{item.company_name}</span>
              )}
            </div>
            <p className="text-slate-400 text-xs mt-0.5">{fmtDate(item.call_date)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors mt-0.5 shrink-0"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="overflow-y-auto px-6 py-5 flex-1"
        >
          {error ? (
            <p className="text-red-600 text-sm text-center py-8">{error}</p>
          ) : analysis ? (
            <>
              <AnalysisBody text={analysis} />
              {done && (
                <div className="mt-6 pt-4 border-t border-slate-200 flex items-center gap-2">
                  <SparkleIcon />
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                    Analysis complete · Powered by Claude
                  </span>
                </div>
              )}
            </>
          ) : (
            <LoadingDots />
          )}
        </div>
      </div>
    </div>
  );
}
