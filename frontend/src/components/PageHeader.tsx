/**
 * PATHFINDER V90 — PAGE HEADER COMPONENT
 * Unified page header with consistent typography and spacing
 */

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, rightElement }: PageHeaderProps) {
  return (
    <header className="v90-page-header">
      <div className="v90-header-content">
        <h1 className="v90-header-title">{title}</h1>
        {subtitle && <span className="v90-header-subtitle">{subtitle}</span>}
      </div>
      {rightElement && <div>{rightElement}</div>}
    </header>
  );
}
