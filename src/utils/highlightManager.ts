// src/utils/highlightManager.ts
import { EventEmitter } from 'events';

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HighlightCoordinates {
  id: string; // Unique ID for the highlight
  pageNumber: number;
  rects: BoundingBox[];
  text?: string; // Optional text content of the highlight
  metadata?: Record<string, any>; // Optional metadata/notes (e.g., notes, citation link)
  styleId?: string; // Optional: to link to a specific style in highlightStyles
}

export interface HighlightStyle {
  backgroundColor: string;
  color?: string; // Text color, if applicable
  opacity?: number;
  // other style properties like border, etc.
}

export interface MultiHighlightManager {
  highlights: HighlightCoordinates[];
  activeHighlightId?: string; // Changed from activeHighlight to activeHighlightId for clarity
  highlightStyles: Record<string, HighlightStyle>; // Maps styleId to HighlightStyle

  addHighlight(coordinates: HighlightCoordinates, styleId?: string): string; // Returns the ID of the added highlight
  removeHighlight(id: string): void;
  updateHighlight(id: string, updates: Partial<HighlightCoordinates>): void;
  setActiveHighlight(id?: string): void; // Allow unsetting active highlight
  getActiveHighlight(): HighlightCoordinates | undefined;
  getHighlightById(id: string): HighlightCoordinates | undefined;
  setHighlightStyle(styleId: string, style: HighlightStyle): void;
  getHighlightStyle(highlight: HighlightCoordinates): HighlightStyle;
  navigateToHighlight(direction: 'next' | 'previous'): HighlightCoordinates | undefined;
  exportHighlights(): string; // JSON format
  importHighlights(jsonData: string): void;
}

export class HighlightManager extends EventEmitter implements MultiHighlightManager {
  highlights: HighlightCoordinates[] = [];
  activeHighlightId?: string;
  highlightStyles: Record<string, HighlightStyle> = {
    default: { backgroundColor: 'yellow', opacity: 0.3 },
    red: { backgroundColor: '#ffcdd2', opacity: 0.4 },
    green: { backgroundColor: '#c8e6c9', opacity: 0.4 },
    blue: { backgroundColor: '#bbdefb', opacity: 0.4 },
    purple: { backgroundColor: '#e1bee7', opacity: 0.4 },
    orange: { backgroundColor: '#ffe0b2', opacity: 0.4 },
  };
  
  constructor() {
    super();
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  addHighlight(coordinates: Omit<HighlightCoordinates, 'id'>, styleId: string = 'default'): string {
    const id = this.generateId(); // Always generate a new ID
    const newHighlight: HighlightCoordinates = { ...coordinates, id, styleId };
    this.highlights.push(newHighlight);
    this.emit('highlightsChanged');
    return id;
  }

  removeHighlight(id: string): void {
    this.highlights = this.highlights.filter(h => h.id !== id);
    if (this.activeHighlightId === id) {
      this.activeHighlightId = undefined;
    }
    this.emit('highlightsChanged');
  }

  updateHighlight(id: string, updates: Partial<HighlightCoordinates>): void {
    const index = this.highlights.findIndex(h => h.id === id);
    if (index !== -1) {
      this.highlights[index] = { ...this.highlights[index], ...updates };
      this.emit('highlightsChanged');
    }
  }

  setActiveHighlight(id?: string): void {
    if (id && !this.highlights.find(h => h.id === id)) {
        console.warn(`Highlight with id ${id} not found.`);
        this.activeHighlightId = undefined;
        return;
    }
    this.activeHighlightId = id;
    this.emit('highlightsChanged');
  }

  getActiveHighlight(): HighlightCoordinates | undefined {
    return this.highlights.find(h => h.id === this.activeHighlightId);
  }

  getHighlightById(id: string): HighlightCoordinates | undefined {
    return this.highlights.find(h => h.id === id);
  }
  
  setHighlightStyle(styleId: string, style: HighlightStyle): void {
    this.highlightStyles[styleId] = style;
  }

  getHighlightStyle(highlight: HighlightCoordinates): HighlightStyle {
    return this.highlightStyles[highlight.styleId || 'default'] || this.highlightStyles.default;
  }
  
  getAllStyleIds(): string[] {
    return Object.keys(this.highlightStyles);
  }
  
  setHighlightStyleById(highlightId: string, styleId: string): void {
    if (!this.highlightStyles[styleId]) {
      console.warn(`Style with id ${styleId} not found, using default`);
      styleId = 'default';
    }
    
    const index = this.highlights.findIndex(h => h.id === highlightId);
    if (index !== -1) {
      this.highlights[index].styleId = styleId;
      this.emit('highlightsChanged');
    }
  }

  navigateToHighlight(direction: 'next' | 'previous'): HighlightCoordinates | undefined {
    if (this.highlights.length === 0) return undefined;

    const currentIndex = this.activeHighlightId
      ? this.highlights.findIndex(h => h.id === this.activeHighlightId)
      : -1;

    let nextIndex: number;

    if (direction === 'next') {
      nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % this.highlights.length;
    } else { // previous
      if (currentIndex === -1 || currentIndex === 0) {
        nextIndex = this.highlights.length - 1;
      } else {
        nextIndex = currentIndex - 1;
      }
    }
    
    this.setActiveHighlight(this.highlights[nextIndex].id);
    return this.highlights[nextIndex];
  }

  exportHighlights(): string {
    return JSON.stringify({
        highlights: this.highlights,
        activeHighlightId: this.activeHighlightId,
        highlightStyles: this.highlightStyles,
    });
  }

  importHighlights(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      this.highlights = data.highlights || [];
      this.activeHighlightId = data.activeHighlightId;
      this.highlightStyles = data.highlightStyles || { default: { backgroundColor: 'yellow', opacity: 0.3 }};
      this.emit('highlightsChanged');
    } catch (error) {
      console.error("Failed to import highlights:", error);
    }
  }

  // Additional methods for HighlightControlPanel
  getHighlightCount(): number {
    return this.highlights.length;
  }

  getActiveHighlightId(): string | undefined {
    return this.activeHighlightId;
  }

  getHighlightIndex(id: string): number {
    return this.highlights.findIndex(h => h.id === id);
  }

  getPreviousHighlightId(): string | undefined {
    if (this.highlights.length === 0) return undefined;

    const currentIndex = this.activeHighlightId
      ? this.highlights.findIndex(h => h.id === this.activeHighlightId)
      : -1;

    if (currentIndex === -1 || currentIndex === 0) {
      return this.highlights[this.highlights.length - 1].id;
    }
    
    return this.highlights[currentIndex - 1].id;
  }

  getNextHighlightId(): string | undefined {
    if (this.highlights.length === 0) return undefined;

    const currentIndex = this.activeHighlightId
      ? this.highlights.findIndex(h => h.id === this.activeHighlightId)
      : -1;

    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + 1) % this.highlights.length;
    
    return this.highlights[nextIndex].id;
  }
}