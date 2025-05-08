import React from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
// Assuming SidebarGroup and SidebarGroupLabel are correctly exported from your main sidebar component.
// If not, you might need to replace them with appropriate JSX or ensure they are exported.
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar/index'; // Explicitly point to index
import { Server } from 'lucide-react';
import { ConnectedServer } from '@/types/chat'; // Import shared types

// Local type definitions removed, using shared types now.

interface ServerStatusDisplayProps {
  connectedServers: ConnectedServer[];
}

const ServerStatusDisplay: React.FC<ServerStatusDisplayProps> = ({
  connectedServers,
}) => {
  return (
    <SidebarGroup> {/* If SidebarGroup is not exported from @/components/ui/sidebar, you might need to use a <div> and style manually */}
      <SidebarGroupLabel>Connected Servers</SidebarGroupLabel> {/* Same as above for SidebarGroupLabel, might use <h3> */}
      <Separator />
      <div className="p-2 space-y-2">
        {connectedServers.map(server => (
          <div key={server.name} className="text-sm">
            <div className="flex items-center space-x-2 mb-1">
               <Server size={16} />
               <span className="font-medium">{server.name}</span>
               <span className={cn(
                 "text-xs px-1.5 py-0.5 rounded",
                 server.status === 'Connected' && 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-300',
                 server.status === 'Error' && 'bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-300',
                 server.status === 'Pending' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-300'
               )}>{server.status}</span>
            </div>
            {server.status === 'Connected' && (
              <ul className="list-disc list-inside pl-4 text-xs text-muted-foreground space-y-1">
                {server.tools.length > 0 ? (
                  server.tools.map(tool => (
                    <li key={tool.name} title={tool.description}>{tool.name}</li>
                  ))
                ) : (
                  <li>No tools listed for this server.</li>
                )}
              </ul>
            )}
          </div>
        ))}
        {connectedServers.length === 0 && (
          <p className="text-xs text-muted-foreground p-2">No MCP servers configured.</p>
        )}
      </div>
    </SidebarGroup>
  );
};

export default ServerStatusDisplay;
