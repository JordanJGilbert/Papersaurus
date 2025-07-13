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
  MessageSquarePlus,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isMessage?: boolean; // Flag to indicate this is a generated card message
}

interface MessageChatInterfaceProps {
  formData: {
    selectedType?: string;
    selectedTone?: string;
    toName?: string;
    fromName?: string;
    finalCardMessage?: string;
  };
  onMessageSelect: (message: string) => void;
  onGenerateMessage: (userInput: string) => Promise<string>;
  isGenerating?: boolean;
  onClose?: () => void;
}

export default function MessageChatInterface({
  formData,
  onMessageSelect,
  onGenerateMessage,
  isGenerating = false,
  onClose
}: MessageChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with a greeting
  useEffect(() => {
    const initialMessage: ChatMessage = {
      id: "initial",
      role: "assistant",
      content: `Hi! I'm here to help you craft the perfect ${formData.selectedType || "greeting card"} message${formData.toName ? ` for ${formData.toName}` : ""}. 

Tell me about the occasion or any specific details you'd like to include, and I'll help you create a ${formData.selectedTone || "heartfelt"} message.`,
      timestamp: new Date()
    };
    setMessages([initialMessage]);
  }, [formData.selectedType, formData.selectedTone, formData.toName]);

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
      const generatedMessage = await onGenerateMessage(inputValue);
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString() + "-response",
        role: "assistant",
        content: generatedMessage,
        timestamp: new Date(),
        isMessage: true
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      toast.error("Failed to generate message. Please try again.");
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
    toast.success("Message copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUseMessage = (message: string) => {
    onMessageSelect(message);
    toast.success("Message selected!");
  };

  return (
    <Card className="flex flex-col h-[600px] sm:h-[500px] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold">Message Assistant</h3>
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
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              
              <div
                className={cn(
                  "max-w-[80%] rounded-lg p-3",
                  message.role === "user"
                    ? "bg-gray-100 dark:bg-gray-800"
                    : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {/* Action buttons for generated messages */}
                {message.role === "assistant" && message.isMessage && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUseMessage(message.content)}
                      className="gap-1.5 text-xs"
                    >
                      <Check className="w-3 h-3" />
                      Use This
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
            placeholder="Tell me about the occasion or what you'd like to say..."
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
            onClick={() => setInputValue("Make it more personal")}
            className="text-xs"
          >
            More personal
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Add some humor")}
            className="text-xs"
          >
            Add humor
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("Make it shorter")}
            className="text-xs"
          >
            Shorter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInputValue("More emotional")}
            className="text-xs"
          >
            More emotional
          </Button>
        </div>
      </div>
    </Card>
  );
}