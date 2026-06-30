interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const icons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function Alert({ type, children }: AlertProps) {
  return (
    <div className={`alert alert-${type}`} role="alert">
      <span>{icons[type]}</span>
      <div>{children}</div>
    </div>
  );
}
