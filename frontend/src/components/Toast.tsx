import React from 'react';
import './Toast.css';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastStackProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ messages, onDismiss }) => {
  if (messages.length === 0) return null;

  return (
    <div className="pm-toast-stack" role="region" aria-label="Notifications">
      {messages.map(toast => (
        <div
          key={toast.id}
          className={`pm-toast pm-toast--${toast.kind}`}
          role="status"
          aria-live="polite"
        >
          <span className="pm-toast__dot" aria-hidden="true" />
          <div>
            <p className="pm-toast__title">{toast.title}</p>
            {toast.message && <p className="pm-toast__message">{toast.message}</p>}
          </div>
          <button
            type="button"
            className="pm-toast__close"
            aria-label={`Dismiss ${toast.title}`}
            title="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
};
