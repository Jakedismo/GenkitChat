import React from 'react';
import { cn } from '@/lib/utils';
import { useSidebar } from './context'; // Use relative import for context hook
import { Sheet, SheetContent } from '@/components/ui/sheet'; // Assuming Sheet is from shadcn/ui

// Constants used specifically by the Sidebar component
// Note: --sidebar-width and --sidebar-width-icon are expected to be defined
// via CSS variables in the parent scope (e.g., in Provider.tsx style prop)
const SIDEBAR_WIDTH_MOBILE = "320px";

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === "none") {
      return (
        <div
          // Note: Uses CSS variable --sidebar-width set by Provider
          className={cn(
            "flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
        return (
          <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
            <SheetContent
              data-sidebar="sidebar"
              data-mobile="true"
              className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground"
              style={
                {
                  "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
                } as React.CSSProperties
              }
              side={side}
            >
              <div className="flex h-full w-full flex-col">{children}</div>
            </SheetContent>
          </Sheet>
        );
      }

    return (
      <div
        ref={ref}
        className="group peer md:block text-sidebar-foreground"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop */}
        {/* Note: Uses CSS variables --sidebar-width and --sidebar-width-icon set by Provider */}
        <div
          className={cn(
            "duration-300 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-in-out",
            "group-data-[collapsible=offcanvas]:w-[--sidebar-width-icon]", // Always keep minimal width
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]" // PENDING: Verify calculation
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
          )}
        />
        <div
          className={cn(
            "duration-300 fixed inset-y-0 z-20 h-svh w-[--sidebar-width] transition-all ease-in-out flex",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-0 group-data-[collapsible=offcanvas]:w-[--sidebar-width-icon]"
              : "right-0 group-data-[collapsible=offcanvas]:right-0 group-data-[collapsible=offcanvas]:w-[--sidebar-width-icon]",
            // Adjust the padding for floating and inset variants.
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]" // PENDING: Verify calculation
              : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l shadow-md",
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow overflow-hidden"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

export { Sidebar }; // Use named export