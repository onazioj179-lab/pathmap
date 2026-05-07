/**
 * PATHMAP — Settings
 * User preference control surface.
 *
 * © 2026 onazi Treasure Oj. All rights reserved.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Bug,
  Check,
  Cloud,
  Compass,
  CreditCard,
  Globe2,
  KeyRound,
  Languages,
  Map,
  Moon,
  Ruler,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  WifiOff,
} from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { Button } from '../components/Button';
import { ToastStack } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { trackingService } from '../services/trackingService';
import {
  accountBillingService,
  type PersistedSettings,
} from '../services/accountBillingService';
import './Settings.css';

type ThemePreference = 'dark' | 'light' | 'system';
type UnitPreference = 'metric' | 'imperial';
type LanguagePreference = 'en' | 'es';
type BillingPlan = 'starter' | 'pro' | 'enterprise';

interface SettingsState {
  language: LanguagePreference;
  theme: ThemePreference;
  units: UnitPreference;
  offline: boolean;
  precisionMode: boolean;
  safetyAlerts: boolean;
  reducedMotion: boolean;
  debug: boolean;
  billingPlan: BillingPlan;
}

interface PricingPlan {
  id: BillingPlan;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
}

const STORAGE_KEY = 'pathmap.settings.v100';

const defaultSettings: SettingsState = {
  language: 'en',
  theme: 'dark',
  units: 'metric',
  offline: false,
  precisionMode: true,
  safetyAlerts: true,
  reducedMotion: false,
  debug: false,
  billingPlan: 'pro',
};

const loadSettings = (): SettingsState => {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
};

const applyThemePreference = (theme: ThemePreference) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.pathmapTheme = theme;
};

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [saved, setSaved] = useState(false);
  const { messages, showToast, dismiss } = useToast();

  const activeLanguage = (i18n.resolvedLanguage || settings.language).startsWith('es')
    ? 'es'
    : 'en';

  const statusItems = useMemo(() => {
    const activePlanLabel =
      settings.billingPlan === 'starter'
        ? t('settings.planStarterName', 'Starter')
        : settings.billingPlan === 'enterprise'
          ? t('settings.planEnterpriseName', 'Enterprise')
          : t('settings.planProName', 'Pro');

    return [
      {
        label: t('settings.language'),
        value: activeLanguage === 'en' ? 'English' : 'Espanol',
        icon: Languages,
      },
      {
        label: t('settings.theme'),
        value:
          settings.theme === 'system'
            ? t('settings.themeSystem', 'System')
            : settings.theme === 'dark'
              ? t('settings.themeDark')
              : t('settings.themeLight'),
        icon: settings.theme === 'light' ? Sun : Moon,
      },
      {
        label: t('settings.unitSystem'),
        value:
          settings.units === 'metric' ? t('settings.unitsMetric') : t('settings.unitsImperial'),
        icon: Ruler,
      },
      {
        label: t('settings.syncMode', 'Sync'),
        value: settings.offline ? t('settings.offlineMode') : t('settings.onlineMode', 'Online'),
        icon: settings.offline ? WifiOff : Cloud,
      },
      {
        label: t('settings.licenseStatus', 'License'),
        value: t('settings.commercialLicense', 'Commercial'),
        icon: KeyRound,
      },
      {
        label: t('settings.billingPlan', 'Plan'),
        value: activePlanLabel,
        icon: CreditCard,
      },
    ];
  }, [activeLanguage, settings.billingPlan, settings.offline, settings.theme, settings.units, t]);

  const pricingPlans = useMemo<PricingPlan[]>(
    () => [
      {
        id: 'starter',
        name: t('settings.planStarterName', 'Starter'),
        price: t('settings.planStarterPrice', '$19'),
        cadence: t('settings.planCadence', 'per seat / month'),
        description: t(
          'settings.planStarterDescription',
          'For small teams evaluating private encrypted tracking.'
        ),
        features: [
          t('settings.planStarterFeatureOne', 'Up to 5 tracked devices'),
          t('settings.planStarterFeatureTwo', 'Encrypted live map and route sharing'),
          t('settings.planStarterFeatureThree', 'Community deployment support'),
        ],
      },
      {
        id: 'pro',
        name: t('settings.planProName', 'Pro'),
        price: t('settings.planProPrice', '$49'),
        cadence: t('settings.planCadence', 'per seat / month'),
        description: t(
          'settings.planProDescription',
          'For field operations that need audit-ready navigation controls.'
        ),
        features: [
          t('settings.planProFeatureOne', 'Up to 25 tracked devices'),
          t('settings.planProFeatureTwo', 'Priority safety, route, and diagnostics workflows'),
          t('settings.planProFeatureThree', 'Commercial production license'),
        ],
      },
      {
        id: 'enterprise',
        name: t('settings.planEnterpriseName', 'Enterprise'),
        price: t('settings.planEnterprisePrice', 'Custom'),
        cadence: t('settings.planEnterpriseCadence', 'annual contract'),
        description: t(
          'settings.planEnterpriseDescription',
          'For regulated teams that need private deployment, SLAs, and controls.'
        ),
        features: [
          t('settings.planEnterpriseFeatureOne', 'Unlimited tracked devices by agreement'),
          t('settings.planEnterpriseFeatureTwo', 'Private deployment and security review'),
          t('settings.planEnterpriseFeatureThree', 'Dedicated support and license terms'),
        ],
      },
    ],
    [t]
  );

  useEffect(() => {
    applyThemePreference(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    let active = true;

    (async () => {
      const token = trackingService.getToken();
      const hydrated = await accountBillingService.loadHydratedSettings(token);

      if (!active || Object.keys(hydrated).length === 0) {
        return;
      }

      setSettings(prev => ({ ...prev, ...hydrated }));
    })();

    return () => {
      active = false;
    };
  }, []);

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const changeLanguage = async (language: LanguagePreference) => {
    await i18n.changeLanguage(language);
    updateSetting('language', language);
  };

  const handleSave = async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    const token = trackingService.getToken();
    await accountBillingService.persistSettings(token, settings as PersistedSettings);

    setSaved(true);
    showToast({
      kind: 'success',
      title: t('settings.saveSuccess', 'Settings saved'),
      message: t('settings.saveSuccessDetail', 'Your PathMap preferences are now active.'),
    });
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    i18n.changeLanguage(defaultSettings.language);
    applyThemePreference(defaultSettings.theme);
    setSaved(false);
    showToast({
      kind: 'info',
      title: t('settings.resetSuccess', 'Settings reset'),
      message: t('settings.resetSuccessDetail', 'Defaults have been restored for this device.'),
    });
  };

  const renderSegment = <T extends string>(
    label: string,
    value: T,
    options: Array<{ label: string; value: T; icon?: React.ElementType }>,
    onChange: (value: T) => void
  ) => (
    <div className="settings-control" role="group" aria-label={label}>
      {options.map(option => {
        const Icon = option.icon;
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            className={`settings-segment ${active ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon aria-hidden="true" size={16} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderSwitch = (
    label: string,
    description: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    Icon: React.ElementType
  ) => (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden="true">
        <Icon size={18} />
      </div>
      <div className="settings-row-copy">
        <div className="settings-row-title">{label}</div>
        <div className="settings-row-detail">{description}</div>
      </div>
      <label className={`settings-switch ${checked ? 'on' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          aria-label={label}
          onChange={event => onChange(event.target.checked)}
        />
        <span />
      </label>
    </div>
  );

  return (
    <div className="settings-page">
      <aside className="settings-sidebar" aria-label={t('settings.title')}>
        <div className="settings-brand">
          <div className="settings-brand-mark" aria-hidden="true">
            <Map size={22} />
          </div>
          <div>
            <div className="settings-brand-name">PathMap</div>
            <div className="settings-brand-status">{t('app.status')}</div>
          </div>
        </div>

        <div className="settings-sidebar-user">
          <UserAvatar size="md" />
          <div className="settings-sidebar-user-copy">
            <div className="settings-sidebar-user-name">{t('settings.user', 'You')}</div>
            <div className="settings-sidebar-user-role">
              {t('settings.userRole', 'Local account')}
            </div>
          </div>
        </div>

        <nav className="settings-sidebar-nav" aria-label="Settings sections">
          <a href="#experience">{t('settings.experience', 'Experience')}</a>
          <a href="#navigation">{t('settings.navigation', 'Navigation')}</a>
          <a href="#billing">{t('settings.billing', 'Billing')}</a>
          <a href="#privacy">{t('settings.privacy', 'Privacy')}</a>
        </nav>

        <footer className="settings-sidebar-footer">
          <span>PathMap</span>
          <span className="settings-sidebar-footer-sep" aria-hidden="true">
            ·
          </span>
          <span>© 2026 onazi Treasure Oj</span>
          <span className="settings-sidebar-footer-sep" aria-hidden="true">
            ·
          </span>
          <span>{t('settings.commercialLicense', 'Commercial')}</span>
        </footer>
      </aside>

      <main className="settings-main">
        <header className="settings-header">
          <Button
            className="settings-back"
            type="button"
            variant="ghost"
            size="md"
            leftIcon={<ArrowLeft size={18} aria-hidden="true" />}
            onClick={() => navigate('/')}
          >
            {t('nav.home')}
          </Button>

          <div className="settings-heading">
            <div className="settings-kicker">{t('nav.settings')}</div>
            <h1>{t('settings.title')}</h1>
            <p>
              {t(
                'settings.subtitle',
                'Tune the map, tracking, alerts, and diagnostics from one quiet control surface.'
              )}
            </p>
          </div>
        </header>

        <section className="settings-overview" aria-label="Current settings">
          {statusItems.map(item => {
            const Icon = item.icon;

            return (
              <div className="settings-stat" key={item.label}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            );
          })}
        </section>

        <section className="settings-section" id="experience">
          <div className="settings-section-heading">
            <Globe2 size={18} aria-hidden="true" />
            <h2>{t('settings.language')}</h2>
          </div>
          <div className="settings-panel">
            <div className="settings-row stacked">
              <div className="settings-row-copy">
                <div className="settings-row-title">{t('settings.language')}</div>
                <div className="settings-row-detail">
                  {t('settings.languageDetail', 'Interface labels and regional defaults.')}
                </div>
              </div>
              {renderSegment<LanguagePreference>(
                t('settings.language'),
                activeLanguage,
                [
                  { label: 'English', value: 'en' },
                  { label: 'Espanol', value: 'es' },
                ],
                changeLanguage
              )}
            </div>

            <div className="settings-row stacked">
              <div className="settings-row-copy">
                <div className="settings-row-title">{t('settings.theme')}</div>
                <div className="settings-row-detail">
                  {t('settings.themeDetail', 'Display mode for map controls and panels.')}
                </div>
              </div>
              {renderSegment<ThemePreference>(
                t('settings.theme'),
                settings.theme,
                [
                  { label: t('settings.themeDark'), value: 'dark', icon: Moon },
                  { label: t('settings.themeLight'), value: 'light', icon: Sun },
                  {
                    label: t('settings.themeSystem', 'System'),
                    value: 'system',
                    icon: SlidersHorizontal,
                  },
                ],
                value => updateSetting('theme', value)
              )}
            </div>
          </div>
        </section>

        <section className="settings-section" id="navigation">
          <div className="settings-section-heading">
            <Compass size={18} aria-hidden="true" />
            <h2>{t('settings.unitSystem')}</h2>
          </div>
          <div className="settings-panel">
            <div className="settings-row stacked">
              <div className="settings-row-copy">
                <div className="settings-row-title">{t('settings.unitSystem')}</div>
                <div className="settings-row-detail">
                  {t('settings.unitsDetail', 'Distance, speed, altitude, and route summaries.')}
                </div>
              </div>
              {renderSegment<UnitPreference>(
                t('settings.unitSystem'),
                settings.units,
                [
                  { label: t('settings.unitsMetric'), value: 'metric' },
                  { label: t('settings.unitsImperial'), value: 'imperial' },
                ],
                value => updateSetting('units', value)
              )}
            </div>

            {renderSwitch(
              t('settings.precisionMode', 'High precision tracking'),
              t(
                'settings.precisionModeDetail',
                'Use tighter GPS sampling when navigation is active.'
              ),
              settings.precisionMode,
              checked => updateSetting('precisionMode', checked),
              Compass
            )}

            {renderSwitch(
              t('settings.offlineMode'),
              t(
                'settings.offlineModeDetail',
                'Keep recent routes and map data available during weak signal.'
              ),
              settings.offline,
              checked => updateSetting('offline', checked),
              WifiOff
            )}
          </div>
        </section>

        <section className="settings-section" id="billing">
          <div className="settings-section-heading">
            <CreditCard size={18} aria-hidden="true" />
            <h2>{t('settings.billing', 'Billing')}</h2>
          </div>
          <div className="settings-panel settings-billing-panel">
            <div className="settings-license-callout">
              <KeyRound size={18} aria-hidden="true" />
              <div>
                <div className="settings-row-title">
                  {t('settings.licenseTitle', 'Commercial license required')}
                </div>
                <div className="settings-row-detail">
                  {t(
                    'settings.licenseDetail',
                    'PathMap is proprietary software. Local evaluation is allowed, but production, resale, hosted access, or commercial use requires an active paid plan.'
                  )}
                </div>
              </div>
            </div>

            <div
              className="settings-pricing-grid"
              role="radiogroup"
              aria-label={t('settings.planSelection', 'Billing plan')}
            >
              {pricingPlans.map(plan => {
                const active = settings.billingPlan === plan.id;

                return (
                  <label className={`settings-plan-card ${active ? 'active' : ''}`} key={plan.id}>
                    <input
                      type="radio"
                      name="billingPlan"
                      value={plan.id}
                      checked={active}
                      aria-label={plan.name}
                      onChange={() => updateSetting('billingPlan', plan.id)}
                    />
                    <span className="settings-plan-card-top">
                      <span>
                        <span className="settings-plan-name">{plan.name}</span>
                        <span className="settings-plan-description">{plan.description}</span>
                      </span>
                      <span className="settings-plan-badge">
                        {active
                          ? t('settings.currentPlan', 'Current plan')
                          : t('settings.paidPlan', 'Paid plan')}
                      </span>
                    </span>
                    <span className="settings-plan-price-row">
                      <span className="settings-plan-price">{plan.price}</span>
                      <span className="settings-plan-cadence">{plan.cadence}</span>
                    </span>
                    <span className="settings-plan-features">
                      {plan.features.map(feature => (
                        <span className="settings-plan-feature" key={feature}>
                          <Check size={14} aria-hidden="true" />
                          {feature}
                        </span>
                      ))}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="settings-section" id="privacy">
          <div className="settings-section-heading">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2>{t('settings.notifications')}</h2>
          </div>
          <div className="settings-panel">
            {renderSwitch(
              t('settings.safetyAlerts', 'Safety alerts'),
              t(
                'settings.safetyAlertsDetail',
                'Notify when routes, zones, or device status need attention.'
              ),
              settings.safetyAlerts,
              checked => updateSetting('safetyAlerts', checked),
              Bell
            )}

            {renderSwitch(
              t('settings.reducedMotion', 'Reduced motion'),
              t(
                'settings.reducedMotionDetail',
                'Lower panel animation and visual motion across the app.'
              ),
              settings.reducedMotion,
              checked => updateSetting('reducedMotion', checked),
              SlidersHorizontal
            )}

            {renderSwitch(
              t('settings.debugMode'),
              t(
                'settings.debugModeDetail',
                'Show diagnostics, logs, and engine status while testing.'
              ),
              settings.debug,
              checked => updateSetting('debug', checked),
              Bug
            )}
          </div>
        </section>

        <div className="settings-actions" role="group" aria-label="Settings actions">
          <Button
            className="settings-reset"
            type="button"
            variant="ghost"
            size="md"
            onClick={handleReset}
          >
            {t('settings.reset')}
          </Button>
          {saved && (
            <span className="settings-saved" role="status">
              <Check size={16} aria-hidden="true" />
              {t('settings.saved', 'Saved')}
            </span>
          )}
          <Button
            className="settings-save"
            type="button"
            variant="primary"
            size="md"
            leftIcon={<Save size={17} aria-hidden="true" />}
            onClick={handleSave}
          >
            {t('settings.save')}
          </Button>
        </div>
      </main>
      <ToastStack messages={messages} onDismiss={dismiss} />
    </div>
  );
};

export default Settings;
