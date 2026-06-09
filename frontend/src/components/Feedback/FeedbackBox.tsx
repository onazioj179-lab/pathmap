/**
 * FeedbackBox - a contact/feedback modal that posts to Formspree.
 *
 * Gated by controlState.feedbackOpen (open from the palette, settings, or the
 * Command Center). Submits name/email/message to the project's Formspree form and
 * shows clear sending/success/error states. gsap powers a smooth entrance
 * (skipped under reduced motion). Keyboard accessible with focus restore.
 */
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useEngineState } from '../../hooks/useEngineState';
import { controlState, CONTROL_STATE_EVENT } from '../../services/controlState';
import './FeedbackBox.css';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xeewkdkp';

type Status = 'idle' | 'sending' | 'success' | 'error';

export default function FeedbackBox() {
  const { feedbackOpen } = useEngineState(CONTROL_STATE_EVENT, controlState.getSnapshot);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!feedbackOpen) return;
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    setStatus('idle');
    setError('');
    const reduce = document.documentElement.dataset.reducedMotion === 'true';
    if (panelRef.current && !reduce) {
      gsap.fromTo(
        panelRef.current,
        { y: 24, opacity: 0, scale: 0.96 },
        { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }
      );
    }
    requestAnimationFrame(() => firstRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controlState.toggleFeedback(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [feedbackOpen]);

  if (!feedbackOpen) return null;

  const close = () => controlState.toggleFeedback(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus('sending');
    setError('');
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        setStatus('success');
        form.reset();
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.errors?.[0]?.message || 'Could not send. Please try again.');
        setStatus('error');
      }
    } catch {
      setError('Network error. Check your connection and try again.');
      setStatus('error');
    }
  };

  return (
    <div
      className="fb-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fb-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="fb-panel" ref={panelRef}>
        <button type="button" className="fb-close" aria-label="Close feedback" onClick={close}>
          &times;
        </button>
        <h2 id="fb-title" className="fb-title">
          Send feedback
        </h2>
        <p className="fb-sub">Found a bug or have an idea? Tell me - it goes straight to my inbox.</p>

        {status === 'success' ? (
          <div className="fb-success" role="status">
            <span className="fb-check" aria-hidden="true" />
            <p>Thanks - your message was sent.</p>
            <button type="button" className="fb-btn" onClick={close}>
              Done
            </button>
          </div>
        ) : (
          <form className="fb-form" onSubmit={onSubmit}>
            <label className="fb-field">
              <span>Name</span>
              <input ref={firstRef} name="name" type="text" autoComplete="name" required />
            </label>
            <label className="fb-field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="fb-field">
              <span>Message</span>
              <textarea name="message" rows={4} required />
            </label>
            {status === 'error' && (
              <p className="fb-error" role="alert">
                {error}
              </p>
            )}
            <div className="fb-actions">
              <button type="button" className="fb-btn ghost" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="fb-btn" disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
