import { NextRequest, NextResponse } from "next/server";
import fs from 'fs/promises'; // Add fs/promises
import path from 'path';     // Add path
// Removed unused import 'ai/rsc'
import {
  documentQaStreamFlow,
  generateRagSessionId,
  processFileWithOfficeParser,
  MAX_UPLOAD_SIZE // Need this back for server-side size check
} from "@/services/rag";
import { withGenkitServer } from "@/lib/server"; // Import server initialization wrapper
// Tool imports are no longer needed here as tools are accessed via aiInstance by name
// Removed incorrect Tool type import

const UPLOADS_DIR = path.join(process.cwd(), 'uploads'); // Define base uploads dir

// Handle file uploads
export async function POST(request: NextRequest) {
  return withGenkitServer(async () => {
  try {
    // Check content type to differentiate file upload vs chat
    const contentType = request.headers.get("content-type") || "";

    // Handle file uploads (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("files") as File[];
      const sessionId = formData.get("sessionId") as string || generateRagSessionId();

      // Enhanced validation for request
      if (!files || files.length === 0) {
        console.log('[rag-chat/route] No files provided in upload request');
        return NextResponse.json(
          { error: "No files provided", message: "Please select at least one file to upload." },
          { status: 400 }
        );
      }
      
      // Validate file types
      const allowedTypes = [
        'application/pdf', 
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
        'text/markdown',
        'text/csv',
        'application/json'
      ];
      
      const invalidFiles = files.filter(file => !allowedTypes.includes(file.type));
      if (invalidFiles.length > 0) {
        const invalidTypes = invalidFiles.map(f => `${f.name} (${f.type || 'unknown type'})`);
        console.log(`[rag-chat/route] Invalid file types in upload: ${invalidTypes.join(', ')}`);
        
        return NextResponse.json(
          { 
            error: "Invalid file type(s)", 
            message: `The following files have unsupported formats: ${invalidTypes.join(', ')}. Supported formats include PDF, TXT, DOCX, XLSX, PPTX, MD, CSV, and JSON.`,
            details: {
              invalidFiles: invalidTypes,
              allowedTypes
            }
          },
          { status: 422 } // Unprocessable Entity
        );
      }

      // Check total size
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > MAX_UPLOAD_SIZE) {
        return NextResponse.json(
          { error: `Total file size exceeds the maximum allowed size of ${MAX_UPLOAD_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        );
      }

      // Ensure session directory exists
      const sessionDir = path.join(UPLOADS_DIR, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const fileProcessingPromises = files.map(async (file) => {
        // Basic sanitization again for safety
        const safeFileName = path.basename(file.name);
        if (safeFileName !== file.name) {
            console.error(`Invalid file name detected during upload: ${file.name}`);
            // Return structure indicating failure for this file
            return { success: false, error: `Invalid file name: ${file.name}` };
        }
        const filePath = path.join(sessionDir, safeFileName);

        try {
          // Save the file to disk
          const buffer = Buffer.from(await file.arrayBuffer());
          await fs.writeFile(filePath, buffer);
          console.log(`Saved uploaded file to: ${filePath}`); // Log save location

          // Now process the file using the original File object (Option 2)
          // If processFileWithOfficeParser needed the path, we would pass filePath here.
           const processingResult = await processFileWithOfficeParser(file, sessionId);
           if (!processingResult.success) {
             // Optionally remove the saved file if processing failed?
             // await fs.unlink(filePath).catch(err => console.error(`Failed to remove file after processing error: ${filePath}`, err));
             // Return the error structure
             return processingResult;
           }
           // Processing successful
           return processingResult;

        } catch (saveOrProcessError) {
            console.error(`Error saving or processing file ${file.name} at ${filePath}:`, saveOrProcessError);
            // Return structure indicating failure for this file
            return { success: false, error: saveOrProcessError instanceof Error ? saveOrProcessError.message : String(saveOrProcessError) };
        }
      });

      // Process results from saving and parsing attempts
      const results = await Promise.all(fileProcessingPromises);

      const failedFiles = results
        .map((result, index) => (!result.success ? {
          file: files[index].name,
          error: result.error
        } : null))
        .filter(Boolean);

      if (failedFiles.length > 0) {
        console.log(`[rag-chat/route] File processing failed for ${failedFiles.length} files:`, failedFiles);
        return NextResponse.json({
          sessionId,
          success: false,
          failedFiles
        }, { status: 422 }); // Unprocessable Entity
      }

      return NextResponse.json({
        sessionId,
        success: true,
        message: `Successfully processed and saved ${files.length} file(s)`, // Updated message
      });
    }
    // Handle chat requests (application/json)
    else {
      const body = await request.json();
      // Extract tool flags along with other parameters
      const { 
        query, 
        sessionId, 
        modelId, 
        tavilySearchEnabled,
        tavilyExtractEnabled, // Added flag
        perplexitySearchEnabled, 
        perplexityDeepResearchEnabled 
      } = body;

      // Validation
       if (!query) {
         return NextResponse.json(
          { error: "No query provided" },
          { status: 400 }
        );
      }
      
      if (!sessionId) {
        return NextResponse.json(
          { error: "No session ID provided" },
          { status: 400 }
        );
      }
      
      if (!modelId) {
        return NextResponse.json(
          { error: "No model ID provided" },
          { status: 400 }
        );
      }
      
      // Determine which tools to potentially pass based on flags
      const toolNamesToUse: string[] = [];
      if (tavilySearchEnabled) {
        toolNamesToUse.push("tavilySearch"); 
        console.log("Enabling Tavily Search tool for RAG request");
      }
      if (tavilyExtractEnabled) {
        toolNamesToUse.push("tavilyExtract");
        console.log("Enabling Tavily Extract tool for RAG request");
      }
      if (perplexitySearchEnabled) {
        toolNamesToUse.push("perplexitySearch");
        console.log("Enabling Perplexity Search tool for RAG request");
      }
      if (perplexityDeepResearchEnabled) {
        toolNamesToUse.push("perplexityDeepResearch");
        console.log("Enabling Perplexity Deep Research tool for RAG request");
      }
      // Add other tools based on their flags here...
      
      // Generate RAG response stream, passing tool names
      const { stream } = documentQaStreamFlow.stream({ query, sessionId, modelId, tools: toolNamesToUse });
      
      // Return the stream using StreamingTextResponse or similar
      // Adapting based on typical 'ai' package usage
       // Use streamToResponse for Server-Sent Events compatible streaming
       // Note: The exact format might depend on how aiInstance.generateStream formats chunks.
       // Assuming chunks have a .text property for now.
       const responseStream = new ReadableStream({
         async start(controller) {
           const encoder = new TextEncoder();
           try {
             for await (const event of stream) { // event from documentQaStreamFlow.stream()
               let sseEventString = "";
               switch (event.type) {
                 case 'sources':
                   sseEventString = `event: sources\ndata: ${JSON.stringify({ sources: event.sources })}\n\n`;
                   break;
                 case 'text':
                   sseEventString = `event: text\ndata: ${JSON.stringify({ text: event.text })}\n\n`;
                   break;
                 case 'tool_invocation':
                   // Ensure all parts of the tool_invocation are serializable
                   const toolData = { 
                     name: event.name, 
                     input: event.input, 
                     output: event.output,
                     error: event.error // Include error if present
                   };
                   sseEventString = `event: tool_invocation\ndata: ${JSON.stringify(toolData)}\n\n`;
                   break;
                 case 'error':
                   sseEventString = `event: error\ndata: ${JSON.stringify({ error: event.error })}\n\n`;
                   controller.enqueue(encoder.encode(sseEventString));
                   // Close the stream after sending the error
                   controller.close();
                   return; // Exit the loop and stream
                 default:
                   // Optionally log or handle unknown event types
                   console.warn("Unknown RAG stream event type:", event);
                   continue; // Skip to next event
               }
               if (sseEventString) {
                 controller.enqueue(encoder.encode(sseEventString));
               }
             }
           } catch (error) {
             console.error("Error during RAG stream processing in route:", error);
             // Try to send a final error event to the client
             const formattedError = `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`;
             try {
               controller.enqueue(encoder.encode(formattedError));
             } catch (e) {
               // If enqueue fails, controller might already be closed or in a bad state
               console.error("Failed to enqueue final error to client:", e);
             }
           } finally {
             // Ensure the controller is closed if not already
             // (e.g., if the loop finishes without an error event from the stream)
             // However, if controller.close() was called due to 'error' event, this might error.
             // A more robust check would be controller.desiredSize === null or similar if API supports.
             // For simplicity, we assume close is idempotent or an error here is acceptable.
             try {
                controller.close();
             } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
                // Ignore if already closed
             }
           }
         }
       });

       return new Response(responseStream, {
         headers: {
           'Content-Type': 'text/event-stream',
           'Cache-Control': 'no-cache',
           'Connection': 'keep-alive',
         },
       });
       
    // This else block was incorrectly nested. It should handle cases where the content-type is neither form-data nor the expected JSON for chat.
    // However, the current logic already assumes JSON if not form-data, so this specific else is redundant here.
    // The main catch block will handle other errors. We just need to close the 'else' for chat requests properly.
    } 
  } catch (error) { // This catch corresponds to the main try block
    console.error("Error in RAG chat route:", error);
    return NextResponse.json(
      { error: `An error occurred: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
  });
}

// Handle clear chat requests
export async function DELETE(request: NextRequest) {
  return withGenkitServer(async () => {
  try {
    // Extract session ID from query parameters
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "No session ID provided" },
        { status: 400 }
      );
    }
    
    // Generate a new session ID to effectively clear the chat
    // The old session data remains in the vector store but will be filtered out
    // during retrieval. It will be cleaned up when the server restarts.
    const newSessionId = generateRagSessionId();
    
    return NextResponse.json({
      oldSessionId: sessionId,
      newSessionId: newSessionId,
      success: true,
      message: "Chat cleared successfully"
    });
  } catch (error) {
    console.error("Error clearing chat:", error);
    return NextResponse.json(
      { error: `An error occurred: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
  });
}
