"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, 
  Bot, 
  User, 
  RefreshCw, 
  Copy, 
  Check,
  Palette,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isScene?: boolean; // Flag to indicate this is a generated scene description
}

interface SceneChatInterfaceProps {
  formData: {
    selectedType?: string;
    selectedTone?: string;
    toField?: string;
    fromField?: string;
    personalTraits?: string;
    prompt?: string;
  };
  onSceneSelect: (scene: string) => void;
  onGenerateScene: (userInput: string, conversationHistory: ChatMessage[]) => Promise<string>;
  isGenerating?: boolean;
  onClose?: () => void;
  photoReferences?: any[];
}

export default function SceneChatInterface({
  formData,
  onSceneSelect,
  onGenerateScene,
  isGenerating = false,
  onClose,
  photoReferences = []
}: SceneChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with a greeting
  useEffect(() => {
    const personalTraitsText = formData.personalTraits 
      ? ` I see you've mentioned their interests: "${formData.personalTraits}". I'll incorporate these into our scene!`
      : '';
    
    const photoText = photoReferences.length > 0 
      ? ` I also notice you've uploaded ${photoReferences.length} reference photo${photoReferences.length > 1 ? 's' : ''} - I'll make sure to include those people in creative ways.`
      : '';

    const initialMessage: ChatMessage = {
      id: "initial",
      role: "assistant",
      content: `Hi! I'm here to help you create the perfect scene for your ${formData.selectedType || "greeting card"}.${personalTraitsText}${photoText}

Tell me about the setting, activities, or visual elements you'd like to see, and I'll help you craft an amazing scene that captures the ${formData.selectedTone || "perfect"} mood!`,
      timestamp: new Date()
    };
    setMessages([initialMessage]);
  }, [formData.selectedType, formData.selectedTone, formData.personalTraits, photoReferences]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");

    try {
      const generatedScene = await onGenerateScene(inputValue, messages);
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString() + "-response",
        role: "assistant",
        content: generatedScene,
        timestamp: new Date(),
        isScene: true
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      toast.error("Failed to generate scene. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (message: ChatMessage) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    toast.success("Scene copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUseScene = (scene: string) => {
    onSceneSelect(scene);
    toast.success("Scene selected!");
  };

  return (
    <Card className="flex flex-col h-[600px] sm:h-[500px] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold">Scene Assistant</h3>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        )}
      </div>

      {/* Chat Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              )}
              
              <div
                className={cn(
                  "max-w-[80%] rounded-lg p-3",
                  message.role === "user"
                    ? "bg-gray-100 dark:bg-gray-800"
                    : "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {/* Action buttons for generated scenes */}
                {message.role === "assistant" && message.isScene && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUseScene(message.content)}
                      className="gap-1.5 text-xs"
                    >
                      <Check className="w-3 h-3" />
                      Use This Scene
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(message)}
                      className="gap-1.5 text-xs"
                    >
                      {copiedId === message.id ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      Copy
                    </Button>
                  </div>
                )}
              </div>

              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the scene you envision, or ask me for ideas..."
            className="min-h-[60px] resize-none"
            disabled={isGenerating}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isGenerating}
            className="px-3"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {/* Quick prompts */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Add more visual details")}
            className="text-xs"
          >
            More details
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Try a different setting")}
            className="text-xs"
          >
            Different setting
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Include their interests")}
            className="text-xs"
          >
            Include interests
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Make it simpler")}
            className="text-xs"
          >
            Simpler scene
          </Button>
        </div>
      </div>
    </Card>
  );
}