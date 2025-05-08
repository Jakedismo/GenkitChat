import { NextRequest, NextResponse } from "next/server";
// Removed unused import 'ai/rsc'
import {
  generateRagResponseStream,
  generateRagSessionId,
  processFileWithOfficeParser,
  MAX_UPLOAD_SIZE // Need this back for server-side size check
} from "@/services/rag";
// Import tool definitions (adjust path/names as needed)
import { tavilySearch } from "@/ai/tools/tavily";
import { GenkitTool } from "genkit/tool"; // Import GenkitTool type for the array

// Handle file uploads
export async function POST(request: NextRequest) {
  try {
    // Check content type to differentiate file upload vs chat
    const contentType = request.headers.get("content-type") || "";

    // Handle file uploads (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("files") as File[];
      const sessionId = formData.get("sessionId") as string || generateRagSessionId();

      // Validate request
      if (!files || files.length === 0) {
        return NextResponse.json(
          { error: "No files provided" },
          { status: 400 }
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

      // Process each file using officeparser via the service
      const results = await Promise.all(
        files.map(file => processFileWithOfficeParser(file, sessionId)) // Call the correct function
      );

      const failedFiles = results
        .map((result, index) => (!result.success ? {
          file: files[index].name,
          error: result.error
        } : null))
        .filter(Boolean);

      if (failedFiles.length > 0) {
        return NextResponse.json({
          sessionId,
          success: false,
          failedFiles
        }, { status: 422 }); // Unprocessable Entity
      }

      return NextResponse.json({
        sessionId,
        success: true,
        message: `Successfully processed ${files.length} file(s)`,
      });
    }
    // Handle chat requests (application/json)
    else {
      const body = await request.json();
      // Extract tool flags along with other parameters
      const { query, sessionId, modelId, tavilySearchEnabled /* other tool flags... */ } = body;

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
      const toolsToUse: GenkitTool[] = [];
      if (tavilySearchEnabled) {
        // Assuming tavilySearch is the correct Genkit tool definition object
        toolsToUse.push(tavilySearch);
        console.log("Adding Tavily tool to RAG request");
      }
      // Add other tools based on their flags here...
      
      // Generate RAG response stream, passing tools
      const stream = await generateRagResponseStream(query, sessionId, modelId, toolsToUse);
      
      // Helper to transform the stream format if necessary, assuming aiInstance stream format
      const transformStream = async function*() {
        for await (const chunk of stream) {
           if (chunk.error) {
             // Handle potential errors yielded by the stream
             console.error("Error chunk from RAG stream:", chunk.error);
             yield `\n\n[ERROR: ${chunk.error}]\n\n`; // Send error message format if needed
             break; // Stop streaming on error
           } else if (chunk.text) {
             yield chunk.text;
           }
        }
      };

      // Return the stream using StreamingTextResponse or similar
      // Adapting based on typical 'ai' package usage
       // Use streamToResponse for Server-Sent Events compatible streaming
       // Note: The exact format might depend on how aiInstance.generateStream formats chunks.
       // Assuming chunks have a .text property for now.
       const responseStream = new ReadableStream({
         async start(controller) {
           const encoder = new TextEncoder();
           for await (const chunk of stream) {
             if (chunk.sources) {
               const formattedSources = `event: sources\ndata: ${JSON.stringify({ sources: chunk.sources })}\n\n`;
               controller.enqueue(encoder.encode(formattedSources));
             } else if (chunk.text) {
               const formattedChunk = `event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`;
               controller.enqueue(encoder.encode(formattedChunk));
             } else if (chunk.error) {
               const formattedError = `event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`;
               controller.enqueue(encoder.encode(formattedError));
               break; // Stop on error
             }
             // Add final_response event if needed, depends on generateStream implementation details
           }
           // Signal stream end? The frontend loop should handle reader.closed
           controller.close();
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
}

// Handle clear chat requests
export async function DELETE(request: NextRequest) {
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
}
