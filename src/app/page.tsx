'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';  // Add Switch import
// Removed direct imports for server-side functions
// Keep type imports if needed elsewhere, though RagEndpoint/BedrockModel might be removable now
// import type { RagEndpoint } from '@/services/rag';
// import type { BedrockModel } from '@/services/bedrock';
import { availableGeminiModels } from '@/ai/available-models';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LucideIcon, Server, Settings, Bot, Code, BrainCircuit, Paperclip, X, FileText, Search, ExternalLink, Sparkles } from 'lucide-react'; // Added Sparkles
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToolInvocation } from "@/lib/genkit-instance";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatMessageContent from '@/components/ChatMessageContent'; // Added import
import CitationPreviewSidebar from '@/components/CitationPreviewSidebar'; // Added import
import ChatConfigSidebar from '@/components/chat/ChatConfigSidebar';
import ServerStatusDisplay from '@/components/chat/ServerStatusDisplay'; // Added import
import ChatInputControls from '@/components/chat/ChatInputControls'; // Added import
import FileUploadManager from '@/components/chat/FileUploadManager'; // Added import
// Removed ragAugmentedChatFlow import as it's no longer used
import { basicChatFlow } from "@/lib/genkit-instance";
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"; // Add Tooltip imports
import mermaid from 'mermaid';
// Removed pdfjs-dist imports (static and dynamic)
import dynamic from 'next/dynamic';

// Represents the structure of a document chunk's metadata and content,
// as received from the backend for RAG citations.
interface DocumentData {
  documentId: string;       // Unique ID for the original uploaded document
  chunkId: string;          // Unique ID for this specific chunk
  originalFileName: string; // Name of the original uploaded file
  chunkIndex: number;       // 0-based index of the chunk within its original document
  content: string;          // The actual text content of the chunk
  // Optionally, add other metadata like 'score' if needed for display later
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  toolInvocations?: ToolInvocation[];
  sources?: DocumentData[]; // For RAG: stores the source documents used for this bot message
}

// File representation for upload
// Remove RAG_BEDROCK mode
enum ChatMode {
  DIRECT_GEMINI = 'direct_gemini',
  DIRECT_OPENAI = 'direct_openai'
}

// ServiceSelector might be removable if Bedrock models/RAG endpoints are fully gone
// Keeping for now in case it's reused, but it's unused in the current state.
// interface ServiceSelectorProps {
//   label: string;
//   items: { id: string; name: string }[];
//   selectedId: string;
//   onSelect: (id: string) => void;
//   icon?: LucideIcon;
//   disabled?: boolean;
// }
// const ServiceSelector: React.FC<ServiceSelectorProps> = ({...}) => {...};


// Define types for UI display
interface DisplayTool {
  name: string;
  description: string;
  source?: string; // Optional: Indicate which server it came from
}

interface ConnectedServer {
  name: string;
  status: 'Connected' | 'Error' | 'Pending'; // Simple status
  tools: DisplayTool[];
}

// Define OpenAI models for UI
const availableOpenAIModels = [
  { id: 'openai/o4-mini', name: 'o4 mini' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1' },
  // Add other OpenAI models here if desired
];

// Add Temperature Preset type
type TemperaturePreset = 'precise' | 'normal' | 'creative';

// Initialize Mermaid on client mount
mermaid.initialize({ startOnLoad: false }); // Don't run automatically on load

// Interface for uploaded files with additional metadata
interface UploadedFile {
  file: File;
  id: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

const LambdaChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  // Remove RAG/Bedrock state
  // const [ragEndpoints, setRagEndpoints] = useState<RagEndpoint[]>([]);
  // const [bedrockModels, setBedrockModels] = useState<BedrockModel[]>([]);
  // const [selectedRagEndpointId, setSelectedRagEndpointId] = useState('');
  // const [selectedLlmModelId, setSelectedLlmModelId] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>(ChatMode.DIRECT_GEMINI); // Default to Gemini
  const [selectedGeminiModelId, setSelectedGeminiModelId] = useState<string>(
    availableGeminiModels.length > 0 ? availableGeminiModels[0].id : ''
  );
  const [selectedOpenAIModelId, setSelectedOpenAIModelId] = useState<string>(
    availableOpenAIModels.length > 0 ? availableOpenAIModels[0].id : ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>([]);
  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('normal');
  const [maxTokens, setMaxTokens] = useState<number>(4084);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Add state for Tavily tools toggles
  const [tavilySearchEnabled, setTavilySearchEnabled] = useState(false);
  const [tavilyExtractEnabled, setTavilyExtractEnabled] = useState(false);
  // Add state for Perplexity tools toggles
  const [perplexitySearchEnabled, setPerplexitySearchEnabled] = useState(false);
  const [perplexityDeepResearchEnabled, setPerplexityDeepResearchEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // State for citation preview sidebar
  interface CitationPreviewData {
    fileName: string;
    content: string;
    documentId: string; // Original document ID
    chunkId: string;    // Specific chunk ID
  }
  const [citationPreview, setCitationPreview] = useState<CitationPreviewData | null>(null);
  const [isCitationSidebarOpen, setIsCitationSidebarOpen] = useState(false);

  // Ref for the scrollable message container
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null); // Ref for the immediate child of ScrollArea viewport

  // Function to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Effect to scroll and re-render Mermaid diagrams when messages change
  useEffect(() => {
    scrollToBottom();
    try {
      mermaid.run();
    } catch (e) {
      console.error("Mermaid rendering error:", e);
    }
  }, [messages]);

  // Simplified useEffect - remove RAG/Bedrock fetching logic
  // Effect for initial setup and fetching data
  useEffect(() => {
    // Removed pdf.js worker setup logic
    // Rest of the useEffect...
    if (!selectedGeminiModelId && availableGeminiModels.length > 0) {
      setSelectedGeminiModelId(availableGeminiModels[0].id);
    }
    if (!selectedOpenAIModelId && availableOpenAIModels.length > 0) {
      setSelectedOpenAIModelId(availableOpenAIModels[0].id);
    }

    // Fetch tools and update server status
    const fetchToolInfo = async () => {
      const initialServers: ConnectedServer[] = [
        { name: 'context7', status: 'Pending', tools: [] } // Assuming context7 is still relevant
      ];
      setConnectedServers(initialServers);

      try {
        const response = await fetch('/api/tools');
        if (!response.ok) {
          throw new Error('Failed to fetch tools');
        }
        const fetchedTools: DisplayTool[] = await response.json();
        setConnectedServers(prev => prev.map(s =>
          s.name === 'context7' ? { ...s, status: 'Connected', tools: fetchedTools } : s
        ));
      } catch (error) {
        console.error('Failed to fetch tool info:', error);
        toast({
          title: 'Error',
          description: 'Could not fetch tool information from connected servers.',
          variant: 'destructive',
        });
        setConnectedServers(prev => prev.map(s =>
          s.name === 'context7' ? { ...s, status: 'Error' } : s
        ));
      }
    };

    fetchToolInfo();

  // Dependencies adjusted: remove RAG-related state and chatMode (as fetching doesn't depend on mode now)
  }, [toast, selectedGeminiModelId, selectedOpenAIModelId]);

  const handleCitationClick = (messageId: string, chunkIndexInSources: number) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.sources && message.sources[chunkIndexInSources]) {
      const sourceChunk = message.sources[chunkIndexInSources];
      setCitationPreview({
        fileName: sourceChunk.originalFileName,
        content: sourceChunk.content,
        documentId: sourceChunk.documentId, // Store these for potential future use
        chunkId: sourceChunk.chunkId,
      });
      setIsCitationSidebarOpen(true);
      // Potentially focus or scroll to sidebar if needed
    } else {
      console.warn(`Could not find source for message ${messageId}, chunk index ${chunkIndexInSources}`);
      toast({ title: "Citation Error", description: "Could not load citation source.", variant: "destructive" });
    }
  };

  // Custom component to handle paragraphs and prevent nesting <pre> inside <p>
  const PComponent = (props: any) => {
    // Check if any direct child node in the HAST tree is a 'pre' element
    // ReactMarkdown passes the original hast node via the 'node' prop
    const containsPre = props.node?.children?.some(
      (child: any) => child.type === 'element' && child.tagName === 'pre'
    );

    if (containsPre) {
      // If it contains a pre, render children without the <p> wrapper
      return <>{props.children}</>;
    }
    // Otherwise, render a normal paragraph
    return <p>{props.children}</p>;
  };

  // Shared components config for ReactMarkdown, including custom P and Code renderers
  const markdownComponents = {
    p: PComponent, // Use our custom paragraph renderer
    code({node, className, children, ...props}: any) { // Keep existing custom code renderer
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (language === 'mermaid') {
        return (
            <pre className="mermaid" key={crypto.randomUUID()}>
              {String(children).replace(/\n$/, '')}
            </pre>
        );
      }

      // Apply highlight.js styling for other languages
      return (
        <pre className={className || ''} style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
          <code className={className}>
              {children}
          </code>
        </pre>
      )
    }
  };


  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    let modelIdToUse: string | null = null;
    let errorDescription: string | null = null;

    // Determine model and check selection based on mode (RAG logic removed)
    if (chatMode === ChatMode.DIRECT_GEMINI) {
      if (!selectedGeminiModelId) {
        errorDescription = 'Please select a Gemini model.';
      } else {
        modelIdToUse = selectedGeminiModelId;
      }
    } else if (chatMode === ChatMode.DIRECT_OPENAI) {
      if (!selectedOpenAIModelId) {
        errorDescription = 'Please select an OpenAI model.';
      } else {
        modelIdToUse = selectedOpenAIModelId;
      }
    }

    if (errorDescription) {
        toast({ title: 'Configuration Missing', description: errorDescription, variant: 'default' });
        return;
    }
    if (!modelIdToUse) {
        console.error("Model ID to use is somehow null/undefined despite passing checks.");
        toast({ title: 'Error', description: 'Could not determine model to use.', variant: 'destructive' });
        return;
    }

    const userMessageText = userInput;
    const sessionIdToUse = currentSessionId ?? crypto.randomUUID();
    if (!currentSessionId) {
        setCurrentSessionId(sessionIdToUse);
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), sender: 'user', text: userMessageText };
    const botMessagePlaceholderId = crypto.randomUUID();
    const botMessagePlaceholder: ChatMessage = { id: botMessagePlaceholderId, sender: 'bot', text: '', toolInvocations: [] };

    setMessages((prevMessages) => [...prevMessages, userMessage, botMessagePlaceholder]);
    setUserInput('');
    console.log("Setting isLoading to TRUE"); // Log state change
    setIsLoading(true);

    try {
      // Determine if RAG should be used based on uploaded files
      const useRag = uploadedFiles.some(f => f.status === 'success');
      console.log(`Sending message. Use RAG: ${useRag}`); // Add log to confirm RAG usage

      // Set API URL based on whether RAG is needed
      const apiUrl = useRag ? '/api/rag-chat' : '/api/basic-chat';
      console.log(`Targeting API endpoint: ${apiUrl}`); // Log the target endpoint

      const requestBody = {
        query: userMessageText, // Use 'query' for RAG endpoint, keep 'userMessage' maybe? Let's standardize on query for now.
        userMessage: userMessageText, // Send both for compatibility? Or just query? Let's send both for now.
        modelId: modelIdToUse,
        temperaturePreset: temperaturePreset,
        maxTokens: maxTokens,
        sessionId: sessionIdToUse,
        tavilySearchEnabled: tavilySearchEnabled, // Pass the state
        tavilyExtractEnabled: tavilyExtractEnabled, // Pass the state
        perplexitySearchEnabled: perplexitySearchEnabled, // Pass the state
        perplexityDeepResearchEnabled: perplexityDeepResearchEnabled, // Pass the state
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        const errorDetail = response.body ? await response.json().catch(() => ({})) : {};
        const message = errorDetail.details || errorDetail.error || `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      // Process the stream using SSE logic (remains largely the same)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      console.log("Starting SSE processing loop...");

      while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          const chunk = decoder.decode(value, { stream: !done });
          buffer += chunk;

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
              const eventData = buffer.substring(0, boundary);
              buffer = buffer.substring(boundary + 2);

              let eventType = 'message';
              let dataPayload = '';
              const lines = eventData.split('\n');
              for (const line of lines) {
                  if (line.startsWith('event:')) {
                      eventType = line.substring(6).trim();
                  } else if (line.startsWith('data:')) {
                      dataPayload = line.substring(5).trim();
                  }
              }

              if (dataPayload) {
                  try {
                      const jsonData = JSON.parse(dataPayload);
                      setMessages((prevMessages) => {
                          const updatedMessages = prevMessages.map((msg) => {
                              if (msg.id === botMessagePlaceholderId) {
                                  if (eventType === 'sources') {
                                      // Map Genkit Document objects to our frontend DocumentData structure
                                      const mappedSources: DocumentData[] = (jsonData.sources || []).map((doc: any) => {
                                        // Concatenate text from all text parts in doc.content
                                        // Genkit Document content is an array of Part objects e.g. [{text: "..."}]
                                        const textContent = (doc.content || [])
                                          .filter((part: any) => part && typeof part.text === 'string')
                                          .map((part: any) => part.text)
                                          .join('\n\n'); // Join parts with double newline for readability

                                        return {
                                          documentId: doc.metadata?.documentId || `doc-${crypto.randomUUID()}`,
                                          chunkId: doc.metadata?.chunkId || `chunk-${crypto.randomUUID()}`,
                                          originalFileName: doc.metadata?.originalFileName || 'Unknown Source',
                                          chunkIndex: typeof doc.metadata?.chunkIndex === 'number' ? doc.metadata.chunkIndex : -1,
                                          content: textContent,
                                          // Ensure all fields of DocumentData are present
                                        };
                                      });
                                      return { ...msg, sources: mappedSources };
                                  } else if (eventType === 'chunk') {
                                      return { ...msg, text: msg.text + jsonData.text };
                                  } else if (eventType === 'tool_invocations') {
                                      return { ...msg, toolInvocations: jsonData };
                                  } else if (eventType === 'error') {
                                      console.error("Streaming error from server event:", jsonData.error);
                                      toast({ title: 'Stream Error', description: jsonData.error, variant: 'destructive' });
                                      return { ...msg, text: msg.text + `\n\n[STREAM ERROR: ${jsonData.error}]` };
                                  } else if (eventType === 'final_response') {
                                      if(jsonData.sessionId && !currentSessionId) {
                                          setCurrentSessionId(jsonData.sessionId);
                                      }
                                      return {
                                         ...msg,
                                         text: jsonData.response ?? msg.text,
                                         toolInvocations: jsonData.toolInvocations
                                      };
                                  }
                              }
                              return msg;
                          });
                          return updatedMessages;
                      });
                  } catch (parseError) {
                      console.error("SSE JSON Parse Error:", parseError, "Data was:", dataPayload);
                  }
              }
              boundary = buffer.indexOf('\n\n');
          }
      }
      console.log("Finished SSE processing loop.");

    } catch (error: any) {
       console.error('Error sending message:', error);
       toast({
         title: 'Error',
         description: error.message || 'Failed to get response from the server.',
         variant: 'destructive',
       });
       // Remove placeholder on error or update it with error message
       setMessages((prevMessages) => prevMessages.map(msg =>
           msg.id === botMessagePlaceholderId
           ? { ...msg, text: `[ERROR: ${error.message || 'Failed to fetch response'}]` }
           : msg
       ));
    } finally {
      console.log("Setting isLoading to FALSE"); // Log state change
      setIsLoading(false);
    }
  };

  // Handle file upload - Simplified for client-side simulation
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Removed RAG mode check

    const sessionIdToUse = currentSessionId ?? crypto.randomUUID();
    if (!currentSessionId) {
      setCurrentSessionId(sessionIdToUse);
    }

    const totalExistingSize = uploadedFiles.reduce((sum, file) => sum + file.file.size, 0);
    const newFilesTotalSize = Array.from(files).reduce((sum, file) => sum + file.size, 0);

    if (totalExistingSize + newFilesTotalSize > 100 * 1024 * 1024) { // 100MB limit
      toast({
        title: 'File Size Limit Exceeded',
        description: 'The total size of all uploaded files cannot exceed 100MB.',
        variant: 'destructive',
      });
      return;
    }

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      file,
      id: crypto.randomUUID(),
      status: 'uploading',
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    console.log("Setting isUploading to TRUE"); // Log state change
    setIsUploading(true);

    // Process files: Send raw file via FormData to backend
    try {
      const formData = new FormData();
      newFiles.forEach(uploadFile => {
        formData.append("files", uploadFile.file, uploadFile.file.name);
      });
      formData.append("sessionId", sessionIdToUse);

      console.log(`Uploading ${newFiles.length} file(s) via FormData for session ${sessionIdToUse}`);

      const response = await fetch('/api/rag-chat', {
        method: 'POST',
        body: formData, // Send FormData
        // Browser sets Content-Type automatically
      });

      // Handle response after sending FormData
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        console.error('File upload failed:', errorData);
        const errorMessage = errorData.error || `Upload failed with status: ${response.status}`;
        // Mark all new files as failed if the overall request fails
        setUploadedFiles(prev =>
          prev.map(file =>
            newFiles.some(nf => nf.id === file.id)
              ? { ...file, status: 'error', error: errorMessage }
              : file
          )
        );
        toast({
          title: 'File Upload Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      } else {
        const result = await response.json();
        console.log('File upload response:', result);

        if (result.success) {
          // Mark all successfully processed files (assuming backend processes all or none in this batch)
          setUploadedFiles(prev =>
            prev.map(file =>
              newFiles.some(nf => nf.id === file.id)
                ? { ...file, status: 'success' }
                : file
            )
          );
          toast({
            title: 'Upload Successful',
            description: result.message || `${newFiles.length} file(s) processed successfully.`,
            variant: 'default',
          });
        } else {
          // Handle specific file failures reported by the backend
           const failedFilesMap = new Map(result.failedFiles?.map((f: any) => [f.file, f.error]) || []);
           setUploadedFiles(prev =>
             prev.map(file => {
               if (newFiles.some(nf => nf.id === file.id)) {
                 const backendError = failedFilesMap.get(file.file.name);
                 const errorString: string | undefined = backendError
                   ? (typeof backendError === 'string' ? backendError : JSON.stringify(backendError))
                   : undefined;
                 return {
                   ...file,
                   status: backendError ? 'error' : 'success', // Mark specific files
                   error: errorString,
                 };
               }
               return file;
             })
           );
          toast({
            title: 'Upload Partially Failed',
            description: result.error || 'Some files could not be processed.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) { // Catch network or other unexpected errors during fetch
      console.error('Error during FormData upload fetch:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error during upload';
      // Mark all new files as failed
      setUploadedFiles(prev =>
        prev.map(file =>
          newFiles.some(nf => nf.id === file.id && file.status === 'uploading') // Only mark those still uploading
            ? { ...file, status: 'error', error: errorMessage } // Use correctly scoped errorMessage
            : file
        )
      );
      toast({
        title: 'Upload Failed',
        description: `An unexpected error occurred during upload: ${errorMessage}`, // Use correctly scoped errorMessage
        variant: 'destructive',
      });
    } finally { // Ensure finally is correctly placed
        console.log("Setting isUploading to FALSE"); // Log state change
        setIsUploading(false);
    }
  }; // Ensure this closes handleFileUpload

  // Trigger file input click (should be outside handleFileUpload)
  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Remove a file from the list
  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== id));
  };

  // Clear chat and session ID
  const clearChat = () => {
    setMessages([]);
    setUploadedFiles([]); // Clear uploaded files as well
    setCurrentSessionId(undefined);
    toast({ title: "Chat Cleared", description: "Ready for a new conversation." });

    // Remove server-side clearing if /api/rag-chat DELETE is irrelevant now
    // if (currentSessionId) {
    //   fetch(`/api/rag-chat?sessionId=${currentSessionId}`, { method: 'DELETE' })
    //   ...
    // }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <CitationPreviewSidebar
          isOpen={isCitationSidebarOpen}
          onClose={() => setIsCitationSidebarOpen(false)}
          previewData={citationPreview}
        />
        <Sidebar>
          <SidebarTrigger />
          <SidebarContent>
            <ChatConfigSidebar
              chatMode={chatMode}
              onChatModeChange={setChatMode}
              selectedGeminiModelId={selectedGeminiModelId}
              onSelectedGeminiModelIdChange={setSelectedGeminiModelId}
              availableGeminiModels={availableGeminiModels}
              selectedOpenAIModelId={selectedOpenAIModelId}
              onSelectedOpenAIModelIdChange={setSelectedOpenAIModelId}
              availableOpenAIModels={availableOpenAIModels}
              temperaturePreset={temperaturePreset}
              onTemperaturePresetChange={setTemperaturePreset}
              maxTokens={maxTokens}
              onMaxTokensChange={setMaxTokens}
            />
            <ServerStatusDisplay connectedServers={connectedServers} />
            <div className="p-2 mt-auto">
                <Button variant="outline" className="w-full" onClick={clearChat}>Clear Chat</Button>
            </div>
          </SidebarContent>
          <SidebarFooter>
            <p className="text-center text-xs text-muted-foreground">
              Powered by Firebase Studio
            </p>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 p-4"> {/* Main content area */}
          <Card className="flex h-full flex-col">
            <CardContent className="relative flex-1">
              <ScrollArea className="h-full w-full">
                <div ref={scrollAreaRef} className="flex flex-col gap-4 p-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex w-full flex-col',
                        message.sender === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-lg px-4 py-2',
                          'prose dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0',
                          message.sender === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        {message.sender === 'bot' && message.sources && message.sources.length > 0 && message.text.includes('[Source:') ? (
                          // Pass components down to ChatMessageContent
                          <ChatMessageContent
                            text={message.text}
                            onCitationClick={(chunkIndex) => handleCitationClick(message.id, chunkIndex)}
                            components={markdownComponents} // Pass components down
                          />
                        ) : (
                          // Use components for regular markdown rendering
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={markdownComponents} // Use the shared components object here
                          >
                            {message.text}
                          </ReactMarkdown>
                        )}
                      </div>
                      {message.sender === 'bot' && message.toolInvocations && message.toolInvocations.length > 0 && (
                        <div className="mt-2 w-full max-w-[80%] rounded-md border border-border bg-muted p-3 text-xs">
                          <p className="mb-2 flex items-center gap-1 font-medium text-muted-foreground">
                             <Code size={14} /> Tool Calls:
                          </p>
                          {message.toolInvocations.map((inv, index) => (
                            <details key={index} className="mb-2 last:mb-0">
                              <summary className="cursor-pointer hover:underline">{inv.name}</summary>
                              <div className="mt-1 pl-4 space-y-1">
                                <div>
                                  <span className="font-semibold">Input:</span>
                                  <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                    {JSON.stringify(inv.input, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <span className="font-semibold">Output:</span>
                                  <pre className="mt-1 p-2 rounded bg-background text-xs overflow-x-auto">
                                    {JSON.stringify(inv.output, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                   <div ref={messagesEndRef} />
                   {isLoading && (
                     <div className="flex w-full flex-col items-start">
                        <div className="max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap bg-secondary text-secondary-foreground opacity-70 animate-pulse">
                           Thinking...
                        </div>
                     </div>
                   )}
                </div>
              </ScrollArea>
            </CardContent>
            <FileUploadManager uploadedFiles={uploadedFiles} onRemoveFile={removeFile} />

            <div className="border-t p-4">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                multiple // Allow multiple files
                // accept=".pdf" // Allow any file type for now, refine later if needed
              />

              <ChatInputControls
                userInput={userInput}
                onUserInputChanges={setUserInput}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                isUploading={isUploading}
                tavilySearchEnabled={tavilySearchEnabled}
                onTavilySearchToggle={() => setTavilySearchEnabled(!tavilySearchEnabled)}
                tavilyExtractEnabled={tavilyExtractEnabled}
                onTavilyExtractToggle={() => setTavilyExtractEnabled(!tavilyExtractEnabled)}
                perplexitySearchEnabled={perplexitySearchEnabled}
                onPerplexitySearchToggle={() => setPerplexitySearchEnabled(!perplexitySearchEnabled)}
                perplexityDeepResearchEnabled={perplexityDeepResearchEnabled}
                onPerplexityDeepResearchToggle={() => setPerplexityDeepResearchEnabled(!perplexityDeepResearchEnabled)}
                onFileUploadTrigger={triggerFileUpload}
              />
            </div>
          </Card>
        </div>
       </div>
     </SidebarProvider>
   );
};

export default LambdaChat;
