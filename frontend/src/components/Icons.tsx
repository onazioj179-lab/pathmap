/**
 * PATHFINDER V48 - ICON COMPONENTS
 * 
 * Professional SVG icons using Heroicons
 * NO EMOJI FALLBACKS
 */

import React from 'react';
import {
  MapPinIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SignalIcon,
  WifiIcon,
  ClockIcon,
  ChartBarIcon,
  BoltIcon,
  LockClosedIcon,
  LockOpenIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

interface IconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

// Navigation Icons
export const LocationIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <MapPinIcon className={`${sizeMap[size]} ${className}`} />
);

export const NavigationIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <MapPinIcon className={`${sizeMap[size]} ${className}`} />
);

export const CompassIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    <path fill="currentColor" d="M12 8l2 4-4 2-2-4z" />
  </svg>
);

// Status Icons
export const SafeIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ShieldCheckIcon className={`${sizeMap[size]} ${className}`} />
);

export const WarningIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ShieldExclamationIcon className={`${sizeMap[size]} ${className}`} />
);

export const DangerIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ExclamationTriangleIcon className={`${sizeMap[size]} ${className}`} />
);

export const SuccessIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <CheckCircleIcon className={`${sizeMap[size]} ${className}`} />
);

export const ErrorIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <XCircleIcon className={`${sizeMap[size]} ${className}`} />
);

// Action Icons
export const PlayIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <PlayIcon className={`${sizeMap[size]} ${className}`} />
);

export const PauseIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <PauseIcon className={`${sizeMap[size]} ${className}`} />
);

export const StopIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <StopIcon className={`${sizeMap[size]} ${className}`} />
);

export const RefreshIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ArrowPathIcon className={`${sizeMap[size]} ${className}`} />
);

export const SettingsIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <Cog6ToothIcon className={`${sizeMap[size]} ${className}`} />
);

// UI Icons
export const MenuIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <Bars3Icon className={`${sizeMap[size]} ${className}`} />
);

export const CloseIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <XMarkIcon className={`${sizeMap[size]} ${className}`} />
);

export const ChevronUpIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ChevronUpIcon className={`${sizeMap[size]} ${className}`} />
);

export const ChevronDownIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ChevronDownIcon className={`${sizeMap[size]} ${className}`} />
);

export const ChevronLeftIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ChevronLeftIcon className={`${sizeMap[size]} ${className}`} />
);

export const ChevronRightIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ChevronRightIcon className={`${sizeMap[size]} ${className}`} />
);

// Connection Icons
export const SignalIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <SignalIcon className={`${sizeMap[size]} ${className}`} />
);

export const WifiIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <WifiIcon className={`${sizeMap[size]} ${className}`} />
);

// Stats Icons
export const ClockIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ClockIcon className={`${sizeMap[size]} ${className}`} />
);

export const ChartIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <ChartBarIcon className={`${sizeMap[size]} ${className}`} />
);

export const ActivityIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <BoltIcon className={`${sizeMap[size]} ${className}`} />
);

export const BatteryIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="7" width="18" height="10" rx="2" strokeWidth="2" />
    <path strokeLinecap="round" strokeWidth="2" d="M22 10v4" />
    <rect x="5" y="10" width="12" height="4" rx="1" fill="currentColor" />
  </svg>
);

// Security Icons
export const LockIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <LockClosedIcon className={`${sizeMap[size]} ${className}`} />
);

export const UnlockIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <LockOpenIcon className={`${sizeMap[size]} ${className}`} />
);

export const EyeIconComponent: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <EyeIcon className={`${sizeMap[size]} ${className}`} />
);

export const EyeOffIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <EyeSlashIcon className={`${sizeMap[size]} ${className}`} />
);

/**
 * Speedometer icon (custom SVG)
 */
export const SpeedometerIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

/**
 * Distance icon (custom SVG)
 */
export const DistanceIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

/**
 * Target/Route icon (custom SVG)
 */
export const TargetIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" strokeWidth="2" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

/**
 * Person/User icon
 */
export const PersonIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

/**
 * Place/Pin icon
 */
export const PlaceIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

/**
 * Object/Box icon
 */
export const ObjectIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

/**
 * Star/Favorite icon
 */
export const StarIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

/**
 * Home icon
 */
export const HomeIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

/**
 * Broadcast/Signal icon
 */
export const BroadcastIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
  </svg>
);

/**
 * Rocket/Launch icon
 */
export const RocketIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>
);

/**
 * Refresh/Sync icon
 */
export const SyncIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

/**
 * Touch/Tap icon
 */
export const TapIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
  </svg>
);

/**
 * Delete/Trash icon
 */
export const TrashIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

/**
 * Alert/Warning icon
 */
export const AlertIcon: React.FC<IconProps> = ({ className = '', size = 'md' }) => (
  <svg className={`${sizeMap[size]} ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);
