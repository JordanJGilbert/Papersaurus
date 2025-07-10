"use client";

import React, { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageSquarePlus, RefreshCw, Undo2, Redo2, History } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Step2Props {
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

export default function Step2ContentCreation({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  handleGetMessageHelp, 
  isGeneratingMessage,
  messageHistory = [],
  currentMessageIndex = -1,
  undoMessage,
  redoMessage
}: Step2Props) {
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);

  React.useEffect(() => {
    // This step is always "complete" since all fields are optional
    onStepComplete?.();
  }, [onStepComplete]);

  const handleMessageGeneration = async () => {
    if (handleGetMessageHelp) {
      await handleGetMessageHelp();
    }
  };

  // Dynamic placeholder based on card type and tone
  const messagePlaceholder = useMemo(() => {
    if (formData.isHandwrittenMessage) return "✍️ Leave blank - you'll handwrite";
    
    const { selectedType, selectedTone } = formData;
    
    if (selectedType === 'birthday' && selectedTone === 'funny') {
      return "💝 Add a joke about their age or a funny memory...";
    } else if (selectedType === 'anniversary' && selectedTone === 'romantic') {
      return "💝 Express your love and cherished memories...";
    } else if (selectedType === 'thank-you' && selectedTone === 'professional') {
      return "💝 Express gratitude professionally...";
    } else if (selectedTone === 'funny') {
      return "💝 Add humor, jokes, or funny memories...";
    } else if (selectedTone === 'heartfelt') {
      return "💝 Share sincere feelings and warm wishes...";
    }
    
    return "💝 Your message here... (or click 'Help me write')";
  }, [formData.selectedType, formData.selectedTone, formData.isHandwrittenMessage]);

  const canUndo = currentMessageIndex > 0;
  const canRedo = currentMessageIndex < messageHistory.length - 1;
  const characterCount = formData.finalCardMessage?.length || 0;

  return (
    <div className="space-y-6">
      {/* Card Description */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Describe Your Card (Optional)
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
            className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {isTextareaExpanded ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 rotate-180" />
                Expand
              </>
            )}
          </Button>
        </div>
        <Textarea
          placeholder="💡 Optional: E.g., 'Birthday card with cute cats and rainbow colors'"
          value={formData.prompt}
          onChange={(e) => updateFormData({ prompt: e.target.value })}
          rows={isTextareaExpanded ? 6 : 3}
          className={isTextareaExpanded ? "resize-y" : "resize-none"}
          style={{ fontSize: '16px' }}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          💡 <strong>Tip:</strong> Add colors, style, themes for better results, or leave blank for defaults
        </p>
      </div>

      {/* Message Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Card Message
          </label>
          <div className="flex items-center gap-1">
            {/* Message History Dropdown */}
            {messageHistory.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
                    disabled={formData.isHandwrittenMessage}
                  >
                    <History className="w-3 h-3" />
                    <span className="hidden sm:inline">History</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
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
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undoMessage}
                  disabled={!canUndo || formData.isHandwrittenMessage}
                  className="px-1.5"
                  title="Undo"
                >
                  <Undo2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={redoMessage}
                  disabled={!canRedo || formData.isHandwrittenMessage}
                  className="px-1.5"
                  title="Redo"
                >
                  <Redo2 className="w-3 h-3" />
                </Button>
              </div>
            )}
            
            {/* Expand/Collapse */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMessageExpanded(!isMessageExpanded)}
              className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {isMessageExpanded ? (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span className="hidden sm:inline">Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 rotate-180" />
                  <span className="hidden sm:inline">Expand</span>
                </>
              )}
            </Button>
            
            {/* AI Generation Buttons */}
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMessageGeneration}
                disabled={isGeneratingMessage || formData.isHandwrittenMessage}
                className="gap-1 text-xs"
              >
                <MessageSquarePlus className="w-3 h-3" />
                {isGeneratingMessage ? "Writing..." : "Help me write"}
              </Button>
              {formData.finalCardMessage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMessageGeneration}
                  disabled={isGeneratingMessage || formData.isHandwrittenMessage}
                  className="gap-1 text-xs"
                  title="Generate another variation"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">Try another</span>
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Message Textarea with Loading State */}
        <div className="relative">
          {isGeneratingMessage ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <div className="text-xs text-muted-foreground animate-pulse">
                Creating personalized message...
              </div>
            </div>
          ) : (
            <Textarea
              placeholder={messagePlaceholder}
              value={formData.finalCardMessage}
              onChange={(e) => updateFormData({ finalCardMessage: e.target.value })}
              rows={isMessageExpanded ? 6 : 3}
              className={isMessageExpanded ? "resize-y" : "resize-none"}
              style={{ fontSize: '16px' }}
              disabled={formData.isHandwrittenMessage}
            />
          )}
        </div>
        
        {/* Character Count and Helper Text */}
        {!formData.isHandwrittenMessage && (
          <div className="mt-1 space-y-0.5">
            {formData.finalCardMessage && (
              <div className="text-xs text-muted-foreground">
                {characterCount} characters
              </div>
            )}
            <div className="text-xs text-muted-foreground/70">
              💡 Messages typically work best between 50-250 characters
            </div>
          </div>
        )}
        
        {/* Handwritten Message Option */}
        <div className="flex items-center space-x-2 mt-2">
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
            Leave blank space for handwritten message
          </label>
        </div>
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">✨ Tips</h4>
        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
          <li>• Be specific for better results</li>
          <li>• Use "Help me write" for AI messages</li>
          <li>• Both fields are optional</li>
        </ul>
      </div>
    </div>
  );
} 