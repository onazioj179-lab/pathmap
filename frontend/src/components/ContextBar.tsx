interface ContextBarProps {
  algorithm: string;
  contextData: any | null;
}

export default function ContextBar({ algorithm }: ContextBarProps) {
  return (
    <header className="glass-bar">
      <div className="glass-brand">
        <span className="glass-logo">◈</span>
        <span className="glass-title">PathMap</span>
      </div>
      <div className="glass-chip">
        <span className="glass-dot" />
        {algorithm}
      </div>
    </header>
  );
}
