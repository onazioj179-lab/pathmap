import { type ReactNode, useMemo, useState } from 'react';
import { Button } from './Button';
import './OnboardingTerms.css';

const TERMS_KEY = 'pathmap.terms.v2026-05-07';

interface OnboardingTermsProps {
  children: ReactNode;
}

const getTermsAccepted = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(TERMS_KEY) === 'accepted';
};

export default function OnboardingTerms({ children }: OnboardingTermsProps) {
  const [accepted, setAccepted] = useState(getTermsAccepted);
  const [confirmed, setConfirmed] = useState(false);

  const acceptedAt = useMemo(() => new Date().toISOString(), []);

  const acceptTerms = () => {
    window.localStorage.setItem(TERMS_KEY, 'accepted');
    window.localStorage.setItem(`${TERMS_KEY}.acceptedAt`, acceptedAt);
    setAccepted(true);
  };

  if (accepted) {
    return <>{children}</>;
  }

  return (
    <main className="onboarding-terms" aria-labelledby="onboarding-title">
      <section className="onboarding-terms__visual" aria-hidden="true">
        <div className="onboarding-terms__scan-card">
          <span>PATHMAP</span>
          <strong>Open Core</strong>
          <small>Self-hosted &amp; private</small>
        </div>
      </section>

      <section className="onboarding-terms__panel">
        <div className="onboarding-terms__eyebrow">Before you start</div>
        <h1 id="onboarding-title">Welcome to PathMap</h1>
        <p className="onboarding-terms__lead">
          Private, encrypted live location tracking you host yourself. The core is free and
          open to run and modify — hosted and Enterprise features are optional paid add-ons.
        </p>

        <div className="onboarding-terms__rules" aria-label="How PathMap works">
          <article>
            <span>01</span>
            <div>
              <h2>Free, self-hosted core</h2>
              <p>
                Run the full PathMap core yourself, read the code, and adapt it to your team —
                no license fee to operate your own deployment.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h2>Your data stays yours</h2>
              <p>
                Location updates are end-to-end encrypted before they leave the device. The
                server routes ciphertext and never sees raw coordinates.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h2>Hosted &amp; Enterprise are optional</h2>
              <p>
                Don&apos;t want to run servers? Managed hosting, SSO, and priority support are
                available as paid plans — but you never need them to use PathMap.
              </p>
            </div>
          </article>
          <article>
            <span>04</span>
            <div>
              <h2>Your deployment responsibility</h2>
              <p>
                You handle user consent, location laws, and safe operation in every deployment
                you run.
              </p>
            </div>
          </article>
        </div>

        <label className="onboarding-terms__confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
          />
          <span>
            I understand how PathMap works and agree to the terms in LICENSE.md.
          </span>
        </label>

        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!confirmed}
          onClick={acceptTerms}
        >
          Enter PathMap
        </Button>
      </section>
    </main>
  );
}
