"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Settings } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";

interface Step4Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
}

// Image model options
const imageModels = [
  { 
    id: "gpt-image-1", 
    label: "GPT Image 1", 
    description: "Highest quality variant : Recommended",
  },
  { 
    id: "flux-1.1-pro", 
    label: "FLUX 1.1 Pro", 
    description: "Fastest & highest quality : $0.04 per image, 3-10 seconds",
  },
  { 
    id: "seedream-3", 
    label: "SeeDream 3", 
    description: "2K photorealistic quality : $0.03 per image, 5-15 seconds",
  },
];

// Paper size options
const paperSizes = [
  {
    id: "standard",
    label: "5×7 Card (Standard)",
    description: "Standard 5×7 greeting card (10×7 print layout)",
  },
  {
    id: "compact",
    label: "4×6 Card (Compact)",
    description: "Compact 4×6 greeting card (8×6 print layout)",
  },
  {
    id: "a6",
    label: "A6 Card (4×6)",
    description: "A6 paper size (8.3×5.8 print layout)",
  }
];

export default function Step4Details({ formData, updateFormData, onStepComplete }: Step4Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  React.useEffect(() => {
    // Validate email and auto-complete when valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = formData.userEmail.trim() && emailRegex.test(formData.userEmail);
    
    if (isValid) {
      onStepComplete?.();
    }
  }, [formData.userEmail, onStepComplete]);

  return (
    <div className="space-y-6">
      {/* User Email Field */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Your Email (Required)
        </label>
        <Input
          type="email"
          placeholder="📧 your.email@example.com (we'll send you the card!)"
          required
          value={formData.userEmail}
          onChange={(e) => updateFormData({ userEmail: e.target.value })}
          style={{ fontSize: '16px' }}
          className="h-12"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Required to generate your card. We'll send you a thank you note when it's ready!
        </p>
      </div>

      {/* Advanced Options */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Advanced Options
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 mt-4">
          {/* Image Model Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Image Generation Model
            </label>
            <Select 
              value={formData.selectedImageModel} 
              onValueChange={(value) => updateFormData({ selectedImageModel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose image model" />
              </SelectTrigger>
              <SelectContent>
                {imageModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div>
                      <div className="font-medium">{model.label}</div>
                      <div className="text-xs text-muted-foreground">{model.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Draft Mode Model Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Draft Mode Model
            </label>
            <Select 
              value={formData.selectedDraftModel} 
              onValueChange={(value) => updateFormData({ selectedDraftModel: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose draft model" />
              </SelectTrigger>
              <SelectContent>
                {imageModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div>
                      <div className="font-medium">{model.label}</div>
                      <div className="text-xs text-muted-foreground">{model.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Model used for draft variations. Consider faster models for quicker previews.
            </p>
          </div>

          {/* Paper Size Selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Paper Size
            </label>
            <Select 
              value={formData.selectedPaperSize} 
              onValueChange={(value) => updateFormData({ selectedPaperSize: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose paper size" />
              </SelectTrigger>
              <SelectContent>
                {paperSizes.map((size) => (
                  <SelectItem key={size.id} value={size.id}>
                    <div>
                      <div className="font-medium">{size.label}</div>
                      <div className="text-xs text-muted-foreground">{size.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Number of Cards */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Number of Cards to Generate
            </label>
            <Select 
              value={formData.numberOfCards.toString()} 
              onValueChange={(value) => updateFormData({ numberOfCards: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose number of cards" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    {num} Card{num > 1 ? 's' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Generate multiple card variations to choose from
            </p>
          </div>

          {/* Print Options */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="front-back-only"
                checked={formData.isFrontBackOnly}
                onChange={(e) => updateFormData({ isFrontBackOnly: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="front-back-only" className="text-sm text-gray-700 dark:text-gray-300">
                Front and back only (no interior pages)
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Perfect for postcards or simple greeting cards
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Tips */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
        <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-2">📧 Final Details</h4>
        <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
          <li>• Your email is required to generate and deliver your card</li>
          <li>• GPT Image 1 is recommended for highest quality results</li>
          <li>• Advanced options allow fine-tuning of generation settings</li>
          <li>• All settings will be saved for your convenience</li>
        </ul>
      </div>
    </div>
  );
} 