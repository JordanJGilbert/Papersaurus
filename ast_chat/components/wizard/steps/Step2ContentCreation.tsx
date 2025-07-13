"use client";

import React, { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, Undo2, Redo2, History, MessageCircle } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import MessageChatInterface from "@/components/MessageChatInterface";

interface Step2Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  handleGetMessageHelp?: (userInput?: string) => Promise<string | void>;
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
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);
  const [showChatInterface, setShowChatInterface] = useState(false);

  React.useEffect(() => {
    // This step is always "complete" since all fields are optional
    onStepComplete?.();
  }, [onStepComplete]);

  // Removed handleMessageGeneration since we're using AI Chat interface only

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
    
    return "💝 Your message here... (or click 'AI Chat' for help)";
  }, [formData.selectedType, formData.selectedTone, formData.isHandwrittenMessage]);

  const canUndo = currentMessageIndex > 0;
  const canRedo = currentMessageIndex < messageHistory.length - 1;
  const characterCount = formData.finalCardMessage?.length || 0;

  // Handler for chat-based message generation
  const handleChatMessageGeneration = async (userInput: string): Promise<string> => {
    if (handleGetMessageHelp) {
      // Pass the user input as context for more personalized generation
      const generatedMessage = await handleGetMessageHelp(userInput);
      return generatedMessage || "I'll help you create a heartfelt message. Could you tell me more about what you'd like to express?";
    }
    return "I'll help you create a heartfelt message. Could you tell me more about what you'd like to express?";
  };

  if (showChatInterface) {
    return (
      <MessageChatInterface
        formData={formData}
        onMessageSelect={(message) => {
          updateFormData({ finalCardMessage: message });
          setShowChatInterface(false);
        }}
        onGenerateMessage={handleChatMessageGeneration}
        isGenerating={isGeneratingMessage}
        onClose={() => setShowChatInterface(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
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
            
            {/* AI Chat Interface Button - Primary CTA */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowChatInterface(true)}
              disabled={formData.isHandwrittenMessage}
              className="gap-1.5 text-xs bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="font-medium">AI Chat</span>
            </Button>
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
              rows={isMessageExpanded ? 14 : 10}
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
              💡 Messages typically work best between 50-350 characters
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
        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">✨ Message Tips</h4>
        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
          <li>• Keep it personal and heartfelt</li>
          <li>• Use AI Chat for interactive message creation</li>
          <li>• Have a conversation to refine your message</li>
          <li>• Leave blank if you prefer to handwrite</li>
        </ul>
      </div>
    </div>
  );
} 