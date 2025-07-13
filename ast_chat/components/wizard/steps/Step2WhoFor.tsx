"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CardFormData } from "@/hooks/useCardForm";
import { ChevronDown } from "lucide-react";

interface Step2Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
}

export default function Step2WhoFor({ 
  formData, 
  updateFormData, 
  onStepComplete 
}: Step2Props) {
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);

  React.useEffect(() => {
    // This step is always complete since all fields are optional
    onStepComplete?.();
  }, [onStepComplete]);

  return (
    <div className="space-y-6">
      {/* To/From Fields */}
      <div className="space-y-4">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
          Who's this card for?
        </label>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                To (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., Mom, Sarah, Team..."
                value={formData.to}
                onChange={(e) => updateFormData({ to: e.target.value })}
                className="w-full"
                style={{ fontSize: '16px' }}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Relationship (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., Mother, Best Friend, Boss..."
                value={formData.relationship}
                onChange={(e) => updateFormData({ relationship: e.target.value })}
                className="w-full"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              From (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g., Your Name, The Family..."
              value={formData.from}
              onChange={(e) => updateFormData({ from: e.target.value })}
              className="w-full"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          These details help personalize your card's message and design
        </p>
      </div>

      {/* Creative Directions Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Creative Directions for Your Card (Optional)
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
          placeholder="💡 Share their interests, hobbies, favorite foods, inside jokes, or any creative ideas - we'll include them in the design!"
          value={formData.prompt}
          onChange={(e) => updateFormData({ prompt: e.target.value })}
          rows={isTextareaExpanded ? 6 : 3}
          className={isTextareaExpanded ? "resize-y" : "resize-none"}
          style={{ fontSize: '16px' }}
        />
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          This is your chance to guide the card's visual design - mention anything you'd like to see!
        </p>
      </div>

      {/* Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Tips</h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• The relationship helps create a more personalized message</li>
          <li>• Mention interests and they'll appear in the artwork</li>
          <li>• Be specific - "loves surfing" → beach/wave themes</li>
        </ul>
      </div>
    </div>
  );
}