import React from 'react';
import { cn } from '@/lib/utils';

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        // Base styles for the content area
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto",
        // Hide overflow when collapsed to icon mode to prevent scrollbars showing prematurely
        "group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  );
});
SidebarContent.displayName = "SidebarContent";

export { SidebarContent }; // Use named export