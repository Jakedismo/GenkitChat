import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HighlightManager, HighlightStyle } from "@/utils/highlightManager";
import { Check, ChevronLeft, ChevronRight, List, Palette } from "lucide-react";
import React from "react";

interface HighlightControlPanelProps {
  highlightManager: HighlightManager;
  onNavigate?: (highlightId: string) => void;
  className?: string;
}

interface ColorButtonProps {
  color: string;
  styleId: string;
  activeStyleId: string | undefined;
  onClick: (styleId: string) => void;
}

const ColorButton: React.FC<ColorButtonProps> = ({ color, styleId, activeStyleId, onClick }) => {
  const isActive = activeStyleId === styleId;
  
  return (
    <button
      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'ring-2 ring-offset-2 ring-black dark:ring-white' : 'hover:scale-110'}`}
      style={{ backgroundColor: color }}
      onClick={() => onClick(styleId)}
      title={`${styleId} highlight`}
    >
      {isActive && <Check className="h-4 w-4 text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]" />}
    </button>
  );
};

const HighlightControlPanel: React.FC<HighlightControlPanelProps> = ({
  highlightManager,
  onNavigate,
  className = "",
}) => {
  const [activeIndex, setActiveIndex] = React.useState<number>(0);
  const [totalHighlights, setTotalHighlights] = React.useState<number>(0);
  const [activeHighlightId, setActiveHighlightId] = React.useState<string | undefined>(undefined);
  const [activeStyleId, setActiveStyleId] = React.useState<string | undefined>(undefined);
  const [availableStyles, setAvailableStyles] = React.useState<Record<string, HighlightStyle>>({});

  React.useEffect(() => {
    if (!highlightManager) return;
    
    // Update total count
    setTotalHighlights(highlightManager.getHighlightCount());
    
    // Get active highlight index and style
    const activeId = highlightManager.getActiveHighlightId();
    if (activeId) {
      setActiveHighlightId(activeId);
      const index = highlightManager.getHighlightIndex(activeId);
      if (index !== -1) {
        setActiveIndex(index);
      }
      
      // Get current style
      const highlight = highlightManager.getHighlightById(activeId);
      if (highlight) {
        setActiveStyleId(highlight.styleId || 'default');
      }
    }
    
    // Get available styles
    const styles: Record<string, HighlightStyle> = {};
    highlightManager.getAllStyleIds().forEach(id => {
      const highlight = { id: 'temp', pageNumber: 1, rects: [], styleId: id };
      styles[id] = highlightManager.getHighlightStyle(highlight);
    });
    setAvailableStyles(styles);
    
    // Subscribe to highlight changes
    const handleHighlightsChanged = () => {
      setTotalHighlights(highlightManager.getHighlightCount());
      const newActiveId = highlightManager.getActiveHighlightId();
      if (newActiveId) {
        setActiveHighlightId(newActiveId);
        const newIndex = highlightManager.getHighlightIndex(newActiveId);
        if (newIndex !== -1) {
          setActiveIndex(newIndex);
        }
        
        // Get current style
        const highlight = highlightManager.getHighlightById(newActiveId);
        if (highlight) {
          setActiveStyleId(highlight.styleId || 'default');
        }
      }
    };
    
    highlightManager.on("highlightsChanged", handleHighlightsChanged);
    
    return () => {
      highlightManager.off("highlightsChanged", handleHighlightsChanged);
    };
  }, [highlightManager]);

  const navigateToPrevious = () => {
    if (!highlightManager || totalHighlights <= 1) return;
    
    const prevId = highlightManager.getPreviousHighlightId();
    if (prevId) {
      highlightManager.setActiveHighlight(prevId);
      if (onNavigate) onNavigate(prevId);
    }
  };

  const navigateToNext = () => {
    if (!highlightManager || totalHighlights <= 1) return;
    
    const nextId = highlightManager.getNextHighlightId();
    if (nextId) {
      highlightManager.setActiveHighlight(nextId);
      if (onNavigate) onNavigate(nextId);
    }
  };

  const handleColorChange = (styleId: string) => {
    if (!activeHighlightId || !highlightManager) return;
    highlightManager.setHighlightStyleById(activeHighlightId, styleId);
  };
  
  if (totalHighlights <= 0) return null;

  return (
    <div className={`flex items-center justify-between p-2 border-t ${className}`}>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={navigateToPrevious}
          disabled={totalHighlights <= 1}
          title="Previous highlight"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <span className="text-xs text-gray-500">
          {totalHighlights > 0 ? `${activeIndex + 1}/${totalHighlights}` : "No highlights"}
        </span>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={navigateToNext}
          disabled={totalHighlights <= 1}
          title="Next highlight"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2"
              title="Change highlight color"
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="end">
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(availableStyles).map(([styleId, style]) => (
                <ColorButton
                  key={styleId}
                  styleId={styleId}
                  color={style.backgroundColor}
                  activeStyleId={activeStyleId}
                  onClick={handleColorChange}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          title="Highlight list"
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default HighlightControlPanel;