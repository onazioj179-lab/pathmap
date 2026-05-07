/**
 * PATHMAP — UserAvatar tests
 * © 2026 onazi Treasure Oj. All rights reserved.
 */

import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import UserAvatar from './UserAvatar';

describe('UserAvatar', () => {
  test('renders a generic icon when no name is provided', () => {
    render(<UserAvatar />);
    const avatar = screen.getByRole('img', { name: 'User avatar' });
    expect(avatar).toBeInTheDocument();
    expect(avatar).not.toHaveTextContent(/[A-Z]{1,2}/);
  });

  test('renders initials derived from a single-word name', () => {
    render(<UserAvatar name="onazi" />);
    const avatar = screen.getByRole('img', { name: 'Avatar for onazi' });
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveTextContent('O');
  });

  test('renders two-letter initials from a full name', () => {
    render(<UserAvatar name="onazi Treasure" />);
    const avatar = screen.getByRole('img', { name: 'Avatar for onazi Treasure' });
    expect(avatar).toHaveTextContent('OT');
  });

  test('caps initials at two characters for multi-word names', () => {
    render(<UserAvatar name="onazi Treasure Oj" />);
    const avatar = screen.getByRole('img');
    // Only first two words contribute initials
    expect(avatar.textContent).toHaveLength(2);
    expect(avatar).toHaveTextContent('OT');
  });

  test('applies the correct size modifier class', () => {
    const { container: sm } = render(<UserAvatar size="sm" />);
    expect(sm.querySelector('.user-avatar--sm')).toBeTruthy();

    const { container: md } = render(<UserAvatar size="md" />);
    expect(md.querySelector('.user-avatar--md')).toBeTruthy();

    const { container: lg } = render(<UserAvatar size="lg" />);
    expect(lg.querySelector('.user-avatar--lg')).toBeTruthy();
  });

  test('defaults to md size when no size prop is given', () => {
    const { container } = render(<UserAvatar />);
    expect(container.querySelector('.user-avatar--md')).toBeTruthy();
  });

  test('merges extra className without clobbering base class', () => {
    const { container } = render(<UserAvatar className="custom-cls" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('user-avatar');
    expect(el.className).toContain('custom-cls');
  });

  test('exposes name as title attribute', () => {
    const { container } = render(<UserAvatar name="onazi Treasure Oj" title="Navigator" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('title')).toBe('Navigator');
  });

  test('falls back to name as title when no explicit title given', () => {
    const { container } = render(<UserAvatar name="onazi Treasure" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('title')).toBe('onazi Treasure');
  });
});
