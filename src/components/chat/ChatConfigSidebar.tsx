import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import React from "react";
// Assuming SidebarGroup and SidebarGroupLabel are correctly exported from your main sidebar component via index.ts
import { SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar";
import { BrainCircuit, Sparkles } from "lucide-react";
// Import shared types
import { ChatMode, ModelInfo, TemperaturePreset } from "@/types/chat";

interface ChatConfigSidebarProps {
  chatMode: ChatMode;
  onChatModeChange: (value: ChatMode) => void;
  selectedGeminiModelId: string;
  onSelectedGeminiModelIdChange: (value: string) => void;
  availableGeminiModels: ModelInfo[];
  selectedOpenAIModelId: string;
  onSelectedOpenAIModelIdChange: (value: string) => void;
  availableOpenAIModels: ModelInfo[];
  temperaturePreset: TemperaturePreset;
  onTemperaturePresetChange: (value: TemperaturePreset) => void;
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
}

const ChatConfigSidebar: React.FC<ChatConfigSidebarProps> = ({
  chatMode,
  onChatModeChange,
  selectedGeminiModelId,
  onSelectedGeminiModelIdChange,
  availableGeminiModels,
  selectedOpenAIModelId,
  onSelectedOpenAIModelIdChange,
  availableOpenAIModels,
  temperaturePreset,
  onTemperaturePresetChange,
  maxTokens,
  onMaxTokensChange,
}) => {
  return (
    <SidebarGroup>
      {" "}
      {/* Uses imported SidebarGroup */}
      <SidebarGroupLabel>Chat Configuration</SidebarGroupLabel>
      <Separator className="my-2" /> {/* Added margin to separator */}
      <div className="p-2 space-y-0"> {/* Removed space-y-4, will be handled by section divs */}
        {/* Model Settings Section */}
        <div className="space-y-3 mb-4 pb-4 border-b">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Model Settings</h4>
          <div>
            <Label htmlFor="chatMode" className="mb-1 block">Chat Mode</Label>
            <Select
              value={chatMode}
              onValueChange={(value) => onChatModeChange(value as ChatMode)}
              name="chatMode" // Added name for Label htmlFor
              id="chatMode"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Chat Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ChatMode.DIRECT_GEMINI}>
                  Direct (Gemini)
                </SelectItem>
                <SelectItem value={ChatMode.DIRECT_OPENAI}>
                  Direct (OpenAI)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div
            className={cn(
              chatMode !== ChatMode.DIRECT_GEMINI &&
                "opacity-50 cursor-not-allowed",
            )}
          >
            <Label htmlFor="geminiModel" className="mb-1 block">
              <Sparkles size={14} className="inline mr-1" /> Gemini Model
            </Label>
            <Select
              value={selectedGeminiModelId}
              onValueChange={onSelectedGeminiModelIdChange}
              disabled={chatMode !== ChatMode.DIRECT_GEMINI}
              name="geminiModel" // Added name for Label htmlFor
              id="geminiModel"
            >
              <SelectTrigger disabled={chatMode !== ChatMode.DIRECT_GEMINI}>
                <SelectValue placeholder="Select Gemini Model" />
              </SelectTrigger>
              <SelectContent>
                {availableGeminiModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={cn(
              chatMode !== ChatMode.DIRECT_OPENAI &&
                "opacity-50 cursor-not-allowed",
            )}
          >
            <Label htmlFor="openaiModel" className="mb-1 block">
              <BrainCircuit size={14} className="inline mr-1" /> OpenAI Model
            </Label>
            <Select
              value={selectedOpenAIModelId}
              onValueChange={onSelectedOpenAIModelIdChange}
              disabled={chatMode !== ChatMode.DIRECT_OPENAI}
              name="openaiModel" // Added name for Label htmlFor
              id="openaiModel"
            >
              <SelectTrigger disabled={chatMode !== ChatMode.DIRECT_OPENAI}>
                <SelectValue placeholder="Select OpenAI Model" />
              </SelectTrigger>
              <SelectContent>
                {availableOpenAIModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Parameters Section */}
        <div className="space-y-3 mb-4 pb-4 border-b">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Parameters</h4>
          <div>
            <Label htmlFor="temperature-preset" className="mb-1 block">Creativity</Label>
            <Select
              value={temperaturePreset}
              onValueChange={(value) =>
                onTemperaturePresetChange(value as TemperaturePreset)
              }
              name="temperature-preset"
              id="temperature-preset" // Ensure ID matches htmlFor
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Creativity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="precise">Precise</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="creative">Creative</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {temperaturePreset === "precise" && "More factual, focused output."}
              {temperaturePreset === "normal" && "Balanced output."}
              {temperaturePreset === "creative" &&
                "More imaginative, diverse output."}
            </p>
          </div>

          <div>
            <Label htmlFor="max-tokens" className="mb-1 block">Max Response Length (Tokens)</Label>
            <Input
              id="max-tokens"
              type="number"
              value={maxTokens}
              onChange={(e) =>
                onMaxTokensChange(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              min="1"
              max="8192" // Example max, adjust as needed
              step="16"
            />
          </div>
        </div>
      </div>
    </SidebarGroup>
  );
};

export default ChatConfigSidebar;
