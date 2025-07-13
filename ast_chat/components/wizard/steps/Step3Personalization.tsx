"use client";

import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CardFormData } from "@/hooks/useCardForm";
import { CheckCircle, ChevronDown } from "lucide-react";
import CardDescriptionHelper from "../CardDescriptionHelper";
import { chatWithAI } from "@/hooks/cardStudio/utils";
import { PhotoReference } from "@/hooks/cardStudio/constants";

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

  React.useEffect(() => {
    // Auto-complete step when style is selected and valid
    const isValid = formData.selectedArtisticStyle && 
      (formData.selectedArtisticStyle !== "custom" || formData.customStyleDescription.trim());
    
    if (isValid) {
      onStepComplete?.();
    }
  }, [formData.selectedArtisticStyle, formData.customStyleDescription, onStepComplete]);

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

      {/* Show confirmation if photos were uploaded in Step 1 */}
      {formData.referenceImageUrls.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-green-900 dark:text-green-100 mb-1">
                ✨ Reference photos uploaded!
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                {formData.referenceImageUrls.length} photo{formData.referenceImageUrls.length > 1 ? 's' : ''} will be used to create personalized cartoon characters
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Personal Traits Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            1. Personal Traits & Preferences
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Tell us about their interests - these will be woven into the card design
          </p>
          
          <div className="space-y-3">
            {/* Favorite Activities */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Favorite Activities
              </label>
              <input
                type="text"
                placeholder="e.g., skiing, hiking, yoga, gaming, reading"
                value={formData.favoriteActivities || ''}
                onChange={(e) => updateFormData({ favoriteActivities: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            
            {/* Favorite Foods */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Favorite Foods & Drinks
              </label>
              <input
                type="text"
                placeholder="e.g., sushi, coffee, craft beer, chocolate, tacos"
                value={formData.favoriteFoods || ''}
                onChange={(e) => updateFormData({ favoriteFoods: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            
            {/* Hobbies & Interests */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Hobbies & Interests
              </label>
              <input
                type="text"
                placeholder="e.g., travel, photography, gardening, music, sports"
                value={formData.hobbiesInterests || ''}
                onChange={(e) => updateFormData({ hobbiesInterests: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
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
            placeholder="Describe the scene for your card... or click 'Need ideas?' below to generate suggestions based on the personal traits above"
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
          <li>• <strong>Personalization:</strong> Add interests, activities, or specific design requests</li>
          <li>• <strong>Style Sampler:</strong> Preview your card in 5 different artistic styles</li>
          <li>• <strong>Custom Style:</strong> Describe exactly what artistic style you envision</li>
          <li>• Both fields work together to create your perfect card design</li>
        </ul>
      </div>
    </div>
  );
} 