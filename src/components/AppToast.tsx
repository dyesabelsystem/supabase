import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Toaster, toast as sonnerToast, type ExternalToast } from 'sonner';

type AppToastType = 'success' | 'info' | 'warning' | 'error';

interface AppToastAction {
  label: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

type AppToastOptions = Omit<ExternalToast, 'action' | 'cancel' | 'description' | 'icon' | 'jsx'> & {
  action?: AppToastAction;
  description?: React.ReactNode;
};

interface AppToastCardProps {
  id: string | number;
  type: AppToastType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: AppToastAction;
}

const toastPresentation: Record<AppToastType, { icon: React.ElementType; label: string }> = {
  success: { icon: CheckCircle2, label: 'Success' },
  info: { icon: Info, label: 'Update' },
  warning: { icon: AlertTriangle, label: 'Attention' },
  error: { icon: XCircle, label: 'Something went wrong' }
};

const AppToastCard: React.FC<AppToastCardProps> = ({ id, type, title, description, action }) => {
  const presentation = toastPresentation[type];
  const Icon = presentation.icon;

  return (
    <div className={`app-toast app-toast--${type}`}>
      <div className="app-toast__glow" aria-hidden="true" />
      <div className="app-toast__icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2.25} />
      </div>

      <div className="app-toast__content">
        <span className="app-toast__eyebrow">{presentation.label}</span>
        <div className="app-toast__title">{title}</div>
        {description ? <div className="app-toast__description">{description}</div> : null}
        {action ? (
          <button className="app-toast__action" type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="app-toast__close"
        onClick={() => sonnerToast.dismiss(id)}
        aria-label="Dismiss notification"
      >
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
};

const showToast = (
  type: AppToastType,
  title: React.ReactNode,
  options: AppToastOptions = {}
): string | number => {
  const { action, description, ...sonnerOptions } = options;

  return sonnerToast.custom(
    (id) => (
      <AppToastCard id={id} type={type} title={title} description={description} action={action} />
    ),
    // The custom card owns the description. Passing it to Sonner as well makes
    // Sonner render a second, unstyled description below the card.
    { ...sonnerOptions, unstyled: true }
  );
};

export const appToast = {
  success: (title: React.ReactNode, options?: AppToastOptions) => showToast('success', title, options),
  info: (title: React.ReactNode, options?: AppToastOptions) => showToast('info', title, options),
  warning: (title: React.ReactNode, options?: AppToastOptions) => showToast('warning', title, options),
  error: (title: React.ReactNode, options?: AppToastOptions) => showToast('error', title, options),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id)
};

export const AppToastViewport: React.FC = () => (
  <Toaster
    position="bottom-right"
    visibleToasts={5}
    gap={12}
    offset={20}
    mobileOffset={12}
    expand
    toastOptions={{ unstyled: true }}
    containerAriaLabel="DYESABEL notifications"
  />
);
