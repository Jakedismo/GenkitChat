import { NextResponse } from "next/server";

// Define the structure the UI expects
interface DisplayTool {
  name: string;
  description: string;
  source?: string;
}

// NOTE: Dynamically listing tools proved problematic.
// Returning a hardcoded list for known configured servers (context7).

export async function GET() {
  console.log("GET /api/tools called");
  try {
    // Hardcoded tools for the context7 server
    const tools: DisplayTool[] = [
      {
        name: "context7/resolve-library-id",
        description:
          "Resolves a general library name into a Context7-compatible library ID.",
        source: "context7",
      },
      {
        name: "context7/get-library-docs",
        description:
          "Fetches documentation for a library using a Context7-compatible library ID.",
        source: "context7",
      },
    ];

    console.log("Returning hardcoded tools:", JSON.stringify(tools));
    return NextResponse.json(tools);
  } catch (error) {
    console.error("Error in /api/tools route:", error);
    // Still return JSON error on failure
    return NextResponse.json(
      { error: "Failed to retrieve tool information" },
      { status: 500 }
    );
  }
}
