"use client";

import React, { useState, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, Undo2, Redo2, History, Sparkles, Wand2 } from "lucide-react";
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
  handleGetMessageHelp?: (userInput?: string, conversationHistory?: any[]) => Promise<string | void>;
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
  const [modificationPrompt, setModificationPrompt] = useState("");

  React.useEffect(() => {
    // This step is always "complete" since all fields are optional
    onStepComplete?.();
  }, [onStepComplete]);

  // Handle message modification based on prompt
  const handleModifyMessage = async () => {
    if (!modificationPrompt.trim() || !handleGetMessageHelp) return;
    
    // Create a context-aware prompt for modification
    const currentMessage = formData.finalCardMessage || "";
    const modificationContext = currentMessage 
      ? `Please modify this message according to the instruction: "${modificationPrompt}"\n\nCurrent message: "${currentMessage}"`
      : `Please create a message based on this instruction: "${modificationPrompt}"`;
    
    await handleGetMessageHelp(modificationContext);
    setModificationPrompt(""); // Clear the prompt after use
  };

  // Handle quick message generation
  const handleQuickMessage = async () => {
    if (!handleGetMessageHelp) return;
    
    const { selectedType, selectedTone, toField } = formData;
    
    // Create a high-quality, context-aware quick message prompt
    let quickPrompt = `Create a beautiful, ${selectedTone} ${selectedType} card message`;
    
    if (toField) {
      quickPrompt += ` for ${toField}`;
    }
    
    // Add context-specific instructions for quality
    if (selectedType === 'birthday') {
      quickPrompt += `. Make it celebratory and warm. Reference another year of wonderful memories or adventures ahead`;
    } else if (selectedType === 'anniversary') {
      quickPrompt += `. Express deep love and appreciation. Reference the journey together`;
    } else if (selectedType === 'thank-you') {
      quickPrompt += `. Be specific about gratitude. Make them feel truly appreciated`;
    } else if (selectedType === 'get-well') {
      quickPrompt += `. Be encouraging and uplifting. Express care and support`;
    } else if (selectedType === 'sympathy') {
      quickPrompt += `. Be gentle and comforting. Offer sincere condolences`;
    } else if (selectedType === 'holiday') {
      quickPrompt += `. Capture the joy of the season. Include warm wishes`;
    } else if (selectedType === 'congratulations') {
      quickPrompt += `. Celebrate their achievement. Express pride and excitement`;
    }
    
    // Add tone-specific quality markers
    if (selectedTone === 'funny') {
      quickPrompt += `. Include humor that feels natural and affectionate, not forced`;
    } else if (selectedTone === 'heartfelt') {
      quickPrompt += `. Write from the heart with genuine emotion`;
    } else if (selectedTone === 'romantic') {
      quickPrompt += `. Express deep love and affection beautifully`;
    } else if (selectedTone === 'professional') {
      quickPrompt += `. Keep it warm but appropriate for a professional relationship`;
    }
    
    quickPrompt += `. 

IMPORTANT: Create a message that feels like it was carefully crafted, not generic. It should be memorable, touching, and something the recipient would want to keep. Aim for 100-200 characters - long enough to be meaningful but short enough to be impactful. Make every word count.`;
    
    await handleGetMessageHelp(quickPrompt);
  };

  // Dynamic placeholder based on card type and tone
  const messagePlaceholder = useMemo(() => {
    if (formData.isHandwrittenMessage) return "✍️ Leave blank - you'll handwrite";
    
    // Simple, consistent placeholder for all card types
    return "Write your card message here, or click the Create Message button for a starting place.";
  }, [formData.isHandwrittenMessage]);

  const canUndo = currentMessageIndex > 0;
  const canRedo = currentMessageIndex < messageHistory.length - 1;
  const characterCount = formData.finalCardMessage?.length || 0;

  return (
    <div className="space-y-6">
      {/* Message Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Card Message
            </label>
            {/* Create Message Button */}
            {!formData.isHandwrittenMessage && !formData.finalCardMessage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickMessage}
                disabled={isGeneratingMessage}
                className="gap-1.5 text-xs"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Create Message</span>
                <span className="sm:hidden">Create</span>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Message History Dropdown */}
            {messageHistory.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs"
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
          </div>
        </div>
        
        {/* Message Input Container with Integrated AI Helper */}
        <div className="relative">
          {isGeneratingMessage ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <div className="text-xs text-muted-foreground animate-pulse">
                Creating personalized message...
              </div>
            </div>
          ) : (
            <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
              {/* Main Message Textarea */}
              <Textarea
                placeholder={
                  formData.isHandwrittenMessage 
                    ? "This space will be left empty on the card for your handwritten message..." 
                    : formData.isFrontBackOnly
                    ? "With front/back only cards, your message will be beautifully displayed on the back cover..."
                    : messagePlaceholder
                }
                value={formData.finalCardMessage}
                onChange={(e) => updateFormData({ finalCardMessage: e.target.value })}
                rows={isMessageExpanded ? 12 : 8}
                className={`border-0 focus:ring-0 ${isMessageExpanded ? "resize-y" : "resize-none"}`}
                style={{ fontSize: '16px' }}
              />
              
              {/* Integrated AI Helper - Connected visually */}
              {!formData.isHandwrittenMessage && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder={formData.finalCardMessage 
                          ? "Try: 'make it funnier' or 'add a joke about her dogs'" 
                          : "Try: 'write a funny birthday message for my wife'"}
                        value={modificationPrompt}
                        onChange={(e) => setModificationPrompt(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleModifyMessage();
                          }
                        }}
                      />
                    </div>
                    <Button
                      onClick={handleModifyMessage}
                      disabled={!modificationPrompt.trim() || isGeneratingMessage}
                      className="px-4 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900"
                      size="sm"
                    >
                      Apply
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 ml-10">
                    AI will modify your message based on your instructions
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Character Count and Helper Text */}
        <div className="mt-2 space-y-0.5">
          {formData.finalCardMessage && (
            <div className="text-xs text-muted-foreground">
              {characterCount} characters
            </div>
          )}
          <div className="text-xs text-muted-foreground/70">
            {formData.isHandwrittenMessage 
              ? "💡 Your message will appear in handwritten style on the card"
              : "💡 Messages typically work best between 50-300 characters"}
          </div>
        </div>
        
        {/* Handwritten Message Option */}
        <div className="flex items-center space-x-2 mt-2">
          <input
            type="checkbox"
            id="handwritten-message"
            checked={formData.isHandwrittenMessage}
            onChange={(e) => {
              updateFormData({ 
                isHandwrittenMessage: e.target.checked
              });
            }}
            className="rounded"
          />
          <label htmlFor="handwritten-message" className="text-sm text-gray-600 dark:text-gray-400">
            Leave space for handwritten message
          </label>
        </div>

        {/* Front/Back Only Option */}
        <div className="flex items-center space-x-2 mt-2">
          <input
            type="checkbox"
            id="front-back-only"
            checked={formData.isFrontBackOnly}
            onChange={(e) => {
              updateFormData({ 
                isFrontBackOnly: e.target.checked
              });
            }}
            className="rounded"
          />
          <label htmlFor="front-back-only" className="text-sm text-gray-600 dark:text-gray-400">
            Create front and back covers only (no interior pages)
          </label>
        </div>
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">✨ Message Tips</h4>
        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
          <li>• Keep it personal and heartfelt</li>
          <li>• Use the AI helper to create or modify your message</li>
          <li>• Try prompts like "make it funnier" or "add a personal touch"</li>
          <li>• Check "handwritten style" to display your typed message in handwriting font</li>
          <li>• Select "front and back only" for a simpler 2-panel card design</li>
        </ul>
      </div>
    </div>
  );
} 