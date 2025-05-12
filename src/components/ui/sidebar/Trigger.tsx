import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebar } from './context'; // Relative import
import { PanelLeft, PanelRight } from 'lucide-react';

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      // Position button to be always visible
      className={cn(
        "h-7 w-7 fixed left-3 top-3 z-50",
        isCollapsed && !isMobile && "md:left-3",
        !isCollapsed && !isMobile && "md:left-3 md:relative",
        isMobile && "left-3",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      {isCollapsed ? (
        <PanelRight className="h-4 w-4" />
      ) : (
        <PanelLeft className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

export { SidebarTrigger }; // Named export