import { HighlightCoordinates, PdfRect } from '../types/chat';

interface ChunkPosition {
  startPageNumber: number;
  endPageNumber: number;
  startPosition: { x: number, y: number }; // Top-left of the chunk's bounding box
  endPosition: { x: number, y: number };   // Bottom-right of the chunk's bounding box
}

/**
 * Converts a general chunk position (bounding box) into an array of HighlightCoordinates.
 * This is used to provide a highlightable representation of the chunk's overall position.
 * @param position The chunk's general position metadata.
 * @param chunkText The text content of the chunk.
 * @returns An array of HighlightCoordinates, or undefined if position is invalid.
 */
export function convertChunkPositionToHighlightCoordinates(
  position: ChunkPosition | undefined,
  chunkText: string
): HighlightCoordinates[] | undefined {
  if (!position) {
    return undefined;
  }

  const rect: PdfRect = {
    x: position.startPosition.x,
    y: position.endPosition.y, // In PDF coords, Y is often from bottom, so endPosition.y is lower.
    width: position.endPosition.x - position.startPosition.x,
    height: position.startPosition.y - position.endPosition.y, // Assuming startPosition.y is "higher" (top)
  };

  // Ensure width and height are positive
  if (rect.width <= 0 || rect.height <= 0) {
    console.warn('Calculated invalid rect from chunk position:', position, rect);
    return undefined;
  }

  return [{
    pageNumber: position.startPageNumber,
    rects: [rect],
    textContent: chunkText, // The text content this bounding box refers to
    confidence: 1.0, // Confidence is high as this is a direct conversion of a derived position
  }];
}