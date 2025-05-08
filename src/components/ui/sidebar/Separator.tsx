import React from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator'; // Assuming Separator is from shadcn/ui

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)} // Styles specific to sidebar usage
      {...props}
    />
  );
});
SidebarSeparator.displayName = "SidebarSeparator";

export { SidebarSeparator }; // Use named export