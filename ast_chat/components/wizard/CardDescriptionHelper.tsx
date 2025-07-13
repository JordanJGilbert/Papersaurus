"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoReference } from "@/hooks/cardStudio/constants";

interface CardDescriptionHelperProps {
  formData: CardFormData;
  onAddToDescription: (text: string) => void;
  chatWithAI?: (message: string, options: any) => Promise<any>;
  photoReferences?: PhotoReference[];
  fromField?: string;
  relationshipField?: string;
}

// AI brainstorming prompts - focused on visual design elements
const getBrainstormPrompt = (
  cardType: string, 
  tone: string, 
  recipient?: string, 
  sender?: string, 
  relationship?: string, 
  photoContext?: string,
  personalTraits?: string
) => {
  const recipientText = recipient ? `for ${recipient}` : '';
  const senderText = sender ? ` from ${sender}` : '';
  const relationshipText = relationship ? ` (${relationship})` : '';
  const photoText = photoContext ? `\n\n${photoContext}. Include these specific people in creative and imaginative ways. IMPORTANT: Only feature the people mentioned above - do not add any additional people, babies, children, or characters unless explicitly requested.` : '';
  
  // Build personal traits context
  const traitsText = personalTraits ? `\n\nPersonal traits and interests: ${personalTraits}` : '';
  
  return `Generate 4 unique scene suggestions for a ${tone} ${cardType} card ${recipientText}${senderText}${relationshipText}.${photoText}${traitsText}
  
  Create complete scene descriptions that creatively combine their personal traits into cohesive visual narratives.
  Each suggestion should be 20-30 words describing a complete scene with setting, activities, and visual elements.
  
  Examples of good scene suggestions:
  - "Cozy ski lodge scene with them enjoying craft beer by the fireplace after hitting the slopes, mountain views through windows"
  - "Sushi restaurant setting with them as a happy chef preparing their favorite rolls, sake bottles and cherry blossoms decorating"
  - "Morning yoga session on a beach at sunrise, surrounded by their favorite tropical fruits and meditation elements"
  - "Gaming tournament setup with their favorite snacks, neon lights, and victory celebration with pizza and energy drinks"
  
  Make each scene unique and imaginative while incorporating their specific interests.
  
  Return as a JSON array of strings.`;
};

export default function CardDescriptionHelper({ 
  formData, 
  onAddToDescription,
  chatWithAI,
  photoReferences = [],
  fromField = '',
  relationshipField = ''
}: CardDescriptionHelperProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Generate AI suggestions
  const handleGenerateSuggestions = async () => {
    if (!chatWithAI) return;
    
    setIsGenerating(true);
    setShowSuggestions(true);
    
    try {
      // Build simplified photo context
      let photoContext = '';
      if (photoReferences && photoReferences.length > 0) {
        const photosWithDescriptions = photoReferences.filter(ref => ref.description && ref.description.trim() !== '');
        if (photosWithDescriptions.length > 0) {
          const descriptions = photosWithDescriptions.map(ref => ref.description).join(', ');
          photoContext = `The card should include ${descriptions}`;
        } else if (photoReferences.length > 0) {
          photoContext = `The card should include the people from ${photoReferences.length} reference photo${photoReferences.length > 1 ? 's' : ''}`;
        }
      }
      
      const prompt = getBrainstormPrompt(
        formData.selectedType, 
        formData.selectedTone,
        formData.toField,
        fromField,
        relationshipField,
        photoContext,
        formData.personalTraits
      );
      
      // Include reference images if available
      const imageAttachments = formData.referenceImageUrls || [];
      
      const response = await chatWithAI(prompt, {
        model: 'gemini-2.5-pro',
        jsonSchema: {
          type: "array",
          items: { type: "string" },
          minItems: 4,
          maxItems: 4
        },
        ...(imageAttachments.length > 0 && { attachments: imageAttachments })
      });
      
      setAiSuggestions(response);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      // Fallback suggestions
      setAiSuggestions([
        'Coffee theme with espresso machines, coffee beans, cozy café atmosphere in warm browns',
        'Hiking adventure with mountain trails, backpacks, sunrise views, nature greens and blues',
        'Gaming setup with controllers, neon lights, pixel art style, vibrant purple and cyan',
        'Yoga and meditation theme with lotus flowers, peaceful sunset, calming pastels'
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
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
          {isGenerating ? 'Creating scenes...' : 'Need scene ideas?'}
        </Button>
        
        {aiSuggestions.length > 0 && !isGenerating && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerateSuggestions}
            className="gap-1 text-muted-foreground"
          >
            <RefreshCw className="w-3 h-3" />
            New scenes
          </Button>
        )}
      </div>

      {/* AI Suggestions */}
      {showSuggestions && (
        <div className="space-y-2">
          {isGenerating ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : aiSuggestions.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                🎨 Click any scene to use it as your card design:
              </p>
              {aiSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="text-sm p-3 bg-background rounded cursor-pointer hover:bg-accent transition-colors leading-relaxed"
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