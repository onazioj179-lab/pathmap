/**
 * PATHMAP — UserAvatar
 * Professional user identity indicator.
 *
 * © 2026 onazi Treasure Oj. All rights reserved.
 */

import React from 'react';
import { User } from 'lucide-react';
import './UserAvatar.css';

export interface UserAvatarProps {
  /** Display name used to derive initials. */
  name?: string;
  /** Optional title shown in the tooltip. */
  title?: string;
  /** Visual size variant. */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names. */
  className?: string;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');
}

const ICON_SIZE: Record<NonNullable<UserAvatarProps['size']>, number> = {
  sm: 14,
  md: 20,
  lg: 28,
};

const UserAvatar: React.FC<UserAvatarProps> = ({ name, title, size = 'md', className = '' }) => {
  const initials = name ? getInitials(name) : null;
  const ariaLabel = name ? `Avatar for ${name}` : 'User avatar';

  return (
    <div
      className={`user-avatar user-avatar--${size} ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
      title={title ?? name}
    >
      {initials ? (
        <span className="user-avatar__initials" aria-hidden="true">
          {initials}
        </span>
      ) : (
        <User
          className="user-avatar__icon"
          size={ICON_SIZE[size]}
          aria-hidden="true"
          strokeWidth={1.75}
        />
      )}
    </div>
  );
};

export default UserAvatar;
