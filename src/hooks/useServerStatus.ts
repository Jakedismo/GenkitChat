import { useToast } from "@/hooks/use-toast";
import { ConnectedServer, DisplayTool } from "@/types/chat";
import { useEffect, useState } from "react";

export function useServerStatus(
  setContext7ResolveLibraryIdEnabled: (value: boolean) => void,
  setContext7GetLibraryDocsEnabled: (value: boolean) => void
) {
  const [connectedServers, setConnectedServers] = useState<ConnectedServer[]>(
    []
  );
  const { toast } = useToast();

  useEffect(() => {
    const fetchToolInfo = async () => {
      const initialServers: ConnectedServer[] = [
        { name: "context7", status: "Pending", tools: [] },
      ];
      setConnectedServers(initialServers);

      try {
        const response = await fetch("/api/tools");
        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }
        const fetchedTools: DisplayTool[] = await response.json();
        setConnectedServers((prev) =>
          prev.map((s) =>
            s.name === "context7"
              ? { ...s, status: "Connected", tools: fetchedTools }
              : s
          )
        );

        if (fetchedTools.length > 0) {
          setContext7ResolveLibraryIdEnabled(true);
          setContext7GetLibraryDocsEnabled(true);
        }
      } catch (error) {
        console.error("Failed to fetch tool info:", error);
        toast({
          title: "Error",
          description:
            "Could not fetch tool information from connected servers.",
          variant: "destructive",
        });
        setConnectedServers((prev) =>
          prev.map((s) =>
            s.name === "context7" ? { ...s, status: "Error" } : s
          )
        );
      }
    };

    fetchToolInfo();
  }, [
    toast,
    setContext7GetLibraryDocsEnabled,
    setContext7ResolveLibraryIdEnabled,
  ]);

  return connectedServers;
}