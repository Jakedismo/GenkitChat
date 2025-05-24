import { NextResponse } from 'next/server';
import { getRagEndpoints } from '@/services/rag';
import '@/lib/genkit-instance'; // Ensure Genkit is initialized

export async function GET() {
  try {
    // Ensure Genkit and required services are initialized before calling
    // This might involve awaiting an initialization promise if your setup requires it.
    // For now, we assume '@/lib/genkit-instance' handles synchronous or awaited init.

    const [ragEndpoints] = await Promise.all([
      getRagEndpoints(),
    ]);

    return NextResponse.json({
      ragEndpoints,
    });
  } catch (error: unknown) {
    console.error('Error fetching services config:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch service configurations', details: message },
      { status: 500 }
    );
  }
}

// Optional: Handle potential OPTIONS requests for CORS if needed, though unlikely for same-origin API routes.
// export async function OPTIONS() {
//   return new NextResponse(null, { status: 204 });
// }

// Ensure this route is not statically generated
export const dynamic = 'force-dynamic';
