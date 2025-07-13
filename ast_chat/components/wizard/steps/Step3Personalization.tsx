"use client";

import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CardFormData } from "@/hooks/useCardForm";
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

  React.useEffect(() => {
    // Auto-complete step when style is selected (personal traits are optional)
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


      {/* Personal Traits Section */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          What Do They Love? <span className="text-gray-500 font-normal">(Optional)</span>
        </label>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Share their interests and favorites - our AI will create a personalized scene from these details
        </p>
          
        <Textarea
          placeholder={`• Loves skiing, craft beer, and cozy mountain lodges
• Enjoys sushi, yoga, and beach sunsets
• Into gaming, pizza, and sci-fi movies
• Passionate about gardening, tea, and reading mysteries`}
          value={formData.personalTraits || ''}
          onChange={(e) => updateFormData({ personalTraits: e.target.value })}
          rows={5}
          className="resize-none"
          style={{ fontSize: '16px' }}
        />
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          💡 <strong>The magic:</strong> AI combines these traits with your chosen style to create unique, personalized artwork. Skip this field for a general design.
        </p>
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
        <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">🎨 How It Works</h4>
        <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
          <li>• <strong>Personal Touch (Optional):</strong> Add their favorite activities, foods, hobbies, and interests</li>
          <li>• <strong>AI Magic:</strong> Our AI automatically creates personalized scenes from these details</li>
          <li>• <strong>Style Selection (Required):</strong> Choose an artistic style for your card</li>
          <li>• <strong>Result:</strong> A beautiful card - either personalized with their interests or a general design</li>
        </ul>
      </div>
    </div>
  );
} 