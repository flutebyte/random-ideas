import { cn } from '../../lib/utils';

export const EmptyState = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
    {Icon && (
      <div className="mb-4 rounded-full bg-muted p-6">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
    )}
    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    {description && <p className="mt-2 text-sm text-muted-foreground max-w-sm">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
