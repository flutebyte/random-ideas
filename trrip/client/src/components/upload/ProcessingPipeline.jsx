import { Upload, Scan, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Spinner } from '../ui/Spinner';

const steps = [
  { id: 'uploading', label: 'Uploading documents', icon: Upload },
  { id: 'extracting', label: 'Extracting trip details', icon: Scan },
  { id: 'generating', label: 'Generating your itinerary', icon: Sparkles },
];

const phaseIndex = { idle: -1, uploading: 0, extracting: 1, generating: 2, done: 3, error: -1 };

export const ProcessingPipeline = ({ phase, uploadProgress, error }) => {
  const currentIndex = phaseIndex[phase] ?? -1;

  return (
    <div className="rounded-xl border bg-card p-8">
      <h3 className="text-lg font-semibold text-center mb-8">Processing your trip</h3>

      <div className="space-y-4">
        {steps.map((step, i) => {
          const StepIcon = step.icon;
          const isActive = currentIndex === i;
          const isDone = currentIndex > i || phase === 'done';
          const isPending = currentIndex < i;

          return (
            <div key={step.id} className="flex items-center gap-4">
              <div
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500',
                  isDone && 'border-green-500 bg-green-50',
                  isActive && 'border-primary bg-primary/10',
                  isPending && 'border-muted bg-muted/30'
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : isActive ? (
                  <Spinner size="sm" />
                ) : (
                  <StepIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1">
                <p
                  className={cn(
                    'text-sm font-medium transition-colors',
                    isDone && 'text-green-700',
                    isActive && 'text-primary',
                    isPending && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </p>
                {isActive && step.id === 'uploading' && uploadProgress > 0 && (
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                {isActive && step.id !== 'uploading' && (
                  <p className="text-xs text-muted-foreground mt-0.5">This may take a moment...</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {phase === 'done' && (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-green-50 p-3 text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          <p className="text-sm font-medium">Your itinerary is ready!</p>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="mt-6 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Processing failed</p>
            <p className="text-xs mt-0.5 text-red-600">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};
