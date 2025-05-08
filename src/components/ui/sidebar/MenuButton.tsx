import React from 'react';

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  (props, ref) => {
    return <button ref={ref} {...props}>MenuButtonContent</button>;
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

const sidebarMenuButtonVariants = {}; // Empty object for now

export { SidebarMenuButton, sidebarMenuButtonVariants };

export type SidebarMenuButtonVariantProps = {}; // Empty type for now