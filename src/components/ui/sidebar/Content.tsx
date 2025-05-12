import React from 'react';
import { cn } from '@/lib/utils';
import { useSidebar } from './context';

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        // Base styles for the content area
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto",
        // Hide overflow when collapsed to icon mode to prevent scrollbars showing prematurely
        "group-data-[collapsible=icon]:overflow-hidden",
        // Transition effects for smoother collapse/expand
        "transition-opacity duration-300 ease-in-out",
        // When collapsed, fade out content slightly but keep it visible
        isCollapsed && "opacity-0 md:opacity-0",
        className
      )}
      {...props}
    />
  );
});
SidebarContent.displayName = "SidebarContent";

export { SidebarContent };