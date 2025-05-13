import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FileText, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

// This type would ideally live in a shared types file (e.g., src/types/chat.ts)
// and be imported by both page.tsx and this component.
// For now, ensure it matches the definition in page.tsx if not yet centralized.
export interface UploadedFile {
  file: File;
  id: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

interface FileUploadManagerProps {
  uploadedFiles: UploadedFile[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
}


const FileUploadManager: React.FC<FileUploadManagerProps> = ({
  uploadedFiles,
  onRemoveFile,
  onClearAll,
}) => {
  const [minimized, setMinimized] = useState(true);

  // Minimize by default after upload
  useEffect(() => {
    if (uploadedFiles.length > 0) setMinimized(true);
  }, [uploadedFiles.length]);

  if (uploadedFiles.length === 0) {
    return null; // Don't render anything if there are no files
  }

  return (
    <div className="border-t p-2 bg-muted/50">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">
          {uploadedFiles.length} file{uploadedFiles.length !== 1 && 's'} uploaded
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label={minimized ? 'Expand file list' : 'Collapse file list'}
            onClick={() => setMinimized((m) => !m)}
            className="p-1 rounded hover:bg-accent"
          >
            {minimized ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          <button
            aria-label="Clear all uploaded files"
            onClick={onClearAll}
            className="p-1 rounded hover:bg-red-100 text-red-600"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {!minimized && (
        <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
          {uploadedFiles.map((file) => (
            <li key={file.id} className={cn(
              "flex items-center justify-between p-2 rounded text-sm",
              file.status === 'success' && "bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-300",
              file.status === 'error' && "bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-300",
              file.status === 'uploading' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-800/30 dark:text-yellow-300",
            )}>
              <div className="flex items-center space-x-2 overflow-hidden">
                <FileText size={16} className="flex-shrink-0"/>
                <span className="truncate" title={file.file.name}>{file.file.name}</span>
                {file.status === 'uploading' && (
                  <span className="animate-pulse ml-2 flex-shrink-0">Uploading...</span>
                )}
                {file.status === 'error' && (
                  <span className="text-xs ml-2 flex-shrink-0" title={file.error}>{file.error || 'Upload failed'}</span>
                )}
              </div>
              <button
                className="text-muted-foreground hover:text-foreground ml-2 flex-shrink-0"
                onClick={() => onRemoveFile(file.id)}
                title="Remove file"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileUploadManager;