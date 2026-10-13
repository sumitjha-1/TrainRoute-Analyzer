import './Button.css';

export function Button({ variant = 'default', size = 'md', icon, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {icon && <span className="btn-icon">{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ variant = 'ghost', active = false, className = '', ...rest }) {
  return <button className={`icon-btn icon-btn-${variant} ${active ? 'is-active' : ''} ${className}`} {...rest} />;
}
