const VARIANT_CLASS = {
  default: '',
  destructive: 'alert-error',
  success: 'alert-success',
  warning: 'alert-warning',
  info: 'alert-info',
};

export default function Alert({ variant = 'default', className = '', style, children, ...rest }) {
  const cls = ['alert', VARIANT_CLASS[variant] || '', className].filter(Boolean).join(' ');
  const props = { ...rest, className: cls };
  if (style) props.style = style;
  if (variant === 'destructive' && props.role === undefined) props.role = 'alert';
  return <div {...props}>{children}</div>;
}

export function AlertTitle({ className = '', children, ...rest }) {
  return (
    <div {...rest} className={['alert-title', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function AlertDescription({ className = '', children, ...rest }) {
  return (
    <div {...rest} className={['alert-description', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
