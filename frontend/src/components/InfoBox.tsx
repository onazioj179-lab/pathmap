interface InfoBoxProps {
  routeData: any | null;
}

export default function InfoBox({ routeData }: InfoBoxProps) {
  if (!routeData) return null;

  return (
    <div className="fixed top-16 right-4 bg-black border-2 border-emerald-700 px-3 py-2 z-20 text-xs font-mono text-emerald-400 transition-all duration-150 hover:border-emerald-500">
      <div className="flex flex-col gap-1">
        <div className="tracking-wide">DIST: <span className="font-bold">{routeData.distance?.toFixed(2) || '-'}</span> km</div>
        <div className="tracking-wide">TIME: <span className="font-bold">{routeData.time?.toFixed(1) || '-'}</span> min</div>
        {routeData.visited && <div className="tracking-wide">NODES: <span className="font-bold">{routeData.visited}</span></div>}
      </div>
    </div>
  );
}
