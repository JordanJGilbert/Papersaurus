"use client";

import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CardFormData } from "@/hooks/useCardForm";
import { ChevronDown, MessageCircle } from "lucide-react";
import CardDescriptionHelper from "../CardDescriptionHelper";
import { chatWithAI } from "@/hooks/cardStudio/utils";
import { PhotoReference } from "@/hooks/cardStudio/constants";
import SceneChatInterface from "@/components/SceneChatInterface";

interface Step3Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  photoReferences?: PhotoReference[];
}

// Curated artistic styles
const artisticStyles = [
  {
    id: "ai-smart-style", 
    label: "🎯 Style Sampler (Recommended)", 
    description: "Preview your card in 5 curated styles - perfect for finding your favorite",
    color: "from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900",
    preview: "🎯"
  },
  {
    id: "custom", 
    label: "✨ Custom Style", 
    description: "Define your own unique artistic style",
    color: "from-violet-100 to-purple-100 dark:from-violet-900 dark:to-purple-900",
    preview: "🎯"
  },
  { 
    id: "watercolor", 
    label: "🎨 Watercolor", 
    description: "Soft, flowing paint effects (our personal favorite)",
    color: "from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900",
    preview: "🎨"
  },
  {
    id: "minimalist", 
    label: "✨ Minimalist", 
    description: "Clean, simple, elegant design",
    color: "from-gray-100 to-slate-100 dark:from-gray-900 dark:to-slate-900",
    preview: "◯"
  },
  { 
    id: "botanical", 
    label: "🌿 Botanical", 
    description: "Beautiful flowers and nature elements",
    color: "from-green-100 to-emerald-100 dark:from-green-900 dark:to-emerald-900",
    preview: "🌿"
  },
  { 
    id: "comic-book", 
    label: "💥 Comic Book", 
    description: "Bold graphic novel style",
    color: "from-yellow-100 to-red-100 dark:from-yellow-900 dark:to-red-900",
    preview: "💥"
  },
  { 
    id: "dreamy-fantasy", 
    label: "🌸 Dreamy Fantasy", 
    description: "Enchanting anime-inspired art",
    color: "from-pink-100 to-purple-100 dark:from-pink-900 dark:to-purple-900",
    preview: "🌸"
  },
  {
    id: "modern-geometric", 
    label: "🔷 Modern Geometric", 
    description: "Clean contemporary shapes",
    color: "from-indigo-100 to-blue-100 dark:from-indigo-900 dark:to-blue-900",
    preview: "🔷"
  },
];

export default function Step3Personalization({ 
  formData, 
  updateFormData, 
  onStepComplete,
  photoReferences = []
}: Step3Props) {
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [showSceneChat, setShowSceneChat] = useState(false);

  React.useEffect(() => {
    // Auto-complete step when style is selected and valid
    const isValid = formData.selectedArtisticStyle && 
      (formData.selectedArtisticStyle !== "custom" || formData.customStyleDescription.trim());
    
    if (isValid) {
      onStepComplete?.();
    }
  }, [formData.selectedArtisticStyle, formData.customStyleDescription, onStepComplete]);

  // Handler for chat-based scene generation
  const handleChatSceneGeneration = async (userInput: string, conversationHistory: any[]): Promise<string> => {
    // Build context from conversation history
    const conversationContext = conversationHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    // Build personal traits context
    const traitsText = formData.personalTraits ? `\n\nPersonal traits and interests: ${formData.personalTraits}` : '';
    
    // Build photo context
    let photoContext = '';
    if (photoReferences && photoReferences.length > 0) {
      const photosWithDescriptions = photoReferences.filter(ref => ref.description && ref.description.trim() !== '');
      if (photosWithDescriptions.length > 0) {
        const descriptions = photosWithDescriptions.map(ref => ref.description).join(', ');
        photoContext = `\n\nThe card should include ${descriptions}. IMPORTANT: Only feature the people mentioned - do not add any additional people unless explicitly requested.`;
      }
    }

    const prompt = `You are a creative scene designer for greeting cards. You're having a conversation with someone to help them create the perfect scene for their ${formData.selectedType || 'greeting'} card with a ${formData.selectedTone || 'heartfelt'} tone.

Previous conversation:
${conversationContext}

User's current request: "${userInput}"${traitsText}${photoContext}

Based on the conversation context and the user's request, generate a complete scene description (20-30 words) that:
1. Addresses their specific request
2. Incorporates any personal traits mentioned
3. Maintains the ${formData.selectedTone || 'heartfelt'} tone
4. Creates a cohesive visual narrative

If the user is asking for variations or changes, build upon previous suggestions while addressing their feedback.

Respond naturally as if continuing the conversation, then provide the scene description.`;

    try {
      const response = await chatWithAI(prompt, {
        model: 'gemini-2.5-pro'
      });
      
      return response || "I'll help you create a beautiful scene. Could you tell me more about what you envision?";
    } catch (error) {
      console.error('Error generating scene:', error);
      return "I'll help you create a beautiful scene. Could you tell me more about what you envision?";
    }
  };

  // If showing chat interface, render it instead of the regular form
  if (showSceneChat) {
    return (
      <SceneChatInterface
        formData={formData}
        onSceneSelect={(scene) => {
          updateFormData({ prompt: scene });
          setShowSceneChat(false);
        }}
        onGenerateScene={handleChatSceneGeneration}
        onClose={() => setShowSceneChat(false)}
        photoReferences={photoReferences}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Artistic Style Selection */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Artistic Style
        </label>
        <Select 
          value={formData.selectedArtisticStyle} 
          onValueChange={(value) => updateFormData({ selectedArtisticStyle: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose artistic style">
              {(() => {
                const selected = artisticStyles.find((style) => style.id === formData.selectedArtisticStyle);
                if (!selected) return <span className="text-gray-400">Choose artistic style</span>;
                return (
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm`}>
                      <span className="text-lg">{selected.preview}</span>
                    </div>
                    <span className="font-medium">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]">
            {artisticStyles.map((style) => (
              <SelectItem key={style.id} value={style.id} className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 max-w-full">
                <div className="flex items-center gap-3 py-1 w-full">
                  <div className={`w-10 h-10 flex-shrink-0 bg-gradient-to-br ${style.color} rounded-lg flex items-center justify-center shadow-sm`}>
                    <span className="text-xl">{style.preview}</span>
                  </div>
                  <div className="flex-1 text-left min-w-0 overflow-hidden">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{style.label}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 break-words whitespace-normal pr-2">{style.description}</div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Custom Style Description */}
        {formData.selectedArtisticStyle === "custom" && (
          <div className="mt-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Describe Your Custom Style
            </label>
            <Textarea
              placeholder="e.g., in vintage 1920s art deco style with gold accents and geometric patterns..."
              value={formData.customStyleDescription}
              onChange={(e) => updateFormData({ customStyleDescription: e.target.value })}
              rows={3}
              className="resize-none"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Describe the artistic style you want for your card (colors, techniques, era, mood, etc.)
            </p>
          </div>
        )}
      </div>


      {/* Personal Traits Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            1. Personal Traits & Interests
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Share what they love - these details will be woven into your card's artwork
          </p>
          
          <Textarea
            placeholder="Tell me about their interests! For example:
• Loves skiing, craft beer, and cozy mountain lodges
• Enjoys sushi, yoga, and beach sunsets
• Into gaming, pizza, and sci-fi movies
• Passionate about gardening, tea, and reading mysteries"
            value={formData.personalTraits || ''}
            onChange={(e) => updateFormData({ personalTraits: e.target.value })}
            rows={4}
            className="resize-none"
            style={{ fontSize: '16px' }}
          />
        </div>
        
        {/* Scene Description Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            2. Create Your Scene
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Describe the scene you envision, or use the button below for AI-powered suggestions
          </p>
          
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Scene Description
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
                className="gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                {isTextareaExpanded ? (
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
              
              {/* AI Chat Interface Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSceneChat(true)}
                className="gap-1.5 text-xs bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="font-medium">AI Chat</span>
              </Button>
            </div>
          </div>
          
          <Textarea
            placeholder={
              formData.personalTraits
                ? "Click 'Need scene ideas?' to generate creative scenes based on the traits above, or describe your own..."
                : "Describe the scene for your card... or add some personal traits above first for better suggestions"
            }
            value={formData.prompt}
            onChange={(e) => updateFormData({ prompt: e.target.value })}
            rows={isTextareaExpanded ? 6 : 3}
            className={isTextareaExpanded ? "resize-y" : "resize-none"}
            style={{ fontSize: '16px' }}
          />
          
          {/* Card Description Helper */}
          <CardDescriptionHelper
            formData={formData}
            onAddToDescription={(text) => updateFormData({ prompt: text })}
            chatWithAI={chatWithAI}
            photoReferences={photoReferences}
            fromField={formData.fromField}
            relationshipField={formData.relationshipField}
          />
          
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            💡 <strong>How it works:</strong> Everything you write here becomes visual elements in your card's artwork
          </p>
        </div>
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
        <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">🎨 Visual Design Tips</h4>
        <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
          <li>• <strong>Step 1:</strong> Add their favorite activities, foods, and hobbies</li>
          <li>• <strong>Step 2:</strong> Click "Need scene ideas?" for AI-powered creative scenes</li>
          <li>• <strong>The Magic:</strong> AI combines all traits into unique, personalized card designs</li>
          <li>• <strong>Style Options:</strong> Choose from curated styles or create your own</li>
        </ul>
      </div>
    </div>
  );
} 