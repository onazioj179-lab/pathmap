import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import OnboardingTerms from './OnboardingTerms';

const TERMS_KEY = 'pathmap.terms.v2026-05-07';

describe('OnboardingTerms', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('requires agreement before showing the app', () => {
    render(
      <OnboardingTerms>
        <div>PathMap app</div>
      </OnboardingTerms>
    );

    expect(
      screen.getByRole('heading', { name: 'Agree before entering PathMap' })
    ).toBeInTheDocument();
    expect(screen.queryByText('PathMap app')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter PathMap' })).toBeDisabled();
  });

  it('stores acceptance and reveals the app', () => {
    render(
      <OnboardingTerms>
        <div>PathMap app</div>
      </OnboardingTerms>
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Enter PathMap' }));

    expect(window.localStorage.getItem(TERMS_KEY)).toBe('accepted');
    expect(screen.getByText('PathMap app')).toBeInTheDocument();
  });
});
