import type { HighlightCoordinates, PdfRect } from '@/types/chat'; // Import the unified type

// Re-export for use by other modules importing from here, if needed, or ensure they import from types/chat.ts
export type { HighlightCoordinates, PdfRect };


// Defines the structure for cached highlight data for a specific page and text
export interface CachedHighlightData {
  data: HighlightCoordinates[]; // Use the imported type
  lastAccessed: number;
  size: number; // Estimated memory size in bytes
  pageNumber: number; // Store page number for context
  documentId: string; // Store documentId for context
  textToHighlight: string; // Store textToHighlight for context
}

// Estimate based on the more complex HighlightCoordinates structure
// pageNumber: 1 number, rects: array of PdfRect (each 4 numbers), textContent: string, confidence: 1 number
// Let's assume an average of 2 rects per highlight and average textContent length of 30 chars.
// (1 num + 2 * 4 nums + 1 num) * 8 bytes/num + 30 chars * 2 bytes/char + object overheads
// (10 nums * 8 bytes) + 60 bytes = 80 + 60 = 140 bytes. Add overhead, say 200 bytes.
const APPROX_BYTES_PER_COORDINATE_ENTRY = 200; 

export class HighlightCache {
  private cache = new Map<string, CachedHighlightData>();
  private lruOrder: string[] = []; // To track least recently used keys
  private memoryUsage = 0;
  private maxMemoryUsage: number; // Maximum cache size in bytes

  constructor(maxMemoryBytes: number = 50 * 1024 * 1024) { // Default 50MB
    this.maxMemoryUsage = maxMemoryBytes;
  }

  private generateCacheKey(documentId: string, pageNumber: number, textToHighlight: string): string {
    return `${documentId}::page-${pageNumber}::text-${textToHighlight}`;
  }

  private estimateSize(data: HighlightCoordinates[]): number {
    // Each element in 'data' is a HighlightCoordinates object
    return data.length * APPROX_BYTES_PER_COORDINATE_ENTRY;
  }
  
  private updateLru(key: string): void {
    const index = this.lruOrder.indexOf(key);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
    this.lruOrder.push(key); // Add to the end (most recently used)
  }

  private pruneCache(requiredSpace: number = 0): void {
    // Prune if memory usage exceeds maxMemoryUsage or if requiredSpace is needed
    while (this.memoryUsage + requiredSpace > this.maxMemoryUsage && this.lruOrder.length > 0) {
      const lruKey = this.lruOrder.shift(); // Get the least recently used key
      if (lruKey) {
        const cachedItem = this.cache.get(lruKey);
        if (cachedItem) {
          this.memoryUsage -= cachedItem.size;
          this.cache.delete(lruKey);
          // console.log(`Cache pruned: Removed ${lruKey}, freed ${cachedItem.size} bytes. Current usage: ${this.memoryUsage}`);
        }
      }
    }
    // If still not enough space after LRU pruning (e.g. one huge item),
    // this indicates a potential issue with maxMemoryUsage or item sizes.
    // For now, we'll rely on the loop condition.
  }

  async getOrCompute(
    documentId: string,
    pageNumber: number,
    textToHighlight: string,
    computeFn: () => Promise<HighlightCoordinates[]>
  ): Promise<HighlightCoordinates[]> {
    const key = this.generateCacheKey(documentId, pageNumber, textToHighlight);
    const cachedItem = this.cache.get(key);

    if (cachedItem) {
      cachedItem.lastAccessed = Date.now();
      this.updateLru(key);
      // console.log(`Cache hit for key: ${key}`);
      return cachedItem.data;
    }

    // console.log(`Cache miss for key: ${key}. Computing...`);
    const computedData = await computeFn();
    const dataSize = this.estimateSize(computedData);

    if (dataSize > this.maxMemoryUsage) {
      // console.warn(`Computed data for ${key} (${dataSize} bytes) exceeds max cache size (${this.maxMemoryUsage} bytes). Not caching.`);
      return computedData; // Don't cache if a single item is too large
    }

    this.pruneCache(dataSize); // Ensure space for the new item

    if (this.memoryUsage + dataSize <= this.maxMemoryUsage) {
      const newItem: CachedHighlightData = {
        data: computedData,
        lastAccessed: Date.now(),
        size: dataSize,
        pageNumber,
        documentId,
        textToHighlight,
      };
      this.cache.set(key, newItem);
      this.memoryUsage += dataSize;
      this.updateLru(key);
      // console.log(`Cached new item: ${key}, size: ${dataSize}. Current usage: ${this.memoryUsage}`);
    } else {
      // console.warn(`Not enough space to cache ${key} even after pruning. Current usage: ${this.memoryUsage}, item size: ${dataSize}`);
    }
    return computedData;
  }

  public clear(): void {
    this.cache.clear();
    this.lruOrder = [];
    this.memoryUsage = 0;
    // console.log('Cache cleared.');
  }

  public getMemoryUsage(): { usage: number; max: number; count: number } {
    return {
      usage: this.memoryUsage,
      max: this.maxMemoryUsage,
      count: this.cache.size,
    };
  }

  public getMaxMemoryUsage(): number {
    return this.maxMemoryUsage;
  }

  public getCacheEntries(): IterableIterator<[string, CachedHighlightData]> {
    return this.cache.entries();
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public remove(documentId: string, pageNumber: number, textToHighlight: string): boolean {
    const key = this.generateCacheKey(documentId, pageNumber, textToHighlight);
    const cachedItem = this.cache.get(key);
    if (cachedItem) {
      this.memoryUsage -= cachedItem.size;
      this.cache.delete(key);
      const lruIndex = this.lruOrder.indexOf(key);
      if (lruIndex > -1) {
        this.lruOrder.splice(lruIndex, 1);
      }
      // console.log(`Cache item removed: ${key}`);
      return true;
    }
    return false;
  }

  public removeDocument(documentId: string): number {
    let itemsRemoved = 0;
    const keysToRemove: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${documentId}::`)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const cachedItem = this.cache.get(key);
      if (cachedItem) {
        this.memoryUsage -= cachedItem.size;
        this.cache.delete(key);
        const lruIndex = this.lruOrder.indexOf(key);
        if (lruIndex > -1) {
          this.lruOrder.splice(lruIndex, 1);
        }
        itemsRemoved++;
      }
    }
    // if (itemsRemoved > 0) console.log(`Removed ${itemsRemoved} cache items for document: ${documentId}`);
    return itemsRemoved;
  }
}

// Global instance or provide a way to get/create one
let globalCacheInstance: HighlightCache | null = null;

export function getHighlightCacheInstance(maxMemoryBytes?: number): HighlightCache {
  if (!globalCacheInstance) {
    globalCacheInstance = new HighlightCache(maxMemoryBytes);
  }
  return globalCacheInstance;
}