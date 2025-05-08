import React from 'react';
import { cn } from '@/lib/utils';
import { FileText, X } from 'lucide-react';

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
}

const FileUploadManager: React.FC<FileUploadManagerProps> = ({
  uploadedFiles,
  onRemoveFile,
}) => {
  if (uploadedFiles.length === 0) {
    return null; // Don't render anything if there are no files
  }

  return (
    <div className="border-t p-2">
      <div className="text-sm font-medium mb-2">Uploaded Files:</div>
      <div className="space-y-1">
        {uploadedFiles.map((file) => (
          <div
            key={file.id}
            className={cn(
              "flex items-center justify-between p-2 rounded text-sm",
              file.status === 'success' && "bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-300",
              file.status === 'error' && "bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-300",
              file.status === 'uploading' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-800/30 dark:text-yellow-300",
            )}
          >
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
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileUploadManager;