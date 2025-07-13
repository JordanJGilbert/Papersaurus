"use client";

import React, { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, RefreshCw, Undo2, Redo2, History } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Step3Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  handleGetMessageHelp?: () => Promise<void>;
  isGeneratingMessage?: boolean;
  messageHistory?: string[];
  currentMessageIndex?: number;
  undoMessage?: () => void;
  redoMessage?: () => void;
}

export default function Step3Message({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  handleGetMessageHelp, 
  isGeneratingMessage,
  messageHistory = [],
  currentMessageIndex = -1,
  undoMessage,
  redoMessage
}: Step3Props) {
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded for dedicated step

  React.useEffect(() => {
    // This step is always "complete" since the message is optional
    onStepComplete?.();
  }, [onStepComplete]);

  const handleMessageGeneration = async () => {
    if (handleGetMessageHelp) {
      await handleGetMessageHelp();
    }
  };

  // Dynamic placeholder based on card type and tone
  const messagePlaceholder = useMemo(() => {
    if (formData.isHandwrittenMessage) return "✍️ Leave blank - you'll handwrite this message";
    
    const { selectedType, selectedTone, to } = formData;
    const recipientName = to || "them";
    
    if (selectedType === 'birthday' && selectedTone === 'funny') {
      return `💝 Write a funny birthday message for ${recipientName}...`;
    } else if (selectedType === 'anniversary' && selectedTone === 'romantic') {
      return `💝 Express your love and cherished memories with ${recipientName}...`;
    } else if (selectedType === 'thank-you' && selectedTone === 'professional') {
      return `💝 Express your professional gratitude to ${recipientName}...`;
    } else if (selectedTone === 'funny') {
      return `💝 Add humor and make ${recipientName} laugh...`;
    } else if (selectedTone === 'heartfelt') {
      return `💝 Share sincere feelings with ${recipientName}...`;
    }
    
    return `💝 Write your message to ${recipientName}... (or click 'Help me write')`;
  }, [formData.selectedType, formData.selectedTone, formData.to, formData.isHandwrittenMessage]);

  const canUndo = currentMessageIndex > 0;
  const canRedo = currentMessageIndex < messageHistory.length - 1;
  const characterCount = formData.finalCardMessage?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header with title and controls */}
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Compose Your Message
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This is what will appear inside your card
          </p>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {/* Message History Dropdown */}
          {messageHistory.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={formData.isHandwrittenMessage}
                >
                  <History className="w-4 h-4" />
                  History
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-80">
                {messageHistory.map((msg, idx) => (
                  <DropdownMenuItem
                    key={idx}
                    onClick={() => updateFormData({ finalCardMessage: msg })}
                    className="block"
                  >
                    <div className="text-sm truncate">{msg}</div>
                    {idx === currentMessageIndex && (
                      <div className="text-xs text-muted-foreground mt-1">Current</div>
                    )}
                  </DropdownMenuItem>
                ))}
                {messageHistory.length > 5 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Showing last {Math.min(5, messageHistory.length)} messages
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Undo/Redo Buttons */}
          {(undoMessage || redoMessage) && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={undoMessage}
                disabled={!canUndo || formData.isHandwrittenMessage}
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redoMessage}
                disabled={!canRedo || formData.isHandwrittenMessage}
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          {/* AI Generation Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleMessageGeneration}
            disabled={isGeneratingMessage || formData.isHandwrittenMessage}
            className="gap-1"
          >
            {formData.finalCardMessage ? (
              <>
                <RefreshCw className="w-4 h-4" />
                {isGeneratingMessage ? "Generating..." : "Try Another"}
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-4 h-4" />
                {isGeneratingMessage ? "Generating..." : "Help Me Write"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Message Textarea */}
      <div className="relative">
        {isGeneratingMessage ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <div className="text-center text-sm text-muted-foreground animate-pulse">
              Creating personalized message...
            </div>
          </div>
        ) : (
          <>
            <Textarea
              placeholder={messagePlaceholder}
              value={formData.finalCardMessage}
              onChange={(e) => updateFormData({ finalCardMessage: e.target.value })}
              rows={8}
              className="resize-y min-h-[200px]"
              style={{ fontSize: '16px' }}
              disabled={formData.isHandwrittenMessage}
            />
            
            {/* Character Count and Helper Text */}
            {!formData.isHandwrittenMessage && (
              <div className="mt-2 flex justify-between items-center">
                <div className="text-xs text-muted-foreground">
                  {characterCount > 0 && `${characterCount} characters`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Ideal: 50-250 characters
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Handwritten Message Option */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="handwritten-message"
          checked={formData.isHandwrittenMessage}
          onChange={(e) => {
            updateFormData({ 
              isHandwrittenMessage: e.target.checked,
              finalCardMessage: e.target.checked ? "" : formData.finalCardMessage
            });
          }}
          className="rounded"
        />
        <label htmlFor="handwritten-message" className="text-sm text-gray-600 dark:text-gray-400">
          I'll handwrite my message (leave blank space on card)
        </label>
      </div>

      {/* Message Tips */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
        <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">✨ Message Tips</h4>
        <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
          <li>• Keep it concise - 2-3 sentences work best</li>
          <li>• Reference specific memories or inside jokes</li>
          <li>• Let AI help if you're stuck - it knows your card context</li>
          <li>• You can always edit the AI suggestions</li>
        </ul>
      </div>
    </div>
  );
}