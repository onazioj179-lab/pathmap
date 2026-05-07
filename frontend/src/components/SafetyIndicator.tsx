interface SafetyIndicatorProps {
  score: number;
}

export default function SafetyIndicator({ score }: SafetyIndicatorProps) {
  const getColor = () => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  return (
    <div className="fixed top-16 left-4 bg-black border-2 border-emerald-700 px-3 py-2 z-20 flex items-center gap-2 font-mono">
      <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 bg-emerald-950 border border-emerald-800 overflow-hidden">
          <div className={`h-full ${getColor()} transition-all duration-300`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-xs font-bold text-emerald-400 min-w-[2rem]">{score}</span>
      </div>
    </div>
  );
}
