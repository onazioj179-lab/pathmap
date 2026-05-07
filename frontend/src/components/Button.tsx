import React from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  className = '',
  children,
  disabled,
  ...rest
}) => {
  const classes = [
    'pm-btn',
    `pm-btn--${variant}`,
    `pm-btn--${size}`,
    fullWidth ? 'pm-btn--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="pm-btn__spinner" aria-hidden="true" /> : leftIcon}
      <span>{children}</span>
    </button>
  );
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({ label, icon, className = '', ...rest }) => {
  const title = rest.title || label;

  return (
    <button
      type="button"
      className={['pm-icon-btn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={typeof title === 'string' ? title : label}
      {...rest}
    >
      {icon}
    </button>
  );
};
