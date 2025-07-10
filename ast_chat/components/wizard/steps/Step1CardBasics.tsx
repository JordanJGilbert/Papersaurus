"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CardFormData } from "@/hooks/useCardForm";
import { 
  Wrench, Cake, ThumbsUp, Heart, Trophy, TreePine, Stethoscope, 
  CloudRain, GraduationCap, Baby, Church, Gift, Home, MessageCircle, Eye,
  Image, Sparkles
} from "lucide-react";
import TemplateGallery from "../TemplateGallery";
import { useCardCache } from "@/hooks/useCardCache";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  backCover?: string;
  leftPage?: string;
  rightPage?: string;
  createdAt: Date;
  shareUrl?: string;
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  styleInfo?: {
    styleName?: string;
    styleLabel?: string;
  };
}

interface Step1Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  onTemplateSelect?: (template: GeneratedCard) => void;
}

// Card types with icons
const cardTypes = [
  { id: "custom", label: "Custom", description: "Create your own unique card type", icon: Wrench },
  { id: "birthday", label: "Birthday", description: "Celebrate another year of life", icon: Cake },
  { id: "thank-you", label: "Thank You", description: "Express gratitude and appreciation", icon: ThumbsUp },
  { id: "anniversary", label: "Anniversary", description: "Commemorate special milestones", icon: Heart },
  { id: "congratulations", label: "Congratulations", description: "Celebrate achievements and success", icon: Trophy },
  { id: "holiday", label: "Holiday", description: "Seasonal and holiday greetings", icon: TreePine },
  { id: "get-well", label: "Get Well Soon", description: "Send healing wishes and support", icon: Stethoscope },
  { id: "sympathy", label: "Sympathy", description: "Offer comfort during difficult times", icon: CloudRain },
  { id: "love", label: "Love & Romance", description: "Express romantic feelings", icon: Heart },
  { id: "graduation", label: "Graduation", description: "Celebrate educational achievements", icon: GraduationCap },
  { id: "new-baby", label: "New Baby", description: "Welcome new arrivals", icon: Baby },
  { id: "wedding", label: "Wedding", description: "Celebrate unions and marriages", icon: Church },
  { id: "retirement", label: "Retirement", description: "Honor career achievements", icon: Gift },
  { id: "housewarming", label: "Housewarming", description: "Welcome to new homes", icon: Home },
  { id: "apology", label: "Apology", description: "Make amends and seek forgiveness", icon: MessageCircle },
  { id: "thinking-of-you", label: "Thinking of You", description: "Show you care and remember", icon: Eye },
];

// Card tone/style options
const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted" },
  { id: "genz-humor", label: "💀 GenZ Humor", description: "Internet memes, chaotic energy, and unhinged vibes" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-appropriate" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly" },
  { id: "inspirational", label: "🌟 Inspirational", description: "Motivating and uplifting" },
  { id: "quirky", label: "🤪 Quirky", description: "Unique and unconventional" },
  { id: "traditional", label: "🎭 Traditional", description: "Classic and timeless" },
];

export default function Step1CardBasics({ formData, updateFormData, onStepComplete, onTemplateSelect }: Step1Props) {
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const { preloadAllCards } = useCardCache();
  
  // Preload template cache when component mounts
  useEffect(() => {
    preloadAllCards();
  }, []);

  React.useEffect(() => {
    // Auto-complete step when all required fields are filled
    if (formData.selectedType && formData.selectedTone && 
        (formData.selectedType !== "custom" || formData.customCardType.trim())) {
      onStepComplete?.();
    }
  }, [formData.selectedType, formData.selectedTone, formData.customCardType, onStepComplete]);

  const handleTemplateSelect = (template: GeneratedCard) => {
    onTemplateSelect?.(template);
    setShowTemplateGallery(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Template Gallery Option - Temporarily Hidden */}
      {/* TODO: Re-enable when AI-powered template extraction is implemented
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 sm:p-6 border border-purple-200 dark:border-purple-800">
        ... template content ...
      </div>
      */}

      {/* Card Type Selection */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full" />
          <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Card Type
          </label>
        </div>
        <Select 
          value={formData.selectedType} 
          onValueChange={(value) => updateFormData({ selectedType: value })}
        >
          <SelectTrigger className="h-12 sm:h-14 border-2 hover:border-blue-300 dark:hover:border-blue-700 transition-colors touch-manipulation text-base">
            <SelectValue>
              {(() => {
                const selected = cardTypes.find((type) => type.id === formData.selectedType);
                if (!selected) return <span className="text-gray-400">Choose card type</span>;
                const IconComponent = selected.icon;
                return (
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900 dark:to-cyan-900 rounded-lg flex items-center justify-center">
                      <IconComponent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {cardTypes.map((type) => {
              const IconComponent = type.icon;
              return (
                <SelectItem key={type.id} value={type.id} className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center">
                      <IconComponent className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{type.label}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{type.description}</div>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        
        {/* Custom Card Type Input */}
        {formData.selectedType === "custom" && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 animate-in slide-in-from-top-2 duration-300">
            <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-3 block flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Describe Your Custom Card Type
            </label>
            <Input
              placeholder="✨ E.g., 'Promotion at work', 'Moving away', 'First day of school'"
              value={formData.customCardType}
              onChange={(e) => updateFormData({ customCardType: e.target.value })}
              className="h-12 border-2 border-purple-300 dark:border-purple-700 focus:border-purple-500 dark:focus:border-purple-500 touch-manipulation"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
              What type of card is this? This helps personalize the message and style.
            </p>
          </div>
        )}
      </div>

      {/* Card Tone */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
          <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Card Tone & Style
          </label>
        </div>
        <Select 
          value={formData.selectedTone} 
          onValueChange={(value) => updateFormData({ selectedTone: value })}
        >
          <SelectTrigger className="h-12 sm:h-14 border-2 hover:border-purple-300 dark:hover:border-purple-700 transition-colors touch-manipulation text-base">
            <SelectValue>
              {(() => {
                const selected = cardTones.find((tone) => tone.id === formData.selectedTone);
                if (!selected) return <span className="text-gray-400">Choose card tone</span>;
                return (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {cardTones.map((tone) => (
              <SelectItem key={tone.id} value={tone.id}>
                <div>
                  <div className="font-medium">{tone.label}</div>
                  <div className="text-xs text-muted-foreground">{tone.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* To/From Fields */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 bg-gradient-to-b from-green-500 to-teal-500 rounded-full" />
          <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Personalization (Optional)
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              To (Optional)
            </label>
            <Input
              placeholder="🎯 To"
              value={formData.toField}
              onChange={(e) => updateFormData({ toField: e.target.value })}
              className="h-12 sm:h-14 touch-manipulation border-2 hover:border-green-300 dark:hover:border-green-700 transition-colors text-base"
              style={{ fontSize: '16px' }}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              From (Optional)
            </label>
            <Input
              placeholder="📝 From"
              value={formData.fromField}
              onChange={(e) => updateFormData({ fromField: e.target.value })}
              className="h-12 sm:h-14 touch-manipulation border-2 hover:border-green-300 dark:hover:border-green-700 transition-colors text-base"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Quick Tips - Mobile Optimized */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Tips</h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Pick your card type and tone</li>
          <li>• To/From fields help personalize</li>
          <li>• All fields are optional</li>
        </ul>
      </div>

      {/* Template Gallery Modal - Temporarily Hidden */}
      {/* TODO: Re-enable when AI-powered template extraction is implemented
      <TemplateGallery
        formData={formData}
        updateFormData={updateFormData}
        onTemplateSelect={handleTemplateSelect}
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
      />
      */}
    </div>
  );
} 