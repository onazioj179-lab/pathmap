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
          <span>PATHMAP GRID</span>
          <strong>Commercial Access</strong>
          <small>License gate active</small>
        </div>
      </section>

      <section className="onboarding-terms__panel">
        <div className="onboarding-terms__eyebrow">Company terms</div>
        <h1 id="onboarding-title">Agree before entering PathMap</h1>
        <p className="onboarding-terms__lead">
          PathMap is proprietary commercial software owned by onazi Treasure Oj. Access requires
          these company-protective terms or a separate paid agreement.
        </p>

        <div className="onboarding-terms__rules" aria-label="Terms and conditions summary">
          <article>
            <span>01</span>
            <div>
              <h2>Commercial license required</h2>
              <p>
                Local evaluation is allowed. Production, resale, SaaS, hosted, white-label,
                embedded, or paid use requires an active plan.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h2>No removal or misuse</h2>
              <p>
                Do not remove ownership notices, watermarks, anti-tamper checks, license notices,
                or PathMap attribution.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h2>Company control</h2>
              <p>
                PathMap may suspend or revoke access for non-payment, misuse, security risk,
                unauthorized distribution, or out-of-scope use.
              </p>
            </div>
          </article>
          <article>
            <span>04</span>
            <div>
              <h2>Your deployment responsibility</h2>
              <p>
                You handle user consent, location laws, billing compliance, contracts, and safe
                operation in every deployment.
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
            I agree to the PathMap commercial terms and understand paid use needs an active license.
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
