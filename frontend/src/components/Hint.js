export default function Hint({ text }) {
  return (
    <span className="relative inline-flex items-center group ml-1 align-middle">
      <span className="text-[9px] text-slate-400 border border-slate-300 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center cursor-help font-mono leading-none select-none hover:bg-slate-100 transition-colors">
        ?
      </span>
      <span className="pointer-events-none absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-900 text-white text-[10px] leading-relaxed rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg whitespace-normal font-sans normal-case tracking-normal font-normal">
        {text}
      </span>
    </span>
  );
}
