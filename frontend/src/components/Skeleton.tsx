import React from 'react';
import './Skeleton.css';

type SkeletonVariant = 'line' | 'card' | 'circle';

interface SkeletonProps {
  variant?: SkeletonVariant;
  label?: string;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'line',
  label = 'Loading',
  className = '',
}) => (
  <span
    className={['pm-skeleton', `pm-skeleton--${variant}`, className].filter(Boolean).join(' ')}
    role="status"
    aria-label={label}
  />
);
