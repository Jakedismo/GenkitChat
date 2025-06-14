// Mock fs/promises with a simple approach
const mockReadFile = jest.fn();
const mockStat = jest.fn();

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  stat: mockStat,
}));

// Mock PDF.js
const mockTextItem = {
  str: 'Sample text from PDF document',
  transform: [1, 0, 0, 1, 100, 200],
  width: 150,
  height: 12,
  dir: 'ltr',
  fontName: 'Arial'
};

const mockTextContent = {
  items: [mockTextItem]
};

const mockPage = {
  pageNumber: 1,
  getTextContent: jest.fn().mockResolvedValue(mockTextContent),
  getViewport: jest.fn().mockReturnValue({ width: 800, height: 600, scale: 1.0 })
};

const mockPdfDocument = {
  numPages: 1,
  getPage: jest.fn().mockResolvedValue(mockPage)
};

const mockLoadingTask = {
  promise: Promise.resolve(mockPdfDocument)
};

const mockGetDocument = jest.fn().mockReturnValue(mockLoadingTask);

jest.mock('pdfjs-dist', () => ({
  getDocument: mockGetDocument
}));

// Mock PdfTextMapper
jest.mock('../pdfTextMapper', () => ({
  PdfTextMapper: jest.fn().mockImplementation(() => ({
    findTextCoordinates: jest.fn().mockResolvedValue([
      {
        pageNumber: 1,
        coordinates: [{ x: 100, y: 200, width: 150, height: 12 }],
        matchedText: 'Sample text',
        confidence: 0.95
      }
    ])
  }))
}));

// Get reference to mocked class for test manipulation
const { PdfTextMapper } = jest.requireMock('../pdfTextMapper');

// Import after mocks are set up
import { serverPdfProcessor, ServerPdfProcessor } from '../serverPdfProcessor';

describe('ServerPdfProcessor', () => {
  let processor: ServerPdfProcessor;
  const testFilePath = '/test/path/document.pdf';
  const testPdfBuffer = Buffer.from('fake-pdf-content');

  beforeEach(() => {
    processor = new ServerPdfProcessor();
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockReadFile.mockResolvedValue(testPdfBuffer);
    mockStat.mockResolvedValue({
      size: testPdfBuffer.length,
      mtime: new Date(),
      isFile: () => true,
      isDirectory: () => false
    });


    // Reset PDF.js mocks
    mockGetDocument.mockReturnValue(mockLoadingTask);
    mockPage.getTextContent.mockResolvedValue(mockTextContent);
    mockPdfDocument.getPage.mockResolvedValue(mockPage);
  });

  afterEach(() => {
    // Clear cache between tests
    const cache = (processor as any).cache;
    if (cache && typeof cache.clearCache === 'function') {
      cache.clearCache();
    }
  });

  describe('processPdf', () => {
    it('should return basic PDF response when no enhanced options are provided', async () => {
      const result = await processor.processPdf(testFilePath, {});

      expect(result.pdfBuffer).toEqual(testPdfBuffer);
      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.fileSize).toBe(testPdfBuffer.length);
      expect(result.metadata.processing.textExtracted).toBe(false);
      expect(result.metadata.processing.coordinatesPrecomputed).toBe(false);
      expect(result.textContent).toBeUndefined();
      expect(result.highlightCoordinates).toBeUndefined();
    });

    it('should extract text content when includeTextContent is true', async () => {
      const result = await processor.processPdf(testFilePath, {
        includeTextContent: true
      });

      expect(result.textContent).toBeDefined();
      expect(result.textContent).toHaveLength(1);
      expect(result.textContent![0].pageNumber).toBe(1);
      expect(result.textContent![0].textItems).toEqual([mockTextItem]);
      expect(result.metadata.processing.textExtracted).toBe(true);
    });

    it('should compute highlight coordinates when includeCoordinates and textToHighlight are provided', async () => {
      const result = await processor.processPdf(testFilePath, {
        includeCoordinates: true,
        textToHighlight: 'Sample text'
      });

      expect(result.highlightCoordinates).toBeDefined();
      expect(result.highlightCoordinates).toHaveLength(1);
      expect(result.highlightCoordinates![0].pageNumber).toBe(1);
      expect(result.highlightCoordinates![0].confidence).toBe(0.95);
      expect(result.highlightCoordinates![0].styleId).toBe('green'); // High confidence
      expect(result.metadata.processing.coordinatesPrecomputed).toBe(true);
    });

    it('should filter content by page number when specified', async () => {
      const result = await processor.processPdf(testFilePath, {
        includeTextContent: true,
        pageNumber: 1
      });

      expect(result.textContent).toBeDefined();
      expect(result.textContent).toHaveLength(1);
      expect(result.textContent![0].pageNumber).toBe(1);
    });

    it('should assign different styleId based on confidence levels', async () => {
      const confidenceLevels = [
        { confidence: 0.95, expectedStyle: 'green' },
        { confidence: 0.8, expectedStyle: 'blue' },
        { confidence: 0.6, expectedStyle: 'orange' },
        { confidence: 0.3, expectedStyle: 'red' }
      ];

      for (const { confidence, expectedStyle } of confidenceLevels) {
        // Create a new mock instance for each test iteration
        const mockInstance = new PdfTextMapper();
        (mockInstance.findTextCoordinates as jest.Mock).mockResolvedValueOnce([
          {
            pageNumber: 1,
            coordinates: [{ x: 100, y: 200, width: 150, height: 12 }],
            matchedText: 'Sample text',
            confidence
          }
        ]);

        const result = await processor.processPdf(testFilePath, {
          includeCoordinates: true,
          textToHighlight: 'Sample text'
        });

        expect(result.highlightCoordinates![0].styleId).toBe(expectedStyle);
      }
    });

    it('should handle PDF processing errors gracefully', async () => {
      // Mock PDF loading failure
      mockGetDocument.mockReturnValueOnce({
        promise: Promise.reject(new Error('PDF parsing error'))
      });

      const result = await processor.processPdf(testFilePath, {
        includeTextContent: true
      });

      expect(result.pdfBuffer).toEqual(testPdfBuffer);
      expect(result.metadata.pageCount).toBe(0);
      expect(result.metadata.processing.textExtracted).toBe(false);
      expect(result.textContent).toBeUndefined();
    });

    it('should track processing time in metadata', async () => {
      const result = await processor.processPdf(testFilePath, {
        includeTextContent: true
      });

      expect(result.metadata.processing.processingTime).toBeDefined();
      expect(typeof result.metadata.processing.processingTime).toBe('number');
      expect(result.metadata.processing.processingTime!).toBeGreaterThan(0);
    });
  });

  describe('Cache Integration', () => {
    it('should use cache for repeated requests', async () => {
      // First request
      const result1 = await processor.processPdf(testFilePath, {
        includeTextContent: true
      });

      // Second request with same parameters
      const result2 = await processor.processPdf(testFilePath, {
        includeTextContent: true
      });

      expect(result1.textContent).toEqual(result2.textContent);
      expect(result2.metadata.processing.cacheHit).toBe(true);
    });

    it('should cache highlight coordinates separately by text and page', async () => {
      // First request for specific text
      await processor.processPdf(testFilePath, {
        includeCoordinates: true,
        textToHighlight: 'Sample text',
        pageNumber: 1
      });

      // Second request for same text and page should hit cache
      const result = await processor.processPdf(testFilePath, {
        includeCoordinates: true,
        textToHighlight: 'Sample text',
        pageNumber: 1
      });

      expect(result.metadata.processing.cacheHit).toBe(true);
    });
  });
});

describe('PdfProcessingCache', () => {
  let cache: any;

  beforeEach(() => {
    // Access cache through the singleton pattern used in ServerPdfProcessor
    cache = (serverPdfProcessor as any).cache;
    cache.clearCache();
  });

  it('should store and retrieve text content', () => {
    const testKey = 'test-doc';
    const testContent = [
      {
        pageNumber: 1,
        textItems: [mockTextItem],
        width: 800,
        height: 600
      }
    ];

    cache.setTextContent(testKey, testContent);
    const result = cache.getTextContent(testKey);

    expect(result.data).toEqual(testContent);
    expect(result.cacheHit).toBe(true);
  });

  it('should store and retrieve highlight coordinates', () => {
    const testKey = 'test-doc';
    const testText = 'test text';
    const testCoordinates = [
      {
        pageNumber: 1,
        rects: [{ x: 100, y: 200, width: 150, height: 12 }],
        textContent: 'test text',
        confidence: 0.9,
        styleId: 'green'
      }
    ];

    cache.setHighlightCoordinates(testKey, testText, testCoordinates, 1);
    const result = cache.getHighlightCoordinates(testKey, testText, 1);

    expect(result.data).toEqual(testCoordinates);
    expect(result.cacheHit).toBe(true);
  });

  it('should provide cache statistics', () => {
    const stats = cache.getCacheStats();

    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('hitCount');
    expect(stats).toHaveProperty('missCount');
    expect(stats).toHaveProperty('hitRatio');
    expect(stats).toHaveProperty('documents');
  });

  it('should clear cache for specific documents', () => {
    const testKey = 'test-doc';
    cache.setTextContent(testKey, []);

    const removed = cache.removeDocument(testKey);
    expect(removed).toBe(true);

    const result = cache.getTextContent(testKey);
    expect(result.cacheHit).toBe(false);
  });
});

describe('Singleton Export', () => {
  it('should export a configured singleton instance', () => {
    expect(serverPdfProcessor).toBeInstanceOf(ServerPdfProcessor);
  });
});