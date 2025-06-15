import { JsonSessionStore } from '@/lib/json-session-store';
import { withGenkitServer } from '@/lib/server';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const sessionStore = new JsonSessionStore();

// Session metadata interface - Adding index signature for Genkit compatibility
interface SessionMetadata {
  sessionId: string;
  created: string;
  lastActivity: string;
  documentCount?: number;
  [key: string]: unknown; // Allow additional properties for Record<string, unknown> compatibility
}

export async function GET(req: NextRequest) {
  return withGenkitServer(async () => {
    try {
      const { searchParams } = new URL(req.url);
      const sessionId = searchParams.get('sessionId');

      if (!sessionId) {
        return NextResponse.json(
          { error: 'Session ID is required' },
          { status: 400 }
        );
      }

      // Try to load existing session from store
      const sessionData = await sessionStore.get(sessionId);
      
      if (!sessionData) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      const metadata = sessionData.state as SessionMetadata;

      return NextResponse.json({
        sessionId,
        exists: true,
        created: metadata?.created || null,
        lastActivity: metadata?.lastActivity || null,
        documentCount: metadata?.documentCount || 0
      });

    } catch (error) {
      console.error('Error loading session:', error);
      return NextResponse.json(
        {
          error: 'Failed to load session',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: NextRequest) {
  return withGenkitServer(async () => {
    try {
      const body = await req.json();
      const { sessionId } = body;

      // Use provided sessionId or generate a new one
      const finalSessionId = sessionId || uuidv4();

      // Check if session already exists
      const existingSession = await sessionStore.get(finalSessionId);
      
      if (existingSession) {
        const metadata = existingSession.state as SessionMetadata;
        // Session already exists, return it
        return NextResponse.json({
          sessionId: finalSessionId,
          exists: true,
          created: metadata?.created || null,
          lastActivity: metadata?.lastActivity || null,
          documentCount: metadata?.documentCount || 0
        });
      }

      // Initialize session metadata
      const sessionMetadata: SessionMetadata = {
        sessionId: finalSessionId,
        created: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        documentCount: 0
      };

      // Save initial session data to JsonSessionStore
      // Note: SessionStore.save() expects Omit<SessionData, 'id'> so we don't include id
      await sessionStore.save(finalSessionId, {
        state: sessionMetadata,
        threads: {} // Initialize empty threads object for chat conversations
      });

      console.log(`[Session Management] Created new session: ${finalSessionId}`);

      return NextResponse.json({
        sessionId: finalSessionId,
        exists: false,
        created: sessionMetadata.created,
        lastActivity: sessionMetadata.lastActivity,
        documentCount: 0
      });

    } catch (error) {
      console.error('Error creating session:', error);
      return NextResponse.json(
        {
          error: 'Failed to create session',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  });
}

export async function PUT(req: NextRequest) {
  return withGenkitServer(async () => {
    try {
      const body = await req.json();
      const { sessionId, metadata } = body;

      if (!sessionId) {
        return NextResponse.json(
          { error: 'Session ID is required' },
          { status: 400 }
        );
      }

      // Get existing session data
      const existingSession = await sessionStore.get(sessionId);
      
      if (!existingSession) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      const currentMetadata = existingSession.state as SessionMetadata;

      // Update session metadata
      const updatedMetadata: SessionMetadata = {
        ...currentMetadata,
        ...metadata,
        lastActivity: new Date().toISOString()
      };

      // Create updated session data without the id field (SessionStore expects Omit<SessionData, 'id'>)
      const updatedSessionDataWithoutId = {
        state: updatedMetadata,
        threads: existingSession.threads || {}
      };

      await sessionStore.save(sessionId, updatedSessionDataWithoutId);

      console.log(`[Session Management] Updated session: ${sessionId}`);

      return NextResponse.json({
        sessionId,
        success: true,
        lastActivity: updatedMetadata.lastActivity,
        documentCount: updatedMetadata.documentCount
      });

    } catch (error) {
      console.error('Error updating session:', error);
      return NextResponse.json(
        {
          error: 'Failed to update session',
          details: error instanceof Error ? error.message : String(error)
        },
        { status: 500 }
      );
    }
  });
}