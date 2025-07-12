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

// Contextual inspiration chips based on card type and tone - now focused on personal details
const getInspirationChips = (cardType: string, tone: string): string[] => {
  const chips: Record<string, string[]> = {
    'birthday-funny': ['Coffee lover ☕', 'Dog person 🐕', 'Gamer 🎮', 'Always late ⏰', 'Dad jokes', 'Netflix addict 📺'],
    'birthday-heartfelt': ['Family oriented 👨‍👩‍👧‍👦', 'Nature lover 🌿', 'Bookworm 📚', 'Music lover 🎵', 'Travel memories ✈️', 'Childhood friend'],
    'birthday-romantic': ['First date spot 💕', 'Our song 🎵', 'Inside jokes 😄', 'Pet names', 'Anniversary trip', 'Favorite restaurant 🍽️'],
    'anniversary-romantic': ['Wedding memories 💍', 'First date', 'Our favorite place', 'Inside jokes 😄', 'Pet together 🐾', 'Travel adventures ✈️'],
    'anniversary-funny': ['Still tolerates me', 'Pizza nights 🍕', 'Netflix arguments', 'Snoring champion', 'Bad cooking', 'Game nights 🎲'],
    'thank-you-professional': ['Great mentor', 'Team player', 'Problem solver', 'Always helpful', 'Goes extra mile', 'Inspiring leader'],
    'thank-you-heartfelt': ['Always there', 'Best friend', 'Life saver', 'Kind heart', 'Great listener', 'True support'],
    'holiday-funny': ['Holiday movies 🎬', 'Cookie monster 🍪', 'Gift wrapper fail', 'Ugly sweater champ', 'Carol singer', 'Light untangler'],
    'holiday-heartfelt': ['Family traditions', 'Baking together 🧁', 'Decorating memories', 'Cozy nights', 'Holiday recipes', 'Annual photos'],
    'congratulations-professional': ['Hard worker', 'Goal crusher', 'Team leader', 'Innovation driver', 'Detail oriented', 'Results focused'],
    'congratulations-funny': ['Finally did it!', 'Overachiever', 'Boss mode 💪', 'Killing it', 'Next level', 'Unstoppable'],
    'sympathy-heartfelt': ['Cherished memories', 'Always remembered', 'Special moments', 'Legacy lives on', 'Forever loved', 'Beautiful soul'],
    'get-well-funny': ['Tough cookie 🍪', 'Fighter spirit', 'Bounce back champ', 'Too stubborn to quit', 'Superhero mode', 'Healing vibes'],
    'get-well-heartfelt': ['Stay strong', 'Thinking of you', 'Sending love', 'Get rest', 'Take care', 'Here for you'],
  };

  const key = `${cardType}-${tone}`;
  return chips[key] || chips[cardType + '-heartfelt'] || ['Loves life', 'Great friend', 'Always smiling', 'Kind soul'];
};

// AI brainstorming prompts - now focused on personal details
const getBrainstormPrompt = (cardType: string, tone: string, recipient?: string, photoContext?: string) => {
  const recipientText = recipient ? `for ${recipient}` : '';
  const photoText = photoContext ? `\n\n${photoContext}. Include these specific people in creative and imaginative ways. IMPORTANT: Only feature the people mentioned above - do not add any additional people, babies, children, or characters unless explicitly requested.` : '';
  
  return `Generate 4 personal detail suggestions that someone might include when creating a ${tone} ${cardType} card ${recipientText}.${photoText}
  
  Focus on interests, hobbies, personality traits, favorite things, shared memories, or activities they enjoy.
  Each suggestion should be 15-25 words and include specific personal details that would make the card more meaningful.
  
  Examples of good suggestions:
  - "Loves hiking on weekends, collects vintage vinyl records, makes the best homemade pasta"
  - "Coffee addict who never misses morning yoga, has two rescue dogs named Max and Luna"
  - "Our weekly sushi dates, that time we got lost in Paris, your terrible dad jokes"
  
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
        'Loves morning coffee, weekend hikes with the dog, and collecting succulents for the apartment',
        'Board game enthusiast, makes amazing chocolate chip cookies, always has the best book recommendations',
        'Our Sunday brunch tradition, terrible at karaoke but does it anyway, gives the best hugs',
        'Marathon runner, sushi connoisseur, has traveled to 15 countries and counting'
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