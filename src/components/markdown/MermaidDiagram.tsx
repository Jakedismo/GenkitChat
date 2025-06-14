"use client";

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getCleanedMermaidChart } from '@/utils/mermaidUtils'; // Added import
import { Copy, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
  id?: string;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart, id }) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [, setMermaidInstance] = useState<unknown | null>(null);
  const [rendered, setRendered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const renderTimeoutRef = useRef<NodeJS.Timeout>();
  const { toast } = useToast();
  const { theme, resolvedTheme } = useTheme();

  // Stable ID for this diagram - only generate once
  const diagramId = useMemo(() => 
    id || `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    [id]
  );

  // Clean and validate chart content
  const cleanChart = useMemo(() => {
    return getCleanedMermaidChart(chart);
  }, [chart]);

  // Validate if chart appears to be complete Mermaid syntax
  const validateChartCompleteness = useCallback((chart: string): { isValid: boolean; error?: string } => {
    if (!chart || chart.trim().length === 0) {
      return { isValid: false, error: 'Empty chart content' };
    }

    const trimmed = chart.trim();
    
    // Check for basic Mermaid diagram types
    const mermaidKeywords = [
      'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 
      'stateDiagram', 'journey', 'gantt', 'pie', 'gitgraph',
      'erDiagram', 'timeline', 'mindmap', 'sankey', 'quadrantChart',
      'requirementDiagram', 'c4context', 'block-beta'
    ];
    
    const hasValidStart = mermaidKeywords.some(keyword => 
      trimmed.toLowerCase().startsWith(keyword.toLowerCase())
    );
    
    if (!hasValidStart) {
      return { 
        isValid: false, 
        error: `Chart must start with a valid Mermaid diagram type. Found: "${trimmed.split('\n')[0].substring(0, 50)}..."` 
      };
    }

    // Check for incomplete streaming (ends with incomplete syntax)
    const suspiciousEndings = [
      /--$/,           // Incomplete connection
      /\|\s*$/,        // Incomplete pipe
      /\(\s*$/,        // Incomplete parenthesis
      /\[\s*$/,        // Incomplete bracket
      /\{\s*$/,        // Incomplete brace
      /->\s*$/,        // Incomplete arrow
      /:\s*$/,         // Incomplete colon definition
    ];
    
    const endsIncomplete = suspiciousEndings.some(pattern => pattern.test(trimmed));
    if (endsIncomplete) {
      return { 
        isValid: false, 
        error: 'Chart appears incomplete (streaming in progress)' 
      };
    }

    // Check minimum length for reasonable diagram
    if (trimmed.length < 20) {
      return { 
        isValid: false, 
        error: 'Chart content too short to be a valid diagram' 
      };
    }

    return { isValid: true };
  }, []);

  // Debounced render function to prevent streaming interference
  const debouncedRender = useCallback(async () => {
    if (!cleanChart || cleanChart.length === 0) {
      setError('No chart content provided');
      setIsLoading(false);
      return;
    }

    // Validate chart completeness before attempting render
    const validation = validateChartCompleteness(cleanChart);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid chart content');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setRendered(false);

      // Add timeout to prevent hanging
      const renderTimeout = setTimeout(() => {
        setError('Diagram rendering timed out after 10 seconds');
        setIsLoading(false);
      }, 10000);

      // Dynamic import to handle SSR
      let mermaid;
      try {
        mermaid = (await import('mermaid')).default;
        if (!mermaid) {
          throw new Error('Mermaid library failed to load');
        }
      } catch (importError) {
        clearTimeout(renderTimeout);
        throw new Error(`Failed to import Mermaid: ${importError instanceof Error ? importError.message : 'Unknown import error'}`);
      }
      
      // Determine theme for Mermaid with better detection
      const mermaidTheme = resolvedTheme === 'dark' || theme === 'dark' ? 'dark' : 
                          resolvedTheme === 'light' || theme === 'light' ? 'default' : 
                          'default';
      
      // Initialize mermaid with comprehensive configuration
      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: 'loose',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 14,
        logLevel: 'error', // Reduce console noise
      });

      setMermaidInstance(mermaid);

      if (elementRef.current) {
        // Clear any existing content
        elementRef.current.innerHTML = '';
        
        // Validate the diagram syntax first
        try {
          const parseResult = await mermaid.parse(cleanChart);
          if (!parseResult) {
            throw new Error('Mermaid parse returned false - invalid syntax');
          }
        } catch (parseError) {
          clearTimeout(renderTimeout);
          const errorMsg = parseError instanceof Error ? parseError.message : 'Invalid diagram syntax';
          console.error('[MermaidDiagram] Parse error:', parseError);
          throw new Error(`Syntax validation failed: ${errorMsg}\n\nChart content:\n${cleanChart.substring(0, 200)}${cleanChart.length > 200 ? '...' : ''}`);
        }
        
        // Render the diagram
        try {
          const renderResult = await mermaid.render(diagramId, cleanChart);
          
          if (!renderResult || !renderResult.svg) {
            throw new Error('Mermaid render returned no SVG content');
          }
          
          const { svg } = renderResult;
          
          if (!svg || svg.trim().length === 0) {
            throw new Error('Generated SVG is empty');
          }
          
          // Only update if component is still mounted
          if (elementRef.current) {
            try {
              elementRef.current.innerHTML = svg;
              
              // Verify SVG was inserted correctly
              const svgElement = elementRef.current.querySelector('svg');
              if (!svgElement) {
                throw new Error('SVG element not found after insertion');
              }
              
              // Add responsive styling to the SVG
              svgElement.style.maxWidth = '100%';
              svgElement.style.height = 'auto';
              svgElement.style.transform = `scale(${zoom})`;
              svgElement.style.transformOrigin = 'top left';
              
              clearTimeout(renderTimeout);
              setRendered(true);
            } catch (domError) {
              clearTimeout(renderTimeout);
              throw new Error(`DOM manipulation failed: ${domError instanceof Error ? domError.message : 'Unknown DOM error'}`);
            }
          } else {
            clearTimeout(renderTimeout);
            throw new Error('Component element ref is no longer available');
          }
        } catch (renderError) {
          clearTimeout(renderTimeout);
          const errorMsg = renderError instanceof Error ? renderError.message : 'Failed to render diagram';
          console.error('[MermaidDiagram] Render error:', renderError);
          throw new Error(`Diagram rendering failed: ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error('[MermaidDiagram] Fatal rendering error:', err);
      console.error('[MermaidDiagram] Chart content that failed:', cleanChart);
      console.error('[MermaidDiagram] Diagram ID:', diagramId);
      console.error('[MermaidDiagram] Theme:', resolvedTheme);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown rendering error';
      setError(`Mermaid rendering failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [cleanChart, diagramId, zoom, resolvedTheme, validateChartCompleteness, theme]);
 
  // Hydration safety - only render on client
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    // Clear any existing timeout
    if (renderTimeoutRef.current) {
      clearTimeout(renderTimeoutRef.current);
    }

    // Debounce rendering to prevent streaming interference
    renderTimeoutRef.current = setTimeout(() => {
      debouncedRender();
    }, 500); // 500ms debounce for better stability

    // Cleanup on unmount
    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [debouncedRender, mounted]);

  const copyAsImage = async () => {
    try {
      const svgElement = elementRef.current?.querySelector('svg');
      if (!svgElement) {
        throw new Error('No diagram found to copy');
      }

      // Create a canvas to convert SVG to PNG
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not create canvas context');
      }

      // Get SVG dimensions and data
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = async () => {
        try {
          // Set canvas size to match image with higher resolution
          canvas.width = img.naturalWidth * 2;
          canvas.height = img.naturalHeight * 2;
          
          // Scale context for higher resolution
          ctx.scale(2, 2);
          
          // Set background based on current theme
          ctx.fillStyle = resolvedTheme === 'dark' ? '#0f172a' : '#ffffff';
          ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
          
          // Draw the image
          ctx.drawImage(img, 0, 0);
          
          // Convert to blob and copy to clipboard
          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                if (navigator.clipboard && window.ClipboardItem) {
                  await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                  ]);
                  toast({
                    title: "Copied!",
                    description: "Diagram copied to clipboard as image",
                  });
                } else {
                  // Fallback: download the image if clipboard API not available
                  downloadImage(blob);
                }
              } catch (clipboardError) {
                console.error('Clipboard write failed:', clipboardError);
                // Fallback: download the image
                downloadImage(blob);
              }
            }
          }, 'image/png');
        } catch (canvasError) {
          console.error('Canvas processing error:', canvasError);
          throw new Error('Failed to process image');
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        throw new Error('Failed to load SVG as image');
      };
      
      img.src = url;
    } catch (err) {
      console.error('Copy image error:', err);
      toast({
        title: "Copy Failed",
        description: err instanceof Error ? err.message : "Failed to copy diagram",
        variant: "destructive",
      });
    }
  };

  const downloadImage = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-diagram-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Downloaded",
      description: "Diagram downloaded as image file",
    });
  };

  const copyAsText = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      toast({
        title: "Copied!",
        description: "Diagram source code copied to clipboard",
      });
    } catch (err) {
      console.error('Copy text error:', err);
      toast({
        title: "Copy Failed",
        description: "Failed to copy diagram source",
        variant: "destructive",
      });
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.5));
  };

  const resetZoom = () => {
    setZoom(1);
  };

  // Prevent SSR rendering to avoid hydration errors
  if (!mounted) {
    return (
      <div className="not-prose my-4 flex items-center justify-center p-8 border border-border rounded-lg bg-card">
        <div className="flex flex-col items-center space-y-2">
          <span className="text-sm text-muted-foreground">Loading diagram...</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="not-prose my-4 flex items-center justify-center p-8 border border-border rounded-lg bg-card">
        <div className="flex flex-col items-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="text-sm text-muted-foreground">Rendering Mermaid diagram...</span>
          {cleanChart.length > 0 && (
            <span className="text-xs text-muted-foreground max-w-xs truncate">
              {cleanChart.split('\n')[0].substring(0, 50)}{cleanChart.split('\n')[0].length > 50 ? '...' : ''}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="not-prose my-4 border border-destructive/50 rounded-lg bg-destructive/10">
        <div className="p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-5 h-5 text-destructive">⚠️</div>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-destructive">
                Mermaid Diagram Error
              </h3>
              <p className="mt-1 text-sm text-destructive/80 whitespace-pre-wrap">{error}</p>
              
              {/* Fallback text representation */}
              <div className="mt-3 p-3 bg-muted/50 rounded border">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">
                  Fallback: Plain Text Representation
                </h4>
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                  {cleanChart}
                </pre>
              </div>
              
              {/* Debugging information */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-destructive/70 hover:text-destructive">
                  Show debugging information
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="text-xs">
                    <span className="font-medium">Chart length:</span> {cleanChart.length} characters
                  </div>
                  <div className="text-xs">
                    <span className="font-medium">Diagram ID:</span> {diagramId}
                  </div>
                  <div className="text-xs">
                    <span className="font-medium">Theme:</span> {resolvedTheme}
                  </div>
                  <pre className="text-xs bg-muted/30 p-2 rounded border overflow-auto max-h-32">
{cleanChart}
                  </pre>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose my-4 relative group border border-border rounded-lg overflow-hidden bg-card">
      {/* Control buttons */}
      <div className="absolute top-2 right-2 z-10 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button
          size="sm"
          variant="outline"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          className="h-8 w-8 p-0 bg-card/90 backdrop-blur-sm"
          title="Zoom out"
        >
          <ZoomOut className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={resetZoom}
          className="h-8 px-2 bg-card/90 backdrop-blur-sm text-xs"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          className="h-8 w-8 p-0 bg-card/90 backdrop-blur-sm"
          title="Zoom in"
        >
          <ZoomIn className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copyAsText}
          className="h-8 w-8 p-0 bg-card/90 backdrop-blur-sm"
          title="Copy source code"
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copyAsImage}
          className="h-8 w-8 p-0 bg-card/90 backdrop-blur-sm"
          title="Copy as image"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>

      {/* Diagram container */}
      <div 
        className="p-4 overflow-auto max-h-[600px]"
        style={{ 
          transformOrigin: 'top left',
        }}
      >
        <div 
          ref={elementRef} 
          data-testid="mermaid-diagram-container" // Added data-testid
          className="mermaid-container"
          style={{ 
            minHeight: rendered ? 'auto' : '200px',
            display: 'flex',
            alignItems: rendered ? 'flex-start' : 'center',
            justifyContent: rendered ? 'flex-start' : 'center'
          }}
        >
          {!rendered && !error && !isLoading && (
            <div className="text-muted-foreground text-sm">
              Preparing diagram...
            </div>
          )}
        </div>
      </div>

      {/* Source code toggle (bottom) */}
      <div className="border-t border-border">
        <details>
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
            View source code
          </summary>
          <div className="px-4 pb-4">
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32 border">
              <code>{cleanChart}</code>
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
};

export default MermaidDiagram;