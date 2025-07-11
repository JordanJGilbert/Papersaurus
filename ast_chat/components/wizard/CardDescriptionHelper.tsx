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
  photoAnalyses?: any[];
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
  const photoText = photoContext ? `\n\nIMPORTANT: The user has uploaded reference photos with the following context:\n${photoContext}\n\nIncorporate these specific people and elements into your suggestions.` : '';
  
  return `Generate 4 creative and specific card description ideas for a ${tone} ${cardType} card ${recipientText}.${photoText}
  Each idea should be 20-30 words long and paint a vivid picture with specific visual elements, themes, scenes, and artistic details.
  Make them detailed, unique and imaginative - not generic. Include colors, styles, compositions, and emotional elements.
  Return as a JSON array of strings.`;
};

export default function CardDescriptionHelper({ 
  formData, 
  onAddToDescription,
  chatWithAI,
  photoAnalyses = [] 
}: CardDescriptionHelperProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get contextual chips (including photo-aware suggestions)
  const inspirationChips = useMemo(() => {
    const baseChips = getInspirationChips(formData.selectedType, formData.selectedTone);
    
    // Add photo-specific chips if we have analyzed photos
    if (photoAnalyses && photoAnalyses.length > 0) {
      const photoChips: string[] = [];
      const selectedPeople = photoAnalyses.flatMap(analysis => 
        analysis.selectedPeople || []
      );
      
      if (selectedPeople.length > 0) {
        // Add people-based suggestions
        if (selectedPeople.length === 1) {
          const person = selectedPeople[0];
          const name = person.name || 'them';
          photoChips.push(`${name} portrait 🎨`);
          photoChips.push(`${name} in action`);
        } else {
          photoChips.push('group portrait 👥');
          photoChips.push('everyone together');
        }
        
        // Add activity/scene based suggestions if available
        const firstAnalysis = photoAnalyses[0];
        if (firstAnalysis?.backgroundDescription) {
          if (firstAnalysis.backgroundDescription.toLowerCase().includes('outdoor')) {
            photoChips.push('outdoor adventure 🌳');
          } else if (firstAnalysis.backgroundDescription.toLowerCase().includes('indoor')) {
            photoChips.push('cozy indoor scene 🏠');
          }
        }
      }
      
      // Combine photo chips with base chips, photo chips first
      return [...photoChips, ...baseChips].slice(0, 6); // Limit to 6 chips total
    }
    
    return baseChips;
  }, [formData.selectedType, formData.selectedTone, photoAnalyses]);

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
      // Build photo context from analyses
      let photoContext = '';
      if (photoAnalyses && photoAnalyses.length > 0) {
        const selectedPeople = photoAnalyses.flatMap(analysis => 
          analysis.selectedPeople || []
        );
        
        if (selectedPeople.length > 0) {
          // Build detailed context similar to message generation
          let contextParts = [];
          
          // Add people descriptions with all their details
          const peopleDetails = selectedPeople.map(person => {
            let description = person.name || person.positionDescription || person.description;
            if (person.relationshipToRecipient) {
              description += ` (${person.relationshipToRecipient})`;
            }
            
            // Add key characteristics
            const characteristics = [];
            if (person.apparentAge) characteristics.push(`${person.apparentAge} years old`);
            if (person.expression) characteristics.push(person.expression);
            if (person.distinguishingFeatures) characteristics.push(person.distinguishingFeatures);
            if (person.clothing) characteristics.push(`wearing ${person.clothing}`);
            
            if (characteristics.length > 0) {
              description += ` - ${characteristics.join(', ')}`;
            }
            
            return description;
          }).join('; ');
          
          contextParts.push(`People in photo: ${peopleDetails}`);
          
          // Add group relationship if specified
          const groupRelationships = photoAnalyses
            .filter(a => a.groupRelationship)
            .map(a => a.groupRelationship);
          if (groupRelationships.length > 0) {
            contextParts.push(`Group relationship: ${groupRelationships.join(', ')}`);
          }
          
          // Add setting and mood from first analysis
          const firstAnalysis = photoAnalyses[0];
          if (firstAnalysis?.analysisResult) {
            const result = firstAnalysis.analysisResult;
            if (result.setting) contextParts.push(`Setting: ${result.setting}`);
            if (result.overallMood) contextParts.push(`Mood: ${result.overallMood}`);
            if (result.backgroundDescription) contextParts.push(`Background: ${result.backgroundDescription}`);
          }
          
          // Add any special instructions
          const specialInstructions = photoAnalyses
            .filter(a => a.specialInstructions)
            .map(a => a.specialInstructions);
          if (specialInstructions.length > 0) {
            contextParts.push(`Special notes: ${specialInstructions.join('; ')}`);
          }
          
          photoContext = contextParts.join('\n');
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