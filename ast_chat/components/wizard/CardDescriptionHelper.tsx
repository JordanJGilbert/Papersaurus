"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoReference } from "@/hooks/cardStudio/constants";

interface CardDescriptionHelperProps {
  formData: CardFormData;
  onAddToDescription: (text: string) => void;
  chatWithAI?: (message: string, options: any) => Promise<any>;
  photoReferences?: PhotoReference[];
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
const getBrainstormPrompt = (cardType: string, tone: string, recipient?: string, photoContext?: string) => {
  const recipientText = recipient ? `for ${recipient}` : '';
  const photoText = photoContext ? `\n\n${photoContext}. Include these specific people in creative and imaginative ways. IMPORTANT: Only feature the people mentioned above - do not add any additional people, babies, children, or characters unless explicitly requested.` : '';
  
  return `Generate 4 creative and specific card description ideas for a ${tone} ${cardType} card ${recipientText}.${photoText}
  Each idea should be 20-30 words long and paint a vivid picture with specific visual elements, themes, scenes, and artistic details.
  Make them detailed, unique and imaginative - not generic. Include colors, styles, compositions, and emotional elements.
  Return as a JSON array of strings.`;
};

export default function CardDescriptionHelper({ 
  formData, 
  onAddToDescription,
  chatWithAI,
  photoReferences = [] 
}: CardDescriptionHelperProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get contextual chips (including photo-aware suggestions)
  const inspirationChips = useMemo(() => {
    const baseChips = getInspirationChips(formData.selectedType, formData.selectedTone);
    
    // Add photo-specific chips if we have photos with descriptions
    if (photoReferences && photoReferences.length > 0) {
      const photosWithDescriptions = photoReferences.filter(ref => ref.description && ref.description.trim() !== '');
      
      if (photosWithDescriptions.length > 0) {
        const photoChips: string[] = [];
        
        // Extract names from descriptions
        const allDescriptions = photosWithDescriptions.map(ref => ref.description).join(' ');
        
        // Simple heuristic to find potential names
        const namePattern = /\b(my\s+)?(daughter|son|wife|husband|friend|sister|brother|mom|dad|mother|father)\s+(\w+)/gi;
        const matches = Array.from(allDescriptions.matchAll(namePattern));
        const names = matches.map(match => match[3]);
        
        if (names.length > 0) {
          if (names.length === 1) {
            photoChips.push(`${names[0]} portrait 🎨`);
            photoChips.push(`${names[0]} in action`);
          } else {
            photoChips.push('group portrait 👥');
            photoChips.push('everyone together');
          }
        } else {
          photoChips.push('family portrait 👨‍👩‍👧‍👦');
          photoChips.push('special moment 📸');
        }
        
        // Combine photo chips with base chips, photo chips first
        return [...photoChips, ...baseChips].slice(0, 6); // Limit to 6 chips total
      }
    }
    
    return baseChips;
  }, [formData.selectedType, formData.selectedTone, photoReferences]);

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
        photoContext
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
        'A vibrant celebration scene with colorful balloons, confetti, and joyful characters dancing under sparkling party lights in watercolor style',
        'A personalized cartoon portrait featuring the recipient surrounded by their favorite hobbies, pets, and meaningful symbols in bright cheerful colors',
        'A serene nature-inspired design with blooming wildflowers, butterflies, and soft pastel sunset creating a peaceful, dreamy atmosphere',
        'Modern geometric patterns in bold jewel tones creating an elegant abstract design with gold accents and sophisticated minimalist appeal'
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
                <Skeleton key={i} className="h-16 w-full" />
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