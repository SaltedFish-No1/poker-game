import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

/* 基础控件库：规范见 docs/UI-UX-SPEC.md，展示页 #/design */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      {...rest}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'gold' | 'green' | 'red';
}) {
  const cls = tone === 'default' ? 'badge' : `badge badge--${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  wide,
  onClose,
}: {
  open: boolean;
  title?: string;
  children: ReactNode;
  wide?: boolean;
  onClose?: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export interface ToastItem {
  id: number;
  text: string;
  tone: 'error' | 'info' | 'success';
}

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone === 'info' ? 'toast--info' : t.tone === 'success' ? 'toast--success' : ''}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
