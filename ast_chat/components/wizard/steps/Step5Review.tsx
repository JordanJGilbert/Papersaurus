"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Edit, Clock } from "lucide-react";
import { CardFormData } from "@/hooks/useCardForm";
import { Separator } from "@/components/ui/separator";

interface Step5Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  isGenerating?: boolean;
  isGeneratingFinalCard?: boolean;
  isGeneratingMessage?: boolean;
  generationProgress?: string;
  progressPercentage?: number;
  currentElapsedTime?: number;
  isDraftMode?: boolean;
  draftCards?: any[];
  formatGenerationTime?: (seconds: number) => string;
  onGenerateCard?: () => void;
  onGenerateDraftCards?: () => void;
}

export default function Step5Review({ 
  formData, 
  updateFormData, 
  onStepComplete, 
  isGenerating, 
  isGeneratingFinalCard,
  isGeneratingMessage,
  generationProgress,
  progressPercentage = 0,
  currentElapsedTime = 0,
  isDraftMode = false,
  draftCards = [],
  formatGenerationTime,
  onGenerateCard,
  onGenerateDraftCards 
}: Step5Props) {
  const [isReady, setIsReady] = useState(false);

  // Mark step as complete when user is ready to generate
  useEffect(() => {
    if (isReady && onStepComplete) {
      onStepComplete();
    }
  }, [isReady, onStepComplete]);

  // Auto-mark as ready since this is just the generation step
  useEffect(() => {
    setIsReady(true);
  }, []);

  if (isGenerating) {
    return (
      <div className="space-y-6">
        {/* Generation Progress */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Creating Your Card
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {generationProgress || "Generating your personalized card..."}
            </p>
          </div>
        </div>

        {/* Enhanced Progress Bar */}
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="space-y-3">
            {/* Progress Message */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {generationProgress || "Generating your card..."}
              </span>
            </div>

            {/* Clean Progress Bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>

            {/* Progress Text and Time Display */}
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">
                {Math.round(progressPercentage)}% Complete
              </span>
              <div className="flex items-center gap-3">
                {currentElapsedTime > 0 && formatGenerationTime && (
                  <span className="text-blue-600 dark:text-blue-400">
                    ⏱️ {formatGenerationTime(currentElapsedTime)}
                  </span>
                )}
                <span className="text-gray-500">
                  {isDraftMode && !isGeneratingFinalCard ? '~30-60 sec expected' : '~1:30-2:00 min expected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Summary During Generation */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Generating:</h4>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {formData.selectedType === "custom" ? formData.customCardType : formData.selectedType} card
            {formData.selectedTone && ` with ${formData.selectedTone} tone`}
            {formData.referenceImageUrls?.length > 0 && ` • ${formData.referenceImageUrls.length} reference photo${formData.referenceImageUrls.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          Ready to Create Your Card?
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Choose how you'd like to generate your personalized greeting card
        </p>
      </div>

      {/* Draft Mode Description */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg">🎨</span>
          </div>
          <div>
            <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
              Draft Mode (Recommended)
            </h4>
            <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
              Generate 5 different front cover designs quickly, then pick your favorite for complete high-quality card generation.
              {formData.selectedArtisticStyle === "ai-smart-style" && (
                <span className="font-medium"> With Smart Style, you'll see your card in 5 curated artistic styles!</span>
              )}
            </p>
            <ul className="text-xs text-purple-600 dark:text-purple-400 space-y-1">
              <li>• ⚡ Fast preview generation (~30-60 seconds)</li>
              <li>• 🎯 Choose your favorite design before final generation</li>
              <li>• 💎 Final card in high quality (~1-2 minutes)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Generation Buttons */}
      <div className="space-y-4">
        {/* Draft Mode Button */}
        <button
          onClick={onGenerateDraftCards}
          disabled={isGenerating || isGeneratingMessage || !formData.userEmail?.trim()}
          className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Creating 5 design options...</span>
            </>
          ) : (
            <>
              <span className="text-lg">🎨</span>
              <span>Create 5 Front Cover Options</span>
            </>
          )}
        </button>

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          or
        </div>

        {/* Direct Generation Button */}
        <button
          onClick={onGenerateCard}
          disabled={isGenerating || isGeneratingMessage || !formData.userEmail?.trim()}
          className="w-full h-10 border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-lg">✨</span>
          <span>Direct Generation</span>
        </button>
      </div>

      {/* Requirements Check */}
      {!formData.userEmail?.trim() && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <span className="text-amber-600">⚠️</span>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Please enter your email address in the previous steps to generate your card.
            </p>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">💡 Generation Tips:</h4>
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <li>• Draft Mode is recommended for first-time users</li>
          <li>• Generation typically takes 1-3 minutes depending on complexity</li>
          <li>• You can safely leave this page during generation</li>
          {formData.referenceImageUrls?.length > 0 && (
            <li>• Your {formData.referenceImageUrls.length} reference photo{formData.referenceImageUrls.length > 1 ? 's' : ''} will be used for character creation</li>
          )}
        </ul>
      </div>
    </div>
  );
} 