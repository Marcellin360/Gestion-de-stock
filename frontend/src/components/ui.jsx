// ============================================================================
// Petite bibliothèque d'interface : boutons, champs, cartes, tableaux, modale.
// Volontairement sans dépendance externe : le poste de la pharmacie doit
// pouvoir fonctionner sans accès à Internet.
// ============================================================================
import { useEffect } from 'react';
import { X } from 'lucide-react';

export const Btn = ({ children, variant = 'default', size, icon: Icon, ...props }) => (
  <button
    type={props.type || 'button'}
    className={`btn ${variant !== 'default' ? `btn--${variant}` : ''} ${size ? `btn--${size}` : ''}`}
    {...props}
  >
    {Icon ? <Icon size={17} /> : null}
    {children}
  </button>
);

export const Card = ({ title, actions, children, flush, wide }) => (
  <section className="card" style={wide ? { gridColumn: '1 / -1' } : undefined}>
    {(title || actions) && (
      <header className="card__head">
        {typeof title === 'string' ? <h2>{title}</h2> : title}
        <div className="spacer" />
        {actions}
      </header>
    )}
    <div className={`card__body ${flush ? 'card__body--flush' : ''}`}>{children}</div>
  </section>
);

export const Field = ({ label, hint, error, children, className = '' }) => (
  <label className={`field ${className}`}>
    {label ? <span>{label}</span> : null}
    {children}
    {hint ? <span className="field__hint">{hint}</span> : null}
    {error ? <span className="field__error">{error}</span> : null}
  </label>
);

export const Input = props => <input {...props} />;
export const Select = ({ children, ...props }) => <select {...props}>{children}</select>;
export const Textarea = props => <textarea {...props} />;

export const Check = ({ label, ...props }) => (
  <label className="check">
    <input type="checkbox" {...props} />
    <span>{label}</span>
  </label>
);

export const Badge = ({ tone = 'default', children }) => (
  <span className={`badge ${tone !== 'default' ? `badge--${tone}` : ''}`}>{children}</span>
);

export const Spinner = ({ page }) => <div className={`spinner ${page ? 'spinner--page' : ''}`} />;

export const Empty = ({ children = 'Aucune donnée à afficher.' }) => <div className="empty">{children}</div>;

export const Stat = ({ label, value, hint, tone }) => (
  <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
    <div className="stat__label">{label}</div>
    <div className="stat__value">{value}</div>
    {hint ? <div className="stat__hint">{hint}</div> : null}
  </div>
);

export const Banner = ({ tone = 'info', title, children, items }) => (
  <div className={`banner banner--${tone}`}>
    {title ? <strong>{title}</strong> : null}
    {children ? <div>{children}</div> : null}
    {items?.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
  </div>
);

export const PageHead = ({ title, subtitle, actions }) => (
  <div className="row" style={{ marginBottom: 14 }}>
    <div>
      <h1>{title}</h1>
      {subtitle ? <small>{subtitle}</small> : null}
    </div>
    <div className="spacer" />
    {actions}
  </div>
);

export function Modal({ title, onClose, children, footer, wide = false, size = '' }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // size = nom de variante CSS (2.7.24 : 'detail' = très grande boîte pleine écran).
  const classes = `modal${wide ? ' modal--wide' : ''}${size ? ` modal--${size}` : ''}`;
  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className={classes} role="dialog" aria-modal="true">
        <header className="modal__head">
          <h2>{title}</h2>
          <div className="spacer" />
          <Btn variant="ghost" onClick={onClose} aria-label="Fermer" icon={X} />
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Onglets : regroupent plusieurs écrans proches en une seule entrée de menu. */
export const Tabs = ({ items, value, onChange }) => (
  <div className="tabs" role="tablist">
    {items.map(item => (
      <button
        key={item.route || item.value}
        type="button"
        role="tab"
        aria-selected={(item.route || item.value) === value}
        className={((item.route || item.value) === value) ? 'tabs__item tabs__item--active' : 'tabs__item'}
        onClick={() => onChange(item.route || item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
);

/** Choix rapides : remplace une saisie par des boutons (taux de marge, durées…). */
export const Choice = ({ options, value, onChange, columns }) => (
  <div className="choice" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
    {options.map(option => (
      <button
        key={String(option.value)}
        type="button"
        className={String(option.value) === String(value) ? 'choice__item choice__item--active' : 'choice__item'}
        onClick={() => onChange(option.value)}
      >
        <span>{option.label}</span>
        {option.hint ? <small>{option.hint}</small> : null}
      </button>
    ))}
  </div>
);

export const Table = ({ columns, children, footer }) => (
  <div className="table-scroll">
    <table className="data">
      <thead>
        <tr>{columns.map((column, index) => <th key={index} className={column.num ? 'num' : ''}>{column.label}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
      {footer ? <tfoot>{footer}</tfoot> : null}
    </table>
  </div>
);

export const statusTone = status => ({
  VALIDATED: 'ok', DRAFT: 'info', CANCELLED: 'danger', ABANDONED: 'danger',
  PENDING: 'warn', ACCEPTED: 'ok', REPLACED: 'info', REFUNDED: 'info', REJECTED: 'danger',
  OPEN: 'info', PARTIAL: 'warn', CLOSED: 'ok', AVAILABLE: 'ok', BLOCKED: 'danger'
}[status] || 'default');

export const StatusBadge = ({ status, labels = {} }) => (
  <Badge tone={statusTone(status)}>{labels[status] || status}</Badge>
);

export const ErrorBox = ({ error }) => {
  if (!error) return null;
  const details = error.details?.length ? error.details : null;
  return <Banner tone="error" title="Opération refusée"><div>{error.message}</div>{details ? <ul>{details.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}</Banner>;
};