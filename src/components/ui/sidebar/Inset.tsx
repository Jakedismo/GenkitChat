import React from "react";
import { cn } from "@/lib/utils";

const SidebarInset = React.forwardRef<
  HTMLDivElement, // Changed from HTMLButtonElement as it renders <main>
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      data-sidebar="inset" // Added data attribute for consistency
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        // Styling related to peer sidebar state and variant
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className,
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";

export { SidebarInset }; // Use named export
