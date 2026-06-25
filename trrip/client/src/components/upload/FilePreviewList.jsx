import { X, FileText, ImageIcon } from 'lucide-react';
import { humanFileSize, isPDF } from '../../utils/fileHelpers';
import { Button } from '../ui/Button';

const FilePreviewItem = ({ file, onRemove }) => {
  const isFilePDF = isPDF(file.type);
  const preview = !isFilePDF ? URL.createObjectURL(file) : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
        {preview ? (
          <img src={preview} alt={file.name} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {isFilePDF ? 'PDF' : 'Image'} · {humanFileSize(file.size)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(file)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const FilePreviewList = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        {files.length} file{files.length !== 1 ? 's' : ''} selected
      </p>
      <div className="space-y-2">
        {files.map((file, i) => (
          <FilePreviewItem key={`${file.name}-${i}`} file={file} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
};
