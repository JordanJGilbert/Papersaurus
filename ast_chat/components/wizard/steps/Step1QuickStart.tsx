"use client";

import React, { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardFormData } from "@/hooks/useCardForm";
import { 
  Wrench, Cake, ThumbsUp, Heart, Trophy, TreePine, Stethoscope, 
  CloudRain, GraduationCap, Baby, Church, Gift, Home, MessageCircle, Eye,
  Wand2, Play, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  cardHistory?: any;
  onResumeDraft?: (sessionId: string) => void;
  onTemplateSelect?: (template: GeneratedCard) => void;
}

// Card types with icons
const cardTypes = [
  { id: "custom", label: "Custom", description: "Create your own", icon: Wrench, emoji: "✨", color: "from-purple-100 to-purple-200 dark:from-purple-900 dark:to-purple-800" },
  { id: "birthday", label: "Birthday", description: "Celebrate another year of life", icon: Cake, emoji: "🎂", color: "from-pink-100 to-pink-200 dark:from-pink-900 dark:to-pink-800" },
  { id: "thank-you", label: "Thank You", description: "Express gratitude", icon: ThumbsUp, emoji: "🙏", color: "from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800" },
  { id: "anniversary", label: "Anniversary", description: "Commemorate special milestones", icon: Heart, emoji: "💑", color: "from-red-100 to-red-200 dark:from-red-900 dark:to-red-800" },
  { id: "congratulations", label: "Congratulations", description: "Celebrate achievements", icon: Trophy, emoji: "🎉", color: "from-yellow-100 to-yellow-200 dark:from-yellow-900 dark:to-yellow-800" },
  { id: "holiday", label: "Holiday", description: "Seasonal and holiday greetings", icon: TreePine, emoji: "🎄", color: "from-green-100 to-green-200 dark:from-green-900 dark:to-green-800" },
  { id: "get-well", label: "Get Well Soon", description: "Send healing wishes", icon: Stethoscope, emoji: "💐", color: "from-teal-100 to-teal-200 dark:from-teal-900 dark:to-teal-800" },
  { id: "sympathy", label: "Sympathy", description: "Offer comfort", icon: CloudRain, emoji: "🕊️", color: "from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700" },
  { id: "love", label: "Love & Romance", description: "Express romantic feelings", icon: Heart, emoji: "💕", color: "from-rose-100 to-rose-200 dark:from-rose-900 dark:to-rose-800" },
  { id: "graduation", label: "Graduation", description: "Academic achievements", icon: GraduationCap, emoji: "🎓", color: "from-indigo-100 to-indigo-200 dark:from-indigo-900 dark:to-indigo-800" },
  { id: "new-baby", label: "New Baby", description: "Welcome new arrivals", icon: Baby, emoji: "👶", color: "from-cyan-100 to-cyan-200 dark:from-cyan-900 dark:to-cyan-800" },
  { id: "wedding", label: "Wedding", description: "Celebrate unions and marriages", icon: Church, emoji: "💒", color: "from-violet-100 to-violet-200 dark:from-violet-900 dark:to-violet-800" },
  { id: "retirement", label: "Retirement", description: "Honor career achievements", icon: Gift, emoji: "🎁", color: "from-amber-100 to-amber-200 dark:from-amber-900 dark:to-amber-800" },
  { id: "housewarming", label: "Housewarming", description: "Welcome to new homes", icon: Home, emoji: "🏡", color: "from-orange-100 to-orange-200 dark:from-orange-900 dark:to-orange-800" },
  { id: "apology", label: "Apology", description: "Make amends", icon: MessageCircle, emoji: "🙏", color: "from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800" },
  { id: "thinking-of-you", label: "Thinking of You", description: "Show you care and remember", icon: Eye, emoji: "💭", color: "from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-800" },
];

// Card tone/style options
const cardTones = [
  { id: "funny", label: "😄 Funny", description: "Humorous and lighthearted", color: "from-yellow-100 to-orange-100 dark:from-yellow-900 dark:to-orange-900" },
  { id: "genz-humor", label: "💀 GenZ Humor", description: "Memes and chaotic vibes", color: "from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900" },
  { id: "romantic", label: "💕 Romantic", description: "Sweet and loving", color: "from-pink-100 to-rose-100 dark:from-pink-900 dark:to-rose-900" },
  { id: "professional", label: "👔 Professional", description: "Formal and business-ready", color: "from-slate-100 to-gray-100 dark:from-slate-900 dark:to-gray-900" },
  { id: "heartfelt", label: "❤️ Heartfelt", description: "Sincere and emotional", color: "from-red-100 to-pink-100 dark:from-red-900 dark:to-pink-900" },
  { id: "playful", label: "🎉 Playful", description: "Fun and energetic", color: "from-cyan-100 to-blue-100 dark:from-cyan-900 dark:to-blue-900" },
  { id: "elegant", label: "✨ Elegant", description: "Sophisticated and refined", color: "from-violet-100 to-indigo-100 dark:from-violet-900 dark:to-indigo-900" },
  { id: "casual", label: "😊 Casual", description: "Relaxed and friendly", color: "from-green-100 to-teal-100 dark:from-green-900 dark:to-teal-900" },
  { id: "inspirational", label: "🌟 Inspirational", description: "Motivating and uplifting", color: "from-amber-100 to-yellow-100 dark:from-amber-900 dark:to-yellow-900" },
  { id: "quirky", label: "🤪 Quirky", description: "Unique and unconventional", color: "from-lime-100 to-emerald-100 dark:from-lime-900 dark:to-emerald-900" },
  { id: "traditional", label: "🎭 Traditional", description: "Classic and timeless", color: "from-stone-100 to-amber-100 dark:from-stone-900 dark:to-amber-900" },
];

export default function Step1QuickStart({ 
  formData, 
  updateFormData, 
  onStepComplete,
  cardHistory,
  onResumeDraft,
  onTemplateSelect
}: Step1Props) {
  const [showCustomInput, setShowCustomInput] = useState(formData.selectedType === "custom");

  // Check for recent draft
  const hasRecentDraft = cardHistory?.sessions?.some((session: any) => 
    session.status === 'draft' && session.draftCards?.length > 0
  );
  
  const mostRecentDraft = hasRecentDraft ? 
    cardHistory.sessions.find((session: any) => 
      session.status === 'draft' && session.draftCards?.length > 0
    ) : null;

  // Validate step completion
  useEffect(() => {
    const isComplete = formData.selectedType && formData.selectedTone && 
      (formData.selectedType !== "custom" || formData.customCardType);
    if (isComplete) {
      onStepComplete?.();
    }
  }, [formData.selectedType, formData.selectedTone, formData.customCardType, onStepComplete]);

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      {/* Resume Draft Section */}
      {hasRecentDraft && onResumeDraft && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-4 sm:p-6 border border-purple-200 dark:border-purple-800">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              {mostRecentDraft.draftCards[0]?.frontCover ? (
                <img 
                  src={mostRecentDraft.draftCards[0].frontCover} 
                  alt="Recent draft"
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover shadow-md"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-purple-100 dark:bg-purple-800 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-purple-600 dark:text-purple-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Resume Your Recent Draft
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {mostRecentDraft.title || 'Untitled Draft'} • {
                  new Date(mostRecentDraft.lastModified).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                }
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => onResumeDraft(mostRecentDraft.id)}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Resume Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Just continue with new card - do nothing
                  }}
                >
                  Start Fresh
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Card Type Section */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          What type of card?
        </label>
        <Select 
          value={formData.selectedType} 
          onValueChange={(value) => {
            updateFormData({ selectedType: value });
            setShowCustomInput(value === "custom");
          }}
        >
          <SelectTrigger className="w-full h-auto py-3 px-4">
            <SelectValue placeholder="Select card type">
              {(() => {
                const selected = cardTypes.find(t => t.id === formData.selectedType);
                if (!selected) return null;
                return (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                      <span className="text-sm sm:text-lg">{selected.emoji}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100 text-sm sm:text-base">{selected.label}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px] w-full" position="popper" sideOffset={5}>
            {cardTypes.map((type) => {
              const IconComponent = type.icon;
              return (
                <SelectItem key={type.id} value={type.id} className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <div className="flex items-center gap-3 py-1">
                    <div className={`w-10 h-10 bg-gradient-to-br ${type.color} rounded-lg flex items-center justify-center shadow-sm`}>
                      <span className="text-xl">{type.emoji}</span>
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
        {showCustomInput && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 animate-in slide-in-from-top-2 duration-300">
            <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-3 block flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Describe your custom card type
            </label>
            <Textarea
              placeholder="E.g., Job promotion, Moving away, Friendship anniversary, Pet adoption..."
              value={formData.customCardType || ""}
              onChange={(e) => updateFormData({ customCardType: e.target.value })}
              className="min-h-[80px] text-base bg-white dark:bg-gray-900"
              style={{ fontSize: '16px' }}
            />
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
              Be specific! We'll create a unique card just for this occasion.
            </p>
          </div>
        )}
      </div>

      {/* Card Tone Section */}
      <div className="space-y-3 sm:space-y-4 w-full">
        <label className="text-base font-semibold text-gray-800 dark:text-gray-200 px-1">
          What tone should it have?
        </label>
        <Select 
          value={formData.selectedTone} 
          onValueChange={(value) => updateFormData({ selectedTone: value })}
        >
          <SelectTrigger className="w-full h-auto py-3 px-4">
            <SelectValue placeholder="Select card tone">
              {(() => {
                const selected = cardTones.find(t => t.id === formData.selectedTone);
                if (!selected) return null;
                return (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className={`w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br ${selected.color} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                      <span className="text-sm sm:text-base">{selected.label.split(' ')[0]}</span>
                    </div>
                    <span className="font-medium text-sm sm:text-base">{selected.label.split(' ').slice(1).join(' ')}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px] w-full" position="popper" sideOffset={5}>
            {cardTones.map((tone) => (
              <SelectItem key={tone.id} value={tone.id} className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20">
                <div className="flex items-center gap-3 py-1">
                  <div className={`w-10 h-10 bg-gradient-to-br ${tone.color} rounded-lg flex items-center justify-center shadow-sm`}>
                    <span className="text-xl">{tone.label.split(' ')[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{tone.label.split(' ').slice(1).join(' ')}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{tone.description}</div>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tips - Mobile Optimized */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 sm:p-6 border border-indigo-200 dark:border-indigo-800">
        <h3 className="font-semibold text-base text-indigo-900 dark:text-indigo-100 mb-3">
          ✨ Quick Tips
        </h3>
        <ul className="space-y-2 text-sm text-indigo-800 dark:text-indigo-200">
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">•</span>
            <span>Choose the card type that best matches your occasion</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">•</span>
            <span>The tone sets the mood - funny for laughs, heartfelt for emotions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">•</span>
            <span>Can't find your occasion? Select "Custom" and describe it!</span>
          </li>
        </ul>
      </div>
    </div>
  );
}