import React, { useEffect, useId, useRef } from 'react';
import { IconButton } from './Button';
import './Dialog.css';

interface DialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  title,
  children,
  onClose,
  closeLabel = 'Close dialog',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="pm-dialog-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="pm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="pm-dialog__header">
          <h2 className="pm-dialog__title" id={titleId}>{title}</h2>
          <IconButton
            label={closeLabel}
            onClick={onClose}
            icon={
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.3-6.29 1.41 1.41z" />
              </svg>
            }
          />
        </header>
        <div className="pm-dialog__body">{children}</div>
      </div>
    </div>
  );
};
