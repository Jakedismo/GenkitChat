import React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Assuming SidebarGroup and SidebarGroupLabel are correctly exported from your main sidebar component via index.ts
import { SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar";
import { Sparkles, BrainCircuit } from "lucide-react";
// Import shared types
import { ChatMode, TemperaturePreset, ModelInfo } from "@/types/chat";

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
      <SidebarGroupLabel>Chat Configuration</SidebarGroupLabel>{" "}
      {/* Uses imported SidebarGroupLabel */}
      <Separator />
      <div className="p-2 space-y-4">
        {/* Chat Mode Select */}
        <div>
          <p className="mb-2 text-sm font-medium">Chat Mode</p>
          <Select
            value={chatMode}
            onValueChange={(value) => onChatModeChange(value as ChatMode)}
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

        {/* Gemini Model Select */}
        <div
          className={cn(
            chatMode !== ChatMode.DIRECT_GEMINI &&
              "opacity-50 cursor-not-allowed",
          )}
        >
          <p className="mb-2 text-sm font-medium">
            <Sparkles size={16} className="inline mr-1" /> Gemini Model
          </p>
          <Select
            value={selectedGeminiModelId}
            onValueChange={onSelectedGeminiModelIdChange}
            disabled={chatMode !== ChatMode.DIRECT_GEMINI}
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

        {/* OpenAI Model Select */}
        <div
          className={cn(
            chatMode !== ChatMode.DIRECT_OPENAI &&
              "opacity-50 cursor-not-allowed",
          )}
        >
          <p className="mb-2 text-sm font-medium">
            <BrainCircuit size={16} className="inline mr-1" /> OpenAI Model
          </p>
          <Select
            value={selectedOpenAIModelId}
            onValueChange={onSelectedOpenAIModelIdChange}
            disabled={chatMode !== ChatMode.DIRECT_OPENAI}
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

        {/* Creativity Select */}
        <div>
          <Label htmlFor="temperature-preset">Creativity</Label>
          <Select
            value={temperaturePreset}
            onValueChange={(value) =>
              onTemperaturePresetChange(value as TemperaturePreset)
            }
            name="temperature-preset"
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

        {/* Max Tokens Input */}
        <div>
          <Label htmlFor="max-tokens">Max Response Length (Tokens)</Label>
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
    </SidebarGroup>
  );
};

export default ChatConfigSidebar;
