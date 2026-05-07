import React from 'react';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, action }) => (
  <div className="pm-empty-state">
    {icon && (
      <div className="pm-empty-state__icon" aria-hidden="true">
        {icon}
      </div>
    )}
    <div>
      <p className="pm-empty-state__title">{title}</p>
      <p className="pm-empty-state__message">{message}</p>
    </div>
    {action && <div className="pm-empty-state__action">{action}</div>}
  </div>
);
