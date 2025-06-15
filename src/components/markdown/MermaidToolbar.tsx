"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Copy, Download, ZoomIn, ZoomOut } from "lucide-react";
import React from "react";

interface MermaidToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onCopyText: () => void;
  onCopyImage: () => void;
}

const MermaidToolbar: React.FC<MermaidToolbarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onCopyText,
  onCopyImage,
}) => {
  return (
    <div className="absolute top-2 right-2 z-10 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <button
        onClick={onZoomOut}
        disabled={zoom <= 0.5}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 w-8 p-0 bg-card/90 backdrop-blur-sm")}
        title="Zoom out"
      >
        <ZoomOut className="h-3 w-3" />
      </button>
      <button
        onClick={onResetZoom}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 px-2 bg-card/90 backdrop-blur-sm text-xs")}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        disabled={zoom >= 3}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 w-8 p-0 bg-card/90 backdrop-blur-sm")}
        title="Zoom in"
      >
        <ZoomIn className="h-3 w-3" />
      </button>
      <button
        onClick={onCopyText}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 w-8 p-0 bg-card/90 backdrop-blur-sm")}
        title="Copy source code"
      >
        <Copy className="h-3 w-3" />
      </button>
      <button
        onClick={onCopyImage}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8 w-8 p-0 bg-card/90 backdrop-blur-sm")}
        title="Copy as image"
      >
        <Download className="h-3 w-3" />
      </button>
    </div>
  );
};

export default MermaidToolbar;