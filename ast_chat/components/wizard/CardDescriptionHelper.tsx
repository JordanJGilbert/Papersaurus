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

// Contextual inspiration chips based on card type and tone - focused on visual design elements
const getInspirationChips = (cardType: string, tone: string): string[] => {
  const chips: Record<string, string[]> = {
    'birthday-funny': ['Coffee & donuts 🍩', 'Gaming setup 🎮', 'Dogs everywhere 🐕', 'Pizza party 🍕', 'Disco vibes 🕺', 'Tacos & beer 🌮'],
    'birthday-heartfelt': ['Garden flowers 🌸', 'Mountain sunset 🏔️', 'Books & tea 📚', 'Music notes 🎵', 'Beach waves 🌊', 'Forest trails 🌲'],
    'birthday-romantic': ['Rose petals 🌹', 'Candlelight 🕯️', 'Paris theme 🗼', 'Heart balloons 💕', 'Wine & cheese 🍷', 'Starry night ✨'],
    'anniversary-romantic': ['Wedding flowers 💐', 'Gold accents ✨', 'Love birds 🕊️', 'Champagne 🥂', 'Sunset beach 🌅', 'Dancing silhouettes 💃'],
    'anniversary-funny': ['Pizza hearts 🍕', 'Couch & TV 📺', 'Snoring bears 🐻', 'Gaming couple 🎮', 'Messy kitchen 👨‍🍳', 'Cat chaos 🐱'],
    'thank-you-professional': ['Elegant gold 🏆', 'Office plants 🌿', 'Coffee cups ☕', 'Clean lines', 'Navy & silver', 'Minimalist'],
    'thank-you-heartfelt': ['Wildflowers 🌻', 'Warm colors 🧡', 'Handwritten feel ✍️', 'Sunshine ☀️', 'Hugging bears 🐻', 'Rainbow hearts 🌈'],
    'holiday-funny': ['Ugly sweaters 🎅', 'Cookie chaos 🍪', 'Tangled lights 💡', 'Reindeer antics 🦌', 'Snowman party ⛄', 'Gift mountains 🎁'],
    'holiday-heartfelt': ['Cozy fireplace 🔥', 'Snow globes ❄️', 'Pine trees 🎄', 'Hot cocoa ☕', 'Family table 🕯️', 'Gingerbread 🏠'],
    'congratulations-professional': ['Trophy gold 🏆', 'Confetti burst 🎊', 'Success stairs 📈', 'Champagne pop 🍾', 'Star badges ⭐', 'Laurel wreaths 🌿'],
    'congratulations-funny': ['Party animals 🦁', 'Explosion of joy 💥', 'Dancing fruits 🍌', 'Superhero cape 🦸', 'Fireworks crazy 🎆', 'Victory dance 🕺'],
    'sympathy-heartfelt': ['Soft clouds ☁️', 'White lilies 🤍', 'Gentle doves 🕊️', 'Watercolor sky', 'Peaceful garden', 'Soft light'],
    'get-well-funny': ['Bandaid army 🩹', 'Soup squadron 🍲', 'Vitamin warriors 💊', 'Healing ninjas 🥷', 'Happy germs 🦠', 'Super tissues 🤧'],
    'get-well-heartfelt': ['Healing flowers 🌷', 'Sunny days ☀️', 'Tea & honey 🍯', 'Soft blankets 🛏️', 'Get well balloons 🎈', 'Hearts & hugs 💕'],
  };

  const key = `${cardType}-${tone}`;
  return chips[key] || chips[cardType + '-heartfelt'] || ['Colorful design', 'Nature theme 🌿', 'Abstract art', 'Vintage style'];
};

// AI brainstorming prompts - focused on visual design elements
const getBrainstormPrompt = (cardType: string, tone: string, recipient?: string, photoContext?: string) => {
  const recipientText = recipient ? `for ${recipient}` : '';
  const photoText = photoContext ? `\n\n${photoContext}. Include these specific people in creative and imaginative ways. IMPORTANT: Only feature the people mentioned above - do not add any additional people, babies, children, or characters unless explicitly requested.` : '';
  
  return `Generate 4 visual design suggestions for personalizing a ${tone} ${cardType} card ${recipientText}.${photoText}
  
  Focus on interests/activities that translate to visual elements, color schemes, themes, artistic styles, or specific imagery.
  Each suggestion should be 15-25 words describing what visual elements to include in the card artwork.
  
  Examples of good visual suggestions:
  - "Mountain skiing scenes with hot chocolate, cozy lodge vibes, snowflakes, pine trees"
  - "Coffee shop aesthetic with latte art, books, plants, warm browns and creams"
  - "Beach volleyball at sunset, surfboards, tropical flowers, ocean blues and coral colors"
  - "Vintage travel theme with maps, passport stamps, airplanes, suitcases in retro colors"
  
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
                🎨 Click any visual theme to add it:
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