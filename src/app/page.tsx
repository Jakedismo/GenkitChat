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
import { RagEndpoint, getRagEndpoints } from '@/services/rag';
import { BedrockModel, getBedrockModels } from '@/services/bedrock';
import { availableGeminiModels } from '@/ai/available-models';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LucideIcon, Server, Settings, Bot, Code, BrainCircuit } from 'lucide-react';
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
import { basicChatFlow, ragAugmentedChatFlow } from "@/lib/genkit-instance";
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import mermaid from 'mermaid';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  toolInvocations?: ToolInvocation[];
}

enum ChatMode {
  RAG_BEDROCK = 'rag_bedrock',
  DIRECT_GEMINI = 'direct_gemini',
  DIRECT_OPENAI = 'direct_openai'
}

interface ServiceSelectorProps {
  label: string;
  items: { id: string; name: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  label,
  items,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className={cn(disabled && 'opacity-50 cursor-not-allowed')}>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <Select value={selectedId} onValueChange={onSelect} disabled={disabled}>
        <SelectTrigger disabled={disabled}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

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

const LambdaChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [ragEndpoints, setRagEndpoints] = useState<RagEndpoint[]>([]);
  const [bedrockModels, setBedrockModels] = useState<BedrockModel[]>([]);
  const [selectedRagEndpointId, setSelectedRagEndpointId] = useState('');
  const [selectedLlmModelId, setSelectedLlmModelId] = useState('');
  const [chatMode, setChatMode] = useState<ChatMode>(ChatMode.RAG_BEDROCK);
  const [selectedGeminiModelId, setSelectedGeminiModelId] = useState<string>(
    availableGeminiModels.length > 0 ? availableGeminiModels[0].id : ''
  );
  const [selectedOpenAIModelId, setSelectedOpenAIModelId] = useState<string>(
    availableOpenAIModels.length > 0 ? availableOpenAIModels[0].id : ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>([]);
  const [temperaturePreset, setTemperaturePreset] = useState<TemperaturePreset>('normal');
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  // Ref for the scrollable message container
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null); // Ref for the immediate child of ScrollArea viewport

  // Function to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // Alternative using scrollAreaRef if direct child ref works better:
    // scrollAreaRef.current?.parentElement?.scrollTo({ 
    //   top: scrollAreaRef.current.parentElement.scrollHeight, 
    //   behavior: 'smooth' 
    // });
  };

  // Effect to scroll and re-render Mermaid diagrams when messages change
  useEffect(() => {
    scrollToBottom();
    // Run mermaid.run() to render diagrams in updated content
    // Use try/catch as it can throw errors if syntax is invalid
    try {
      mermaid.run(); 
    } catch (e) {
      console.error("Mermaid rendering error:", e);
    }
  }, [messages]);

  useEffect(() => {
     if (!selectedGeminiModelId && availableGeminiModels.length > 0) {
      setSelectedGeminiModelId(availableGeminiModels[0].id);
    }

    const fetchServices = async () => {
      // Fetch RAG/Bedrock only if RAG mode is selected or relevant state is missing
      if(chatMode === ChatMode.RAG_BEDROCK && (ragEndpoints.length === 0 || bedrockModels.length === 0)) {
         try {
           const ragEndpointsData = await getRagEndpoints();
           setRagEndpoints(ragEndpointsData);
           if (ragEndpointsData.length > 0 && !selectedRagEndpointId) {
             setSelectedRagEndpointId(ragEndpointsData[0].endpointId);
           }

           const bedrockModelsData = await getBedrockModels();
           setBedrockModels(bedrockModelsData);
           if (bedrockModelsData.length > 0 && !selectedLlmModelId) {
             setSelectedLlmModelId(bedrockModelsData[0].modelId);
           }
         } catch (error: any) {
            console.error('Failed to fetch RAG/Bedrock services:', error);
            toast({
              title: 'Error',
              description: 'Failed to load RAG/Bedrock services. Ensure they are running.',
              variant: 'destructive',
            });
         }
      }
    };

    fetchServices();

    // Fetch tools and update server status
    const fetchToolInfo = async () => {
      // Since we configured 'context7', represent it in the UI
      const initialServers: ConnectedServer[] = [
        { name: 'context7', status: 'Pending', tools: [] }
      ];
      setConnectedServers(initialServers);

      try {
        const response = await fetch('/api/tools');
        if (!response.ok) {
          throw new Error('Failed to fetch tools');
        }
        const fetchedTools: DisplayTool[] = await response.json();

        // Update the context7 server entry with fetched tools (currently empty)
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
        // Update status to Error
        setConnectedServers(prev => prev.map(s => 
          s.name === 'context7' ? { ...s, status: 'Error' } : s
        ));
      }
    };

    fetchToolInfo();

  // Depend on chatMode to refetch RAG/Bedrock services if needed when switching modes
  }, [chatMode, toast, selectedGeminiModelId, selectedLlmModelId, selectedRagEndpointId, ragEndpoints, bedrockModels]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    let modelIdToUse: string | null = null;
    let errorDescription: string | null = null;
    let isRagMode = chatMode === ChatMode.RAG_BEDROCK;

    // Determine model and check selection based on mode
    if (chatMode === ChatMode.RAG_BEDROCK) {
      if (!selectedRagEndpointId || !selectedLlmModelId) {
        errorDescription = 'Please select a RAG endpoint and a Bedrock model.';
      } else {
        modelIdToUse = selectedLlmModelId; // Or construct ID if needed
      }
    } else if (chatMode === ChatMode.DIRECT_GEMINI) {
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

    // Show toast and return if a model wasn't selected for the current mode
    if (errorDescription) {
        toast({
          title: 'Configuration Missing',
          description: errorDescription,
          variant: 'default',
        });
        return;
    }
    if (!modelIdToUse) {
        // Should not happen if errorDescription logic is correct, but as a safeguard:
        console.error("Model ID to use is somehow null/undefined despite passing checks.");
        toast({ title: 'Error', description: 'Could not determine model to use.', variant: 'destructive' });
        return;
    }

    const userMessageText = userInput;
    // Generate session ID only if it doesn't exist (first message)
    const sessionIdToUse = currentSessionId ?? crypto.randomUUID();
    if (!currentSessionId) {
        setCurrentSessionId(sessionIdToUse);
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: userMessageText,
    };

    // Add user message and a *placeholder* bot message for streaming
    const botMessagePlaceholderId = crypto.randomUUID();
    const botMessagePlaceholder: ChatMessage = {
        id: botMessagePlaceholderId,
        sender: 'bot',
        text: '', // Start empty
        toolInvocations: []
    };
    setMessages((prevMessages) => [...prevMessages, userMessage, botMessagePlaceholder]);
    setUserInput('');
    setIsLoading(true); // Keep loading state for input disabling

    try {
      let apiUrl: string;
      let requestBody: any;

      // Determine API route and request body based on mode
      if (chatMode === ChatMode.RAG_BEDROCK) {
        apiUrl = '/api/rag-chat';
        requestBody = {
          ragEndpointId: selectedRagEndpointId,
          llmModelId: modelIdToUse, 
          query: userMessageText,
          temperaturePreset: temperaturePreset,
          maxTokens: maxTokens,
          sessionId: sessionIdToUse,
        };
      } else { // DIRECT_GEMINI or DIRECT_OPENAI
        apiUrl = '/api/basic-chat';
        requestBody = {
          userMessage: userMessageText,
          modelId: modelIdToUse,
          temperaturePreset: temperaturePreset,
          maxTokens: maxTokens,
          sessionId: sessionIdToUse,
        };
      }

      // Revert to using fetch for streaming SSE
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // Check response.ok AND response.body
      if (!response.ok || !response.body) { 
        const errorDetail = response.body 
            ? (await response.json()).details // Try parsing JSON error if body exists
            : `Request failed with status ${response.status}`; // Fallback if no body
        throw new Error(errorDetail || `API request failed with status ${response.status}`);
      }

      // Process the stream using SSE logic
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      console.log("Starting SSE processing loop..."); // Log loop start

      while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          const chunk = decoder.decode(value, { stream: !done });
          console.log("SSE Raw Chunk:", chunk); // Log raw chunk
          buffer += chunk;

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
              const eventData = buffer.substring(0, boundary);
              buffer = buffer.substring(boundary + 2);
              console.log("Processing SSE Event Data:", eventData); // Log event data block
              
              // Robust parsing for event and data lines
              let eventType = 'message'; // Default event type
              let dataPayload = '';
              const lines = eventData.split('\n');
              for (const line of lines) {
                  if (line.startsWith('event:')) {
                      eventType = line.substring(6).trim();
                  } else if (line.startsWith('data:')) {
                      dataPayload = line.substring(5).trim();
                  }
              }
              console.log(`Extracted Event Type: ${eventType}, Data Payload: ${dataPayload}`); // Log extracted parts

              if (dataPayload) { // Check if data payload exists
                  try {
                      const jsonData = JSON.parse(dataPayload);
                      console.log("Parsed JSON Data:", jsonData); // Log parsed data

                      setMessages((prevMessages) => {
                          // Refined state update logic
                          const updatedMessages = prevMessages.map((msg) => {
                              // console.log(`Comparing msg.id (${msg.id}) with placeholderId (${botMessagePlaceholderId})`);
                              if (msg.id === botMessagePlaceholderId) {
                                  // console.log(`Attempting to update placeholder message ${botMessagePlaceholderId} for event: ${eventType}`);
                                  if (eventType === 'chunk') {
                                      // console.log(`  > Current text: "${msg.text}"`);
                                      // console.log(`  > Appending chunk: "${jsonData.text}"`);
                                      const newText = msg.text + jsonData.text;
                                      console.log(`  >> Updating msg ${msg.id} text to: "${newText}"`); // Log new text
                                      return { ...msg, text: newText }; // Return new object
                                  } else if (eventType === 'tool_invocations') {
                                      console.log("  >> Updating tool invocations:", jsonData);
                                      return { ...msg, toolInvocations: jsonData };
                                  } else if (eventType === 'error') {
                                      console.error("Streaming error from server event:", jsonData.error);
                                      toast({ title: 'Stream Error', description: jsonData.error, variant: 'destructive' });
                                      const updatedMsg = { ...msg, text: msg.text + `\n\n[STREAM ERROR: ${jsonData.error}]` };
                                      // console.log("  > New message object (with error):", updatedMsg);
                                      return updatedMsg;
                                  } else if (eventType === 'done') {
                                      console.log("  >> Received 'done' event for placeholder.");
                                  } else if (eventType === 'final_response') {
                                      console.log("Received final_response event:", jsonData);
                                      // Update with final text (might be redundant if chunks were complete)
                                      // and tool invocations. Also update session ID if needed.
                                      if(jsonData.sessionId && !currentSessionId) {
                                          console.log("Setting session ID from server response:", jsonData.sessionId);
                                          setCurrentSessionId(jsonData.sessionId);
                                      }
                                      return {
                                         ...msg, 
                                         text: jsonData.response ?? msg.text, // Use final text if present
                                         toolInvocations: jsonData.toolInvocations 
                                      };
                                  }
                              }
                              return msg; // Essential: Return unmodified msg if ID doesn't match
                          });
                          // console.log("prevMessages === updatedMessages:", prevMessages === updatedMessages);
                          return updatedMessages; // Return the new array for React state update
                      });
                      console.log(`<<< setMessages call completed for event: ${eventType}`); // Log after setMessages
                  } catch (parseError) {
                      console.error("SSE JSON Parse Error:", parseError, "Data was:", dataPayload);
                  }
              }
              boundary = buffer.indexOf('\n\n');
          }
      }
      console.log("Finished SSE processing loop."); // Log loop end
      // Stream finished

    } catch (error: any) {
      // ... error handling ...
    } finally {
      setIsLoading(false);
    }
  };

  // Add a way to clear the chat and session ID
  const clearChat = () => {
    setMessages([]);
    setCurrentSessionId(undefined); // Reset session ID for a new conversation
    toast({ title: "Chat Cleared", description: "Ready for a new conversation." });
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <Sidebar>
          <SidebarTrigger />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Chat Configuration</SidebarGroupLabel>
              <Separator />
              <div className="p-2 space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Chat Mode</p>
                  <Select value={chatMode} onValueChange={(value) => setChatMode(value as ChatMode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Chat Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ChatMode.RAG_BEDROCK}>RAG (Bedrock)</SelectItem>
                      <SelectItem value={ChatMode.DIRECT_GEMINI}>Direct (Gemini)</SelectItem>
                      <SelectItem value={ChatMode.DIRECT_OPENAI}>Direct (OpenAI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={cn(chatMode !== ChatMode.DIRECT_GEMINI && 'opacity-50 cursor-not-allowed')}> 
                  <p className="mb-2 text-sm font-medium">Gemini Model</p>
                  <Select
                    value={selectedGeminiModelId}
                    onValueChange={setSelectedGeminiModelId}
                    disabled={chatMode !== ChatMode.DIRECT_GEMINI}
                  >
                    <SelectTrigger disabled={chatMode !== ChatMode.DIRECT_GEMINI}>
                      <SelectValue placeholder="Select Gemini Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGeminiModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={cn(chatMode !== ChatMode.DIRECT_OPENAI && 'hidden')}>
                  <p className="mb-2 text-sm font-medium"> <BrainCircuit size={16} className="inline mr-1"/> OpenAI Model</p>
                  <Select
                    value={selectedOpenAIModelId}
                    onValueChange={setSelectedOpenAIModelId}
                    disabled={chatMode !== ChatMode.DIRECT_OPENAI}
                  >
                    <SelectTrigger disabled={chatMode !== ChatMode.DIRECT_OPENAI}>
                      <SelectValue placeholder="Select OpenAI Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOpenAIModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="temperature-preset">Creativity</Label>
                  <Select 
                    value={temperaturePreset} 
                    onValueChange={(value) => setTemperaturePreset(value as TemperaturePreset)}
                    name="temperature-preset"
                   >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Creativity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="precise">Precise</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {temperaturePreset === 'precise' && 'More factual, focused output.'}
                    {temperaturePreset === 'normal' && 'Balanced output.'}
                    {temperaturePreset === 'creative' && 'More imaginative, diverse output.'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="max-tokens">Max Response Length (Tokens)</Label>
                  <Input
                    id="max-tokens"
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    min="1"
                    max="8192" // Example max, adjust as needed
                    step="16"
                  />
                </div>
              </div>
            </SidebarGroup>
            <SidebarGroup className={cn(chatMode !== ChatMode.RAG_BEDROCK && 'hidden')}> 
              <SidebarGroupLabel>RAG Configuration</SidebarGroupLabel>
              <Separator />
              <div className="p-2 space-y-4"> 
                <ServiceSelector
                  label="RAG Endpoint"
                  items={ragEndpoints.map((ep) => ({ id: ep.endpointId, name: ep.endpointName }))}
                  selectedId={selectedRagEndpointId}
                  onSelect={setSelectedRagEndpointId}
                  disabled={chatMode !== ChatMode.RAG_BEDROCK} 
                />
                <ServiceSelector
                  label="Bedrock LLM Model"
                  items={bedrockModels.map((model) => ({ id: model.modelId, name: model.modelName }))}
                  selectedId={selectedLlmModelId}
                  onSelect={setSelectedLlmModelId}
                  disabled={chatMode !== ChatMode.RAG_BEDROCK}
                />
              </div>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Connected Servers</SidebarGroupLabel>
              <Separator />
              <div className="p-2 space-y-2">
                {connectedServers.map(server => (
                  <div key={server.name} className="text-sm">
                    <div className="flex items-center space-x-2 mb-1">
                       <Server size={16} /> 
                       <span className="font-medium">{server.name}</span> 
                       <span className={cn(
                         "text-xs px-1.5 py-0.5 rounded",
                         server.status === 'Connected' && 'bg-green-100 text-green-800',
                         server.status === 'Error' && 'bg-red-100 text-red-800',
                         server.status === 'Pending' && 'bg-yellow-100 text-yellow-800'
                       )}>{server.status}</span>
                    </div>
                    {server.status === 'Connected' && (
                      <ul className="list-disc list-inside pl-4 text-xs text-muted-foreground space-y-1">
                        {server.tools.length > 0 ? (
                          server.tools.map(tool => (
                            <li key={tool.name} title={tool.description}>{tool.name}</li>
                          ))
                        ) : (
                          <li>No tools listed for this server.</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
                {connectedServers.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No MCP servers configured.</p>
                )}
              </div>
            </SidebarGroup>
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
        <div className="flex-1 p-4">
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
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({node, className, children, ...props}) {
                              const match = /language-(\w+)/.exec(className || '');
                              const language = match ? match[1] : '';

                              if (language === 'mermaid') {
                                return (
                                    <pre className="mermaid" key={crypto.randomUUID()}>
                                      {String(children).replace(/\n$/, '')}
                                    </pre>
                                );
                              }
                               
                              return (
                                <pre className={className || ''} style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                                  <code className={className}>
                                      {children}
                                  </code>
                                </pre>
                              )
                            }
                          }}
                        >
                          {message.text}
                        </ReactMarkdown>
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
            <div className="border-t p-4">
              <div className="flex items-center space-x-2">
                <Input
                  type="text"
                  placeholder="Enter your message..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isLoading}
                />
                <Button onClick={handleSendMessage} disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send'}
                 </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default LambdaChat;
