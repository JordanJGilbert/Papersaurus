"use client";

import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageSquarePlus } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";

interface Step2Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  handleGetMessageHelp?: () => Promise<void>;
  isGeneratingMessage?: boolean;
}

export default function Step2ContentCreation({ formData, updateFormData, onStepComplete, handleGetMessageHelp, isGeneratingMessage }: Step2Props) {
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
          placeholder="💡 Optional: Be specific! E.g., 'Birthday card with cute cats and rainbow colors for my sister who loves anime' (or leave blank for a beautiful default design)"
          value={formData.prompt}
          onChange={(e) => updateFormData({ prompt: e.target.value })}
          rows={isTextareaExpanded ? 8 : 5}
          className={isTextareaExpanded ? "resize-y" : "resize-none"}
          style={{ fontSize: '16px' }}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          💡 <strong>Tip:</strong> Add details like colors, style, recipient's interests, and specific themes for personalized results, or leave blank for a beautiful default card!
        </p>
      </div>

      {/* Message Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Card Message
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMessageExpanded(!isMessageExpanded)}
              className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {isMessageExpanded ? (
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
          </div>
        </div>
        <Textarea
          placeholder={formData.isHandwrittenMessage ? "✍️ Leave blank - you'll handwrite your message" : "💝 Your personal message here... (or click 'Help me write' for AI assistance)"}
          value={formData.finalCardMessage}
          onChange={(e) => updateFormData({ finalCardMessage: e.target.value })}
          rows={isMessageExpanded ? 8 : 5}
          className={isMessageExpanded ? "resize-y" : "resize-none"}
          style={{ fontSize: '16px' }}
          disabled={formData.isHandwrittenMessage}
        />
        
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

      {/* Tips */}
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">✨ Content Tips</h4>
        <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
          <li>• Be specific with descriptions for better personalized results</li>
          <li>• Use "Help me write" for AI-generated messages based on your card type</li>
          <li>• Both fields are optional - AI can create beautiful defaults</li>
          <li>• Choose handwritten message if you want to write it yourself later</li>
        </ul>
      </div>
    </div>
  );
} 