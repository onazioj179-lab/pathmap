/**
 * PATHMAP — Settings page tests
 * © 2026 onazi Treasure Oj. All rights reserved.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';
import { BrowserRouter } from 'react-router-dom';
import { describe, test, expect, vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'en',
      resolvedLanguage: 'en',
    },
  }),
}));

const renderSettings = () => {
  return render(
    <BrowserRouter>
      <Settings />
    </BrowserRouter>
  );
};

describe('Settings Page', () => {
  test('renders settings title', () => {
    renderSettings();
    expect(screen.getByText('settings.title')).toBeInTheDocument();
  });

  test('renders language buttons', () => {
    renderSettings();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Espanol' })).toBeInTheDocument();
  });

  test('renders theme selection', () => {
    renderSettings();
    expect(screen.getAllByText('settings.theme').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'settings.themeDark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.themeLight' })).toBeInTheDocument();
  });

  test('renders unit selection', () => {
    renderSettings();
    expect(screen.getAllByText('settings.unitSystem').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'settings.unitsMetric' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.unitsImperial' })).toBeInTheDocument();
  });

  test('saves preferences locally', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
    // handleSave is async (persists settings) and sets the saved flag after an
    // await, so wait for the indicator instead of asserting synchronously.
    expect(await screen.findByText('settings.saved')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Dismiss settings.saveSuccess' })
    ).toBeInTheDocument();
  });

  test('renders a user avatar in the sidebar', () => {
    renderSettings();
    // UserAvatar renders an img role
    const avatar = screen.getByRole('img', { name: 'User avatar' });
    expect(avatar).toBeInTheDocument();
  });

  test('renders the license footer with attribution', () => {
    renderSettings();
    expect(screen.getByText(/onazi Treasure Oj/)).toBeInTheDocument();
  });

  test('navigates back when the back button is clicked', () => {
    renderSettings();
    const backBtn = screen.getByRole('button', { name: /nav\.home/i });
    expect(backBtn).toBeInTheDocument();
  });

  test('shows reset button', () => {
    renderSettings();
    const resetBtn = screen.getByRole('button', { name: 'settings.reset' });
    expect(resetBtn).toBeInTheDocument();
  });

  test('renders commercial license and billing plans', () => {
    renderSettings();
    expect(screen.getAllByText('settings.billing').length).toBeGreaterThan(0);
    expect(screen.getByText('settings.licenseTitle')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'settings.planStarterName' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'settings.planProName' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'settings.planEnterpriseName' })).toBeInTheDocument();
  });

  test('save-then-reset clears the saved indicator', async () => {
    renderSettings();
    const saveBtn = screen.getByRole('button', { name: 'settings.save' });
    const resetBtn = screen.getByRole('button', { name: 'settings.reset' });
    fireEvent.click(saveBtn);
    expect(await screen.findByText('settings.saved')).toBeInTheDocument();
    fireEvent.click(resetBtn);
    expect(screen.queryByText('settings.saved')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Dismiss settings.resetSuccess' })
    ).toBeInTheDocument();
  });
});
