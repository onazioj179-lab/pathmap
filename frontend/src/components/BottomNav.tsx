interface BottomNavProps {
  activePanel: string | null;
  onTabClick: (panel: 'routing' | 'compare' | 'safe' | 'track' | 'marks') => void;
}

const tabs = [
  { id: 'routing', icon: '◎', label: 'Route' },
  { id: 'compare', icon: '◉', label: 'Explore' },
  { id: 'safe', icon: '◇', label: 'Safe' },
  { id: 'track', icon: '◈', label: 'Track' },
  { id: 'marks', icon: '▣', label: 'Stats' }
];

export default function BottomNav({ activePanel, onTabClick }: BottomNavProps) {
  return (
    <nav className="glass-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabClick(tab.id as any)}
          className={`glass-nav-btn ${activePanel === tab.id ? 'on' : ''}`}
        >
          <span className="glass-nav-icon">{tab.icon}</span>
          <span className="glass-nav-text">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
