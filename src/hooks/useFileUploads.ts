import { useState, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast'; // Assuming useToast is correctly located
import { UploadedFile } from '@/types/chat'; // Import shared type
import { v4 as uuidv4 } from 'uuid'; // For generating unique file IDs
// import { generateRagSessionId } from '@/services/rag'; // Optional: Only if needed for auto-generation

// Define the structure of the hook's return value for clarity
interface UseFileUploadsReturn {
  uploadedFiles: UploadedFile[];
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileChange: (files: FileList | null) => void; // Handler for the file input's onChange event
  removeFile: (id: string) => void; // Function to remove a specific file
  triggerFileUpload: () => void; // Function to programmatically click the hidden file input
  resetUploadedFiles: () => void; // Function to clear all files
}

// Hook definition
export function useFileUploads(
  // Function to get the current session ID from the parent component/hook
  getCurrentSessionId: () => string | undefined
  // Potentially add setCurrentSessionId if needed for auto-generation, but seems less likely needed here
): UseFileUploadsReturn {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Handles the actual file selection event from the hidden input
  const handleFileChange = useCallback(async (selectedFiles: FileList | null) => {
    console.log('[useFileUploads] handleFileChange triggered. Selected files:', selectedFiles); // Debug log
    if (!selectedFiles || selectedFiles.length === 0) {
      return; // No files selected
    }

    const sessionIdToUse = getCurrentSessionId();
    console.log('[useFileUploads] sessionIdToUse:', sessionIdToUse); // <--- ADD THIS LOG
    if (!sessionIdToUse) {
        // Require session ID to exist before allowing upload
        toast({
            title: 'Session Error',
            description: 'Cannot upload files without an active chat session.',
            variant: 'destructive',
        });
        // Clear the file input value if selection failed due to no session
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        return;
    }

    // Create UploadedFile objects for tracking in the UI
    const newFiles: UploadedFile[] = Array.from(selectedFiles).map((file) => ({
      file,
      id: uuidv4(), // Unique ID for UI list key and tracking
      status: 'uploading',
    }));

    setUploadedFiles((prev) => [...prev, ...newFiles]);
    setIsUploading(true);
    console.log("Setting isUploading to TRUE (useFileUploads)");

    try {
      const formData = new FormData();
      newFiles.forEach((uploadFile) => {
        formData.append('files', uploadFile.file, uploadFile.file.name);
      });
      formData.append('sessionId', sessionIdToUse);

      console.log(`Uploading ${newFiles.length} file(s) via FormData for session ${sessionIdToUse} (useFileUploads)`);

      // Send files to the backend RAG endpoint
      const response = await fetch('/api/rag-chat', { // Assuming this endpoint handles file uploads
        method: 'POST',
        body: formData, // Browser sets correct Content-Type for FormData
      });

      // Check for network/server errors
      if (!response.ok) {
        let errorData: { error?: string; message?: string } = {};
        try {
          errorData = await response.json();
        } catch { /* Ignore if response isn't JSON */ }
        const errorMessage = errorData?.error || errorData?.message || `Upload failed with status: ${response.status}`;
        console.error('File upload failed:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      // Process successful or partially successful response
      const result = await response.json();
      console.log('File upload response (useFileUploads):', result);

      if (result.success) {
        // All files processed successfully by backend
        setUploadedFiles((prev) =>
          prev.map((file) =>
            newFiles.some((nf) => nf.id === file.id)
              ? { ...file, status: 'success' } // Mark as success
              : file
          )
        );
        toast({
          title: 'Upload Successful',
          description: result.message || `${newFiles.length} file(s) processed.`,
          variant: 'default',
        });
      } else {
        // Handle cases where backend reports failure, possibly partial
        const failedFilesMap = new Map(result.failedFiles?.map((f: { file: string; error: unknown }) => [f.file, f.error]) || []);
        setUploadedFiles((prev) =>
          prev.map((file) => {
            if (newFiles.some((nf) => nf.id === file.id)) {
              const backendError = failedFilesMap.get(file.file.name);
              const fileStatus: UploadedFile['status'] = backendError ? 'error' : 'success';

              let fileError: string | undefined;
              if (backendError) {
                  fileError = typeof backendError === 'string' ? backendError : JSON.stringify(backendError);
              } else {
                  fileError = fileStatus === 'error' ? 'Processing failed' : undefined;
              }
              // Now fileError is guaranteed to be string | undefined

              return {
                ...file,
                status: fileStatus,
                error: fileError, // Assign the correctly typed string | undefined
              };
            }
            return file;
          })
        );
        toast({
          title: 'Upload Issue',
          description: result.message || 'Some files could not be processed.',
          // Show destructive toast only if specific errors were reported
          variant: result.failedFiles?.length > 0 ? 'destructive' : 'default',
        });
      }

    } catch (error) {
      console.error('Error during file upload fetch (useFileUploads):', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error during upload';
      // Mark all files attempted in this batch as failed on frontend
      setUploadedFiles((prev) =>
        prev.map((file) =>
          newFiles.some((nf) => nf.id === file.id)
            ? { ...file, status: 'error', error: errorMessage }
            : file
        )
      );
      toast({
        title: 'Upload Failed',
        description: `An unexpected error occurred: ${errorMessage}`,
        variant: 'destructive',
      });
    } finally {
      console.log("Setting isUploading to FALSE (useFileUploads)");
      setIsUploading(false);
      // Always clear the file input value after attempt (success or fail)
      // so the user can select the same file again if needed.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  // Dependencies for useCallback: React state setters, props, toast
  }, [getCurrentSessionId, toast]);

  // Function to remove a file from the UI list
  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
    // Note: This does not remove the file from the backend index
  }, []);

  // Function to programmatically click the hidden file input
  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Function to clear all uploaded files from the UI state
  const resetUploadedFiles = useCallback(() => {
    setUploadedFiles([]);
    // Clear the file input visually as well
     if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  }, []);

  // Return state and functions needed by the parent component
  return {
    uploadedFiles,
    isUploading,
    fileInputRef,
    handleFileChange, // Needs to be connected to the hidden input's onChange
    removeFile,
    triggerFileUpload,
    resetUploadedFiles,
  };
}