import { PdfTextMapper } from '../pdfTextMapper';

// Mock PDF.js types for testing
const mockTextItem = {
  str: 'Hello world test document',
  transform: [1, 0, 0, 1, 100, 200],
  width: 150,
  height: 12,
  dir: 'ltr',
  fontName: 'Arial'
};

const mockTextContent = {
  items: [
    mockTextItem,
    {
      str: 'This is another line of text',
      transform: [1, 0, 0, 1, 100, 180],
      width: 200,
      height: 12,
      dir: 'ltr',
      fontName: 'Arial'
    }
  ]
};

const mockPage = {
  pageNumber: 1,
  getTextContent: jest.fn().mockResolvedValue(mockTextContent),
  getViewport: jest.fn().mockReturnValue({ width: 800, height: 600 })
} as any;

const mockPdfDocument = {
  numPages: 1,
  getPage: jest.fn().mockResolvedValue(mockPage)
} as any;

describe('PdfTextMapper', () => {
  let textMapper: PdfTextMapper;

  beforeEach(() => {
    textMapper = new PdfTextMapper({
      fuzzyThreshold: 0.8,
      maxResultsPerPage: 5,
      enablePerformanceLogging: false, // Disable for tests
      minConfidenceThreshold: 0.5
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultMapper = new PdfTextMapper();
      expect(defaultMapper).toBeInstanceOf(PdfTextMapper);
    });

    it('should accept custom configuration', () => {
      const customMapper = new PdfTextMapper({
        fuzzyThreshold: 0.9,
        maxResultsPerPage: 10
      });
      expect(customMapper).toBeInstanceOf(PdfTextMapper);
    });
  });

  describe('findTextCoordinates', () => {
    it('should find exact text matches', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world'
      );

      expect(results).toHaveLength(1);
      expect(results[0].pageNumber).toBe(1);
      expect(results[0].confidence).toBe(1.0);
      expect(results[0].matchedText).toBe('Hello world');
      expect(results[0].coordinates).toHaveLength(1);
    });

    it('should search specific page when pageNumber provided', async () => {
      await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world',
        1
      );

      expect(mockPdfDocument.getPage).toHaveBeenCalledWith(1);
      expect(mockPdfDocument.getPage).toHaveBeenCalledTimes(1);
    });

    it('should handle empty search text gracefully', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        ''
      );

      expect(results).toHaveLength(0);
    });

    it('should handle PDF document errors gracefully', async () => {
      const errorDocument = {
        numPages: 1,
        getPage: jest.fn().mockRejectedValue(new Error('PDF error'))
      } as any;

      const results = await textMapper.findTextCoordinates(
        errorDocument,
        'test'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('Text Normalization', () => {
    it('should normalize text for better matching', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'HELLO WORLD' // Different case
      );

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBeGreaterThan(0.8);
    });

    it('should handle extra whitespace', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello   world' // Extra spaces
      );

      expect(results).toHaveLength(1);
      expect(results[0].confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Search Strategies', () => {
    it('should find partial matches when exact match fails', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world extra text that does not exist'
      );

      // Should fall back to partial matching and find "Hello world"
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBeLessThan(1.0);
    });

    it('should filter results by confidence threshold', async () => {
      const highThresholdMapper = new PdfTextMapper({
        minConfidenceThreshold: 0.95
      });

      const results = await highThresholdMapper.findTextCoordinates(
        mockPdfDocument,
        'completely different text'
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('Coordinate Calculation', () => {
    it('should calculate coordinates within page bounds', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world'
      );

      expect(results).toHaveLength(1);
      const coords = results[0].coordinates[0];
      
      expect(coords.x).toBeGreaterThanOrEqual(0);
      expect(coords.y).toBeGreaterThanOrEqual(0);
      expect(coords.width).toBeGreaterThan(0);
      expect(coords.height).toBeGreaterThan(0);
    });

    it('should return valid PdfRect format', async () => {
      const results = await textMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world'
      );

      expect(results).toHaveLength(1);
      const coords = results[0].coordinates[0];
      
      expect(typeof coords.x).toBe('number');
      expect(typeof coords.y).toBe('number');
      expect(typeof coords.width).toBe('number');
      expect(typeof coords.height).toBe('number');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics when enabled', async () => {
      const performanceMapper = new PdfTextMapper({
        enablePerformanceLogging: true
      });

      await performanceMapper.findTextCoordinates(
        mockPdfDocument,
        'Hello world'
      );

      const metrics = performanceMapper.getPerformanceMetrics();
      expect(metrics).toBeInstanceOf(Map);
    });

    it('should allow clearing performance metrics', () => {
      textMapper.clearPerformanceMetrics();
      const metrics = textMapper.getPerformanceMetrics();
      expect(metrics.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle text extraction errors gracefully', async () => {
      const errorPage = {
        pageNumber: 1,
        getTextContent: jest.fn().mockRejectedValue(new Error('Text extraction failed')),
        getViewport: jest.fn().mockReturnValue({ width: 800, height: 600 })
      };

      const errorDocument = {
        numPages: 1,
        getPage: jest.fn().mockResolvedValue(errorPage)
      } as any;

      const results = await textMapper.findTextCoordinates(
        errorDocument,
        'test'
      );

      expect(results).toHaveLength(0);
    });
  });
});

describe('Default PdfTextMapper Instance', () => {
  it('should export a default configured instance', () => {
    const { defaultPdfTextMapper } = require('../pdfTextMapper');
    expect(defaultPdfTextMapper).toBeInstanceOf(PdfTextMapper);
  });
});