import fs, { stat } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// Build-time detection to prevent file system operations during Next.js build analysis
const isBuildTime = process.env.NEXT_BUILD === "true" ||
                   process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build" ||
                   typeof process.cwd !== 'function' ||
                   process.env.TURBOPACK === "1";

const isServerRuntime = typeof window === "undefined" &&
                       typeof process !== "undefined" &&
                       process.env.NODE_ENV !== undefined &&
                       !isBuildTime &&
                       typeof require !== "undefined";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ docIdParam: string }> }
) {
  // 🚀 ENHANCED SERVER-SIDE PDF DEBUG LOGGING
  console.log('🚀 ===== PDF FILE REQUEST START =====');
  console.log('🚀 Request URL:', request.url);
  console.log('🚀 Request method:', request.method);
  console.log('🚀 Request headers:', Object.fromEntries(request.headers.entries()));
  
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

  // Enhanced security: Comprehensive file name validation
  const safeFileName = path.basename(fileName);

  // Whitelist-based validation for allowed characters
  const allowedFileNamePattern = /^[a-zA-Z0-9._-]+$/;
  const maxFileNameLength = 255;

  // Security checks
  if (safeFileName !== fileName) {
    console.error('❌ Path traversal attempt detected:', { original: fileName, sanitized: safeFileName });
    return NextResponse.json({ error: 'Invalid file name: path traversal detected.' }, { status: 400 });
  }

  if (!allowedFileNamePattern.test(safeFileName)) {
    console.error('❌ Invalid characters in fileName:', safeFileName);
    return NextResponse.json({ error: 'Invalid file name: contains forbidden characters.' }, { status: 400 });
  }

  if (safeFileName.length > maxFileNameLength) {
    console.error('❌ File name too long:', safeFileName.length);
    return NextResponse.json({ error: 'Invalid file name: too long.' }, { status: 400 });
  }

  if (safeFileName.startsWith('.') || safeFileName.includes('..')) {
    console.error('❌ Suspicious file name pattern:', safeFileName);
    return NextResponse.json({ error: 'Invalid file name: suspicious pattern.' }, { status: 400 });
  }

  // Construct the file path - IMPORTANT: Adjust this path according to your actual file storage structure.
  // This example assumes an 'uploads' directory at the project root.
  let UPLOADS_DIR = "./uploads"; // Default relative path for build analysis
  
  if (isServerRuntime && typeof process.cwd === 'function') {
    try {
      UPLOADS_DIR = path.join(process.cwd(), 'uploads');
      console.log(`[Files API] Uploads directory resolved to: ${UPLOADS_DIR}`);
    } catch (error) {
      console.warn(`[Files API] Failed to resolve uploads directory, using relative path:`, error);
      UPLOADS_DIR = "./uploads"; // Fallback to relative path
    }
  } else {
    console.log(`[Files API] Skipping file system operations during build analysis - using relative path`);
  }
  
  const sessionDir = path.join(UPLOADS_DIR, sessionId);
  const filePath = path.join(sessionDir, safeFileName);
  
  // Only log process.cwd() during runtime
  if (isServerRuntime && typeof process.cwd === 'function') {
    console.log('📍 Process CWD:', process.cwd());
  } else {
    console.log('📍 Process CWD: [skipped during build analysis]');
  }
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

    console.log('📖 Reading file...');
    const fileBuffer = await fs.readFile(filePath);
    console.log('✅ File read successfully');
    console.log('📊 File buffer size:', fileBuffer.length);

    // Set appropriate headers for PDF files
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${safeFileName}"`); // Suggests browser to display inline
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    headers.set('Content-Length', fileBuffer.length.toString());
    
    console.log('📤 Response headers:', Object.fromEntries(headers.entries()));
    console.log('🎉 Sending successful PDF response');
    console.log('🚀 ===== PDF FILE REQUEST END =====');

    return new NextResponse(fileBuffer, { status: 200, headers });

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