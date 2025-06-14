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
  chunkId: number;          // Unique ID for this specific chunk
  originalFileName: string; // Name of the original uploaded file
  chunkIndex: number;       // 0-based index of the chunk within its original document
  content: string;          // The actual text content of the chunk
  // Optionally, add other metadata like 'score' if needed for display later
}

export type CitationMeta = {
  documentId: string;
  chunkId: number; // Can be string (from RAG flow) or number (from UI)
  fileName: string;
  originalFileName?: string;
  pageNumber?: number;
  content?: string; // The raw chunk content
  textToHighlight?: string; // Specific text snippet to highlight or search for

  // Fields from EnhancedCitationMeta (backend)
  hasCoordinateData?: boolean;
  textExtractionMethod?: 'ocr' | 'native' | 'server' | 'client' | 'none';
  totalPages?: number;
  highlightCoordinates?: HighlightCoordinates[]; // Array of precise coordinates
  processingStats?: {
    textExtractionTime?: number;
    coordinateComputationTime?: number;
    chunkingTime?: number;
  };
  // Add any other fields from EnhancedDocumentMetadata that might be useful on the frontend
  // e.g., confidence scores, alternative text versions, etc.
};

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
  text: string | string[] | { text?: string; [key: string]: any } | any; // Support various response formats
  toolInvocations?: ToolInvocation[]; // Use the specific type
  sources?: CitationMeta[]; // For RAG: stores the source documents used for this bot message
}

/**
 * Represents a rectangular coordinate region within a PDF page
 * Used for precise positioning of highlights and annotations
 */
export interface PdfRect {
  /** X coordinate (left edge) in PDF coordinate system */
  x: number;
  /** Y coordinate (bottom edge) in PDF coordinate system */
  y: number;
  /** Width of the rectangle */
  width: number;
  /** Height of the rectangle */
  height: number;
}

/**
 * Enhanced coordinate system for PDF highlighting
 * Provides precise positioning and confidence scoring for text matching
 */
export interface HighlightCoordinates {
  /** Page number (1-based) where the highlight appears */
  pageNumber: number;
  /** Array of rectangular regions that make up the highlight */
  rects: PdfRect[];
  /** The actual text content being highlighted */
  textContent: string;
  /** Confidence score for text matching accuracy (0-1 scale) */
  confidence: number;
  /** Optional style ID for color customization */
  styleId?: string;
}

/**
 * Configuration options for the highlighting system
 * Allows customization of highlight appearance and behavior
 */
export interface HighlightingConfig {
  /** Default highlight color (hex, rgb, or named color) */
  defaultColor: string;
  /** Default highlight opacity (0-1 scale) */
  defaultOpacity: number;
  /** Minimum confidence threshold for displaying highlights */
  confidenceThreshold: number;
  /** Whether to enable fuzzy text matching */
  enableFuzzyMatching: boolean;
  /** Maximum number of highlights per page */
  maxHighlightsPerPage: number;
}

// Represents the data needed for the citation preview sidebar
export interface CitationPreviewData {
  fileName: string; // Original filename
  content?: string; // Original chunk text content (optional if PDF preview is shown)
  pdfUrl: string; // URL to serve the PDF from
  pageNumber: number; // 1-based page number for the citation
  textToHighlight: string; // Specific text to highlight on the page
  documentId: string; // Original document ID
  chunkId: number;    // Specific chunk ID
  
  // Enhanced highlighting features - optional for backward compatibility
  /** Precise coordinate-based highlighting information */
  highlightCoordinates?: HighlightCoordinates[];
  /** Custom highlight color override */
  highlightColor?: string;
  /** Custom highlight opacity override (0-1 scale) */
  highlightOpacity?: number;
}

// --- Types for processing raw SSE data payloads ---

interface ParsedSourceMetadata {
  documentId?: string;
  chunkId?: string;
  originalFileName?: string;
  chunkIndex?: number;
  pageNumber?: number;
  textToHighlight?: string;
  [key: string]: unknown; // Allow other metadata properties
}

interface ParsedSourceContent {
  text?: string;
  // Add other content properties if relevant
}

interface ParsedSource {
  metadata?: ParsedSourceMetadata;
  content?: ParsedSourceContent[] | string; // Content could be array or string
}

// Possible structure for incoming tool invocation data before mapping to ToolInvocation type
interface RawToolInvocation {
  name?: string;
  input?: unknown;
  output?: unknown;
}

// Represents the potential structure of parsed JSON data from SSE events
export interface ParsedJsonData {
  // Based on event types processed
  sources?: ParsedSource[];         // From "sources" event
  error?: string;                   // From "error" event
  response?: string | string[] | { text?: string; [key: string]: any } | any; // Support various response formats
  toolInvocations?: RawToolInvocation[]; // From "final_response" or "tool_invocations" event
  sessionId?: string;               // From "final_response" event
  text?: string | string[] | { text?: string; [key: string]: any } | any; // Support various text formats
  message?: { content?: any[]; [key: string]: any }; // Support raw message structure
  custom?: { candidates?: any[]; [key: string]: any }; // Support custom response structure
  // Add any other properties received in SSE data payloads
  [key: string]: unknown;           // Allow flexibility
}