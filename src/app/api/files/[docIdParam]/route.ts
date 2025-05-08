import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { stat } from 'fs/promises';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ docIdParam: string }> }
) {
  const params = await context.params;
  const encodedDocIdParam = params.docIdParam;

  if (!encodedDocIdParam) {
    return NextResponse.json({ error: 'Document ID parameter is missing' }, { status: 400 });
  }

  // The client should have used encodeURIComponent on the documentId before making the request.
  // Next.js automatically decodes path parameters.
  const docId = encodedDocIdParam;

  const parts = docId.split('::');
  if (parts.length !== 2) {
    console.error(`Invalid documentId format: ${docId}`);
    return NextResponse.json({ error: 'Invalid document ID format. Expected sessionId::fileName.' }, { status: 400 });
  }

  const [sessionId, fileName] = parts;

  if (!sessionId || !fileName) {
    return NextResponse.json({ error: 'Invalid session ID or file name derived from document ID.' }, { status: 400 });
  }

  // Basic sanitization for fileName to prevent path traversal.
  // path.basename will return only the last portion of a path, which should be the filename.
  const safeFileName = path.basename(fileName);
  if (safeFileName !== fileName) {
    // This indicates an attempt at path traversal or an unexpected fileName format.
    console.error(`Potentially unsafe fileName detected: original='${fileName}', sanitized='${safeFileName}'`);
    return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
  }

  // Construct the file path - IMPORTANT: Adjust this path according to your actual file storage structure.
  // This example assumes an 'uploads' directory at the project root.
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads'); // Define your uploads directory base
  const filePath = path.join(UPLOADS_DIR, sessionId, safeFileName);

  try {
    // Check if file exists and is accessible
    await stat(filePath); // Throws an error if file doesn't exist

    const fileBuffer = await fs.readFile(filePath);

    // Set appropriate headers for PDF files
    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="${safeFileName}"`); // Suggests browser to display inline
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    return new NextResponse(fileBuffer, { status: 200, headers });

  } catch (error: unknown) {
    // Check if error is an object and has a 'code' property
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      console.error(`File not found: ${filePath}`);
      return NextResponse.json({ error: 'File not found.' }, { status: 404 });
    }
    console.error(`Error serving file ${filePath}:`, error);
    return NextResponse.json({ error: 'Internal server error while serving the file.' }, { status: 500 });
  }
}