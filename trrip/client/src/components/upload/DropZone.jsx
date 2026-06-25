import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE, MAX_FILES } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';

export const DropZone = ({ files, onFilesChange }) => {
  const toast = useToast();

  const onDrop = useCallback(
    (accepted, rejected) => {
      if (rejected.length > 0) {
        const msgs = rejected.map((r) => r.errors[0]?.message).join(', ');
        toast.error(`Some files were rejected: ${msgs}`);
      }
      const next = [...files, ...accepted];
      if (next.length > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files allowed`);
        onFilesChange(next.slice(0, MAX_FILES));
      } else {
        onFilesChange(next);
      }
    },
    [files, onFilesChange, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
    disabled: files.length >= MAX_FILES,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12',
        'cursor-pointer transition-all duration-200',
        isDragActive
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
        files.length >= MAX_FILES && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            'rounded-full p-4 transition-colors',
            isDragActive ? 'bg-primary/10' : 'bg-muted group-hover:bg-primary/10'
          )}
        >
          <UploadCloud
            className={cn(
              'h-10 w-10 transition-colors',
              isDragActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
            )}
          />
        </div>
        <div>
          <p className="text-base font-medium text-foreground">
            {isDragActive ? 'Drop your files here' : 'Drag & drop your travel documents'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or <span className="text-primary font-medium">browse files</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG, WebP · Max {MAX_FILES} files · 10MB each
        </p>
        <p className="text-xs text-muted-foreground">
          Supports: flight tickets, hotel bookings, travel documents
        </p>
      </div>
    </div>
  );
};
