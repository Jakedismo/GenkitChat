import { EnhancedPdfResponse, serverPdfProcessor } from '@/utils/serverPdfProcessor';
import fs, { stat } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ docIdParam: string }> }
) {
  // 🚀 ENHANCED SERVER-SIDE PDF DEBUG LOGGING
  console.log('🚀 ===== PDF FILE REQUEST START =====');
  console.log('🚀 Request URL:', request.url);
  console.log('🚀 Request method:', request.method);
  console.log('🚀 Request headers:', Object.fromEntries(request.headers.entries()));
  
  // Extract query parameters for enhanced PDF processing
  const searchParams = request.nextUrl.searchParams;
  const includeCoordinates = searchParams.get('includeCoordinates') === 'true';
  const includeTextContent = searchParams.get('includeTextContent') === 'true';
  const textToHighlight = searchParams.get('textToHighlight') || undefined;
  const pageNumberParam = searchParams.get('pageNumber');
  
  // Parse page number if provided
  let pageNumber: number | undefined = undefined;
  if (pageNumberParam) {
    const parsedPageNumber = parseInt(pageNumberParam, 10);
    if (!isNaN(parsedPageNumber) && parsedPageNumber > 0) {
      pageNumber = parsedPageNumber;
    } else {
      console.warn('⚠️ Invalid pageNumber parameter:', pageNumberParam);
    }
  }
  
  console.log('📋 Enhanced PDF options:', {
    includeCoordinates,
    includeTextContent,
    pageNumber,
    textToHighlight: textToHighlight ? `${textToHighlight.substring(0, 50)}${textToHighlight.length > 50 ? '...' : ''}` : undefined
  });
  
  const params = await context.params;
  const encodedDocIdParam = params.docIdParam;
  
  console.log('📋 Raw docIdParam from URL path:', encodedDocIdParam);
  console.log('📋 docIdParam type:', typeof encodedDocIdParam);
  console.log('📋 docIdParam length:', encodedDocIdParam?.length || 0);

  if (!encodedDocIdParam) {
    console.error('❌ Document ID parameter is missing');
    return NextResponse.json({ error: 'Document ID parameter is missing' }, { status: 400 });
  }

  // The client should have used encodeURIComponent on the documentId before making the request.
  // Next.js automatically decodes path parameters.
  const docId = encodedDocIdParam;
  console.log('🔓 Using docId (should be automatically decoded by Next.js):', docId);

  const parts = docId.split('::');
  console.log('🔧 Split result:', parts);
  console.log('🔧 Parts count:', parts.length);
  
  if (parts.length !== 2) {
    console.error('❌ Invalid documentId format - expected exactly 2 parts separated by "::"');
    console.error('❌ Received docId:', docId);
    console.error('❌ Split parts:', parts);
    return NextResponse.json({ error: 'Invalid document ID format. Expected sessionId::fileName.' }, { status: 400 });
  }

  const [sessionId, fileName] = parts;
  console.log('📂 Extracted sessionId:', sessionId);
  console.log('📂 Extracted fileName:', fileName);
  console.log('📂 SessionId type:', typeof sessionId);
  console.log('📂 FileName type:', typeof fileName);
  console.log('📂 SessionId length:', sessionId?.length || 0);
  console.log('📂 FileName length:', fileName?.length || 0);

  if (!sessionId || !fileName) {
    console.error('❌ Empty sessionId or fileName after parsing');
    console.error('❌ SessionId:', sessionId);
    console.error('❌ FileName:', fileName);
    return NextResponse.json({ error: 'Invalid session ID or file name derived from document ID.' }, { status: 400 });
  }

  // Basic sanitization for fileName to prevent path traversal.
  // path.basename will return only the last portion of a path, which should be the filename.
  const safeFileName = path.basename(fileName);
  console.log('🔒 Original fileName:', fileName);
  console.log('🔒 Sanitized fileName:', safeFileName);
  console.log('🔒 FileName is safe:', safeFileName === fileName);
  
  if (safeFileName !== fileName) {
    // This indicates an attempt at path traversal or an unexpected fileName format.
    console.error('❌ Potentially unsafe fileName detected');
    console.error('❌ Original fileName:', fileName);
    console.error('❌ Sanitized fileName:', safeFileName);
    return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
  }

  // Construct the file path - IMPORTANT: Adjust this path according to your actual file storage structure.
  // This example assumes an 'uploads' directory at the project root.
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads'); // Define your uploads directory base
  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  const filePath = path.join(sessionDir, safeFileName);
  
  console.log('📍 Process CWD:', process.cwd());
  console.log('📍 Uploads directory:', UPLOADS_DIR);
  console.log('📍 Session directory:', sessionDir);
  console.log('📍 Full file path:', filePath);

  try {
    // Enhanced directory and file existence checking
    console.log('🔍 Checking path existence...');
    
    // Check if uploads directory exists
    try {
      await stat(UPLOADS_DIR);
      console.log('✅ Uploads directory exists');
      
      // List contents of uploads directory
      const uploadsDirContents = await fs.readdir(UPLOADS_DIR);
      console.log('📋 Uploads directory contents:', uploadsDirContents);
    } catch (e) {
      console.error('❌ Uploads directory does not exist or is not accessible:', e);
      return NextResponse.json({ error: 'Uploads directory not found.' }, { status: 404 });
    }
    
    // Check if session directory exists
    try {
      await stat(sessionDir);
      console.log('✅ Session directory exists');
      
      // List contents of session directory
      const sessionDirContents = await fs.readdir(sessionDir);
      console.log('📋 Session directory contents:', sessionDirContents);
    } catch (e) {
      console.error('❌ Session directory does not exist:', sessionDir);
      console.error('❌ Session directory error:', e);
      return NextResponse.json({ error: 'Session directory not found.' }, { status: 404 });
    }

    // Check if file exists and is accessible
    console.log('🔍 Checking target file existence...');
    const fileStats = await stat(filePath); // Throws an error if file doesn't exist
    console.log('✅ File exists');
    console.log('📊 File stats:', {
      size: fileStats.size,
      isFile: fileStats.isFile(),
      isDirectory: fileStats.isDirectory(),
      modified: fileStats.mtime.toISOString()
    });

    // Determine if we need enhanced processing
    const needsEnhancedProcessing = includeCoordinates || includeTextContent || textToHighlight;
    
    let response: EnhancedPdfResponse | null = null;
    
    if (needsEnhancedProcessing) {
      console.log('🧠 Enhanced PDF processing requested...');
      try {
        // Process the PDF with the enhanced options
        const startTime = performance.now();
        
        response = await serverPdfProcessor.processPdf(filePath, {
          includeTextContent,
          includeCoordinates,
          textToHighlight,
          pageNumber
        });
        
        const processingTime = performance.now() - startTime;
        
        console.log('✅ Enhanced PDF processing completed successfully');
        console.log('📊 Processing metadata:', {
          ...response.metadata.processing,
          totalTime: `${processingTime.toFixed(2)}ms`,
          cacheHit: response.metadata.processing.cacheHit ? '✓' : '✗',
          pageFiltered: pageNumber ? '✓' : '✗'
        });
        
        // Add detailed stats about highlights if available
        if (response.highlightCoordinates) {
          console.log('📊 Highlight stats:', {
            count: response.highlightCoordinates.length,
            byPage: response.highlightCoordinates.reduce((acc, h) => {
              acc[h.pageNumber] = (acc[h.pageNumber] || 0) + 1;
              return acc;
            }, {} as Record<number, number>),
            byConfidence: response.highlightCoordinates.reduce((acc, h) => {
              const level = h.confidence > 0.9 ? 'high' :
                            h.confidence > 0.7 ? 'medium' :
                            h.confidence > 0.5 ? 'low' : 'very-low';
              acc[level] = (acc[level] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          });
        }
      } catch (error) {
        console.error('❌ Error during enhanced PDF processing:', error);
        // Fall back to basic PDF serving if enhanced processing fails
        console.log('⚠️ Falling back to basic PDF serving');
      }
    }
    
    // If enhanced processing succeeded, use that response, otherwise read the file directly
    const fileBuffer = response?.pdfBuffer || await fs.readFile(filePath);
    console.log('✅ File buffer acquired successfully');
    console.log('📊 File buffer size:', fileBuffer.length);

    // Set appropriate headers for PDF files
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${safeFileName}"`); // Suggests browser to display inline
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    headers.set('Content-Length', fileBuffer.length.toString());
    
    // If enhanced response is available and we need to return more than just the PDF
    if (response && needsEnhancedProcessing) {
      console.log('🔍 Returning enhanced PDF response with additional data');
      
      // Create JSON response with PDF data as base64
      const enhancedResponse = {
        pdf: Buffer.from(fileBuffer).toString('base64'),
        textContent: response.textContent,
        highlightCoordinates: response.highlightCoordinates,
        metadata: response.metadata
      };
      
      console.log('📤 Response metadata:', {
        textContentProvided: !!enhancedResponse.textContent,
        textContentSize: enhancedResponse.textContent ?
          `${JSON.stringify(enhancedResponse.textContent).length / 1024} KB` : 'N/A',
        highlightsProvided: !!enhancedResponse.highlightCoordinates,
        highlightCount: enhancedResponse.highlightCoordinates?.length || 0,
        processing: {
          textExtracted: response.metadata.processing.textExtracted,
          coordinatesPrecomputed: response.metadata.processing.coordinatesPrecomputed,
          cacheHit: response.metadata.processing.cacheHit,
          time: response.metadata.processing.processingTime ?
            `${response.metadata.processing.processingTime.toFixed(2)}ms` : 'N/A'
        }
      });
      console.log('🚀 ===== PDF FILE REQUEST END =====');
      
      return NextResponse.json(enhancedResponse, { status: 200 });
    } else {
      // Return the PDF file directly (original behavior)
      console.log('📤 Response headers:', Object.fromEntries(headers.entries()));
      console.log('🎉 Sending basic PDF response');
      console.log('🚀 ===== PDF FILE REQUEST END =====');
      
      return new NextResponse(fileBuffer, { status: 200, headers });
    }

  } catch (error: unknown) {
    console.error('💥 ===== PDF FILE REQUEST ERROR =====');
    console.error('💥 Error type:', typeof error);
    console.error('💥 Error:', error);
    
    // Check if error is an object and has a 'code' property
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      console.error('💥 File not found (ENOENT):', filePath);
      console.error('💥 This is a "file does not exist" error');
      console.error('💥 ===== PDF FILE REQUEST ERROR END =====');
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    
    console.error('💥 Other error serving file:', filePath);
    console.error('💥 Error details:', error);
    if (error instanceof Error) {
      console.error('💥 Error message:', error.message);
      console.error('💥 Error stack:', error.stack);
    }
    console.error('💥 ===== PDF FILE REQUEST ERROR END =====');
    return NextResponse.json({ error: 'Internal server error while serving the file.' }, { status: 500 });
  }
}