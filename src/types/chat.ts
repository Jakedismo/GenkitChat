export enum ChatMode {
  DIRECT_GEMINI = 'direct_gemini',
  DIRECT_OPENAI = 'direct_openai',
}

export type TemperaturePreset = 'precise' | 'normal' | 'creative';

export interface ModelInfo {
  id: string;
  name: string;
}

export interface DisplayTool {
  name: string;
  description: string;
  source?: string; // Optional: Indicate which server it came from
}

export interface ConnectedServer {
  name: string;
  status: 'Connected' | 'Error' | 'Pending';
  tools: DisplayTool[];
}

export interface UploadedFile {
  file: File;
  id: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

// Represents the structure of a document chunk's metadata and content,
// as received from the backend for RAG citations and used on the frontend.
export interface DocumentData {
  documentId: string;       // Unique ID for the original uploaded document
  chunkId: string;          // Unique ID for this specific chunk
  originalFileName: string; // Name of the original uploaded file
  chunkIndex: number;       // 0-based index of the chunk within its original document
  content: string;          // The actual text content of the chunk
  // Optionally, add other metadata like 'score' if needed for display later
}

// Represents a tool invocation within a chat message
export interface ToolInvocation {
  toolName: string; // Use toolName to match useChatManager usage
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

// Represents the structure of a single chat message in the UI
export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  toolInvocations?: ToolInvocation[]; // Use the specific type
  sources?: DocumentData[]; // For RAG: stores the source documents used for this bot message
}

// Represents the data needed for the citation preview sidebar
export interface CitationPreviewData {
  fileName: string; // Original filename
  content?: string; // Original chunk text content (optional if PDF preview is shown)
  pdfUrl: string; // URL to serve the PDF from
  pageNumber: number; // 1-based page number for the citation
  textToHighlight: string; // Specific text to highlight on the page
  documentId: string; // Original document ID
  chunkId: string;    // Specific chunk ID
}