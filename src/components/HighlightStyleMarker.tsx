import { HighlightCoordinates } from '@/types/chat';
import { HighlightManager } from '@/utils/highlightManager';
import React, { useEffect, useRef } from 'react';

interface HighlightStyleMarkerProps {
  highlightManager: HighlightManager;
  children: React.ReactNode;
  highlight: { originalCoord?: HighlightCoordinates };
}

/**
 * A wrapper component that adds style attributes to PDF highlights based on
 * the highlight style stored in the HighlightManager.
 */
const HighlightStyleMarker: React.FC<HighlightStyleMarkerProps> = ({
  highlightManager,
  children,
  highlight,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Find all PDF highlight elements within this component
    if (!wrapperRef.current) return;
    
    const highlightElements = wrapperRef.current.querySelectorAll('[data-pdf-highlight="true"]');
    if (!highlightElements.length) return;
    
    // Get the style ID for this highlight
    let styleId = 'default';
    const orig = highlight.originalCoord;
    
    if (orig && highlightManager) {
      // Find the matching highlight in the manager to get its style
      const allHighlights = highlightManager.highlights;
      const matched = allHighlights.find(h => 
        h.pageNumber === orig.pageNumber && 
        h.text === orig.textContent
      );
      
      if (matched && matched.styleId) {
        styleId = matched.styleId;
      }
    }
    
    // Apply the style class to all highlight elements
    highlightElements.forEach(element => {
      element.classList.add(`highlight-style-${styleId}`);
    });
  }, [highlight, highlightManager]);
  
  return (
    <div ref={wrapperRef} className="highlight-wrapper">
      {children}
    </div>
  );
};

export default HighlightStyleMarker;