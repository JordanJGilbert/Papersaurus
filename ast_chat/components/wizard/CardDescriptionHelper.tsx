"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface CardDescriptionHelperProps {
  formData: CardFormData;
  onAddToDescription: (text: string) => void;
  chatWithAI?: (message: string, options: any) => Promise<any>;
}

// Contextual inspiration chips based on card type and tone
const getInspirationChips = (cardType: string, tone: string): string[] => {
  const chips: Record<string, string[]> = {
    'birthday-funny': ['cake disaster 🎂', 'age jokes', 'party animals 🎉', 'embarrassing photo'],
    'birthday-heartfelt': ['childhood memories', 'growth journey', 'warm wishes', 'family gathering'],
    'birthday-romantic': ['romantic dinner', 'heart balloons', 'love notes', 'special surprise'],
    'anniversary-romantic': ['wedding memories', 'sunset beach', 'flower garden 🌹', 'starlit dance'],
    'anniversary-funny': ['first date fail', 'inside jokes', 'funny couple', 'adventure mishaps'],
    'thank-you-professional': ['elegant design', 'corporate colors', 'minimalist style', 'formal appreciation'],
    'thank-you-heartfelt': ['gratitude flowers', 'helping hands', 'warm embrace', 'heartfelt thanks'],
    'holiday-funny': ['ugly sweater', 'reindeer chaos', 'gift wrapping fail', 'santa mishap'],
    'holiday-heartfelt': ['cozy fireplace', 'family traditions', 'winter wonderland', 'holiday warmth'],
    'congratulations-professional': ['achievement medal', 'success ladder', 'professional milestone', 'elegant celebration'],
    'congratulations-funny': ['victory dance', 'confetti explosion', 'champagne pop', 'silly celebration'],
    'sympathy-heartfelt': ['peaceful nature', 'gentle memories', 'comforting embrace', 'serene landscape'],
    'get-well-funny': ['superhero recovery', 'band-aid warrior', 'healing humor', 'get well soon animals'],
    'get-well-heartfelt': ['healing flowers', 'sunny days ahead', 'caring thoughts', 'peaceful recovery'],
  };

  const key = `${cardType}-${tone}`;
  return chips[key] || chips[cardType + '-heartfelt'] || ['custom design', 'personal touch', 'special elements', 'unique style'];
};

// AI brainstorming prompts
const getBrainstormPrompt = (cardType: string, tone: string, recipient?: string) => {
  const recipientText = recipient ? `for ${recipient}` : '';
  
  return `Generate 4 creative and specific card description ideas for a ${tone} ${cardType} card ${recipientText}. 
  Each idea should be 5-10 words and include specific visual elements, themes, or scenes.
  Make them unique and imaginative, not generic.
  Return as a JSON array of strings.`;
};

export default function CardDescriptionHelper({ 
  formData, 
  onAddToDescription,
  chatWithAI 
}: CardDescriptionHelperProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get contextual chips
  const inspirationChips = useMemo(() => 
    getInspirationChips(formData.selectedType, formData.selectedTone),
    [formData.selectedType, formData.selectedTone]
  );

  // Handle chip click
  const handleChipClick = (chip: string) => {
    const currentDescription = formData.prompt || '';
    const separator = currentDescription.trim() ? ', ' : '';
    onAddToDescription(currentDescription + separator + chip);
  };

  // Generate AI suggestions
  const handleGenerateSuggestions = async () => {
    if (!chatWithAI) return;
    
    setIsGenerating(true);
    setShowSuggestions(true);
    
    try {
      const prompt = getBrainstormPrompt(
        formData.selectedType, 
        formData.selectedTone,
        formData.toField
      );
      
      const response = await chatWithAI(prompt, {
        model: 'gemini-2.5-pro',
        jsonSchema: {
          type: "array",
          items: { type: "string" },
          minItems: 4,
          maxItems: 4
        }
      });
      
      setAiSuggestions(response);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      // Fallback suggestions
      setAiSuggestions([
        'colorful celebration scene',
        'personalized cartoon portrait',
        'nature-inspired design',
        'modern geometric patterns'
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
      {/* Quick inspiration chips */}
      <div className="flex flex-wrap gap-2">
        {inspirationChips.map((chip, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="cursor-pointer hover:bg-secondary/80 transition-colors text-xs"
            onClick={() => handleChipClick(chip)}
          >
            {chip}
          </Badge>
        ))}
      </div>

      {/* AI Brainstorm Button */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateSuggestions}
          disabled={isGenerating}
          className="gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isGenerating ? 'Thinking...' : 'Need ideas?'}
        </Button>
        
        {aiSuggestions.length > 0 && !isGenerating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerateSuggestions}
            className="gap-1 text-muted-foreground"
          >
            <RefreshCw className="w-3 h-3" />
            New ideas
          </Button>
        )}
      </div>

      {/* AI Suggestions */}
      {showSuggestions && (
        <div className="space-y-2">
          {isGenerating ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : aiSuggestions.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                💡 Click any idea to use it:
              </p>
              {aiSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="text-sm p-2 bg-background rounded cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onAddToDescription(suggestion)}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}