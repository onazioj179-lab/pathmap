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

  test('saves preferences locally', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'settings.save' }));
    expect(screen.getByRole('status')).toHaveTextContent('settings.saved');
  });
});
