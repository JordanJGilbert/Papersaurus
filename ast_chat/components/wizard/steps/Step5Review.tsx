"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Edit, Clock, CheckCircle, Sparkles } from "lucide-react";
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
  selectedDraftIndex?: number;
  formatGenerationTime?: (seconds: number) => string;
  onGenerateDraftCards?: () => void;
  onSelectDraft?: (index: number) => void;
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
  selectedDraftIndex = -1,
  formatGenerationTime,
  onGenerateDraftCards,
  onSelectDraft 
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

  // Simple state - no complex job checking needed
  // The parent component (useCardStudio) handles loading saved drafts
  
  // Simple mount log
  useEffect(() => {
    console.log('🔄 Step5Review mounted with:', {
      isGenerating,
      draftCardsLength: draftCards.length,
      isDraftMode
    });
  }, []);
  
  // Show loading state only if actively generating and no draft cards yet
  const shouldShowLoading = isGenerating && draftCards.length === 0;
  
  if (shouldShowLoading) {
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

  // Check if we should show draft selection vs generation
  const showDraftSelection = !isGenerating && draftCards.length === 0;
  
  return (
    <div className="space-y-6">
      {/* Header - only show if not generating */}
      {showDraftSelection && (
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Ready to Create Your Card?
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Choose how you'd like to generate your personalized greeting card
          </p>
        </div>
      )}

      {/* Draft Mode Description - only show when not generating */}
      {showDraftSelection && (
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm">🎨</span>
          </div>
          <div>
            <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-1">
              Draft Mode
            </h4>
            <p className="text-sm text-purple-700 dark:text-purple-300">
              Generate 5 designs, pick your favorite
              {formData.selectedArtisticStyle === "ai-smart-style" && (
                <span className="font-medium"> in curated styles</span>
              )}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Generation Buttons - Only show when no draft cards exist and not generating */}
      {showDraftSelection && draftCards.length === 0 && (
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
        </div>
      )}

      {/* Draft Cards Selection */}
      {draftCards.length > 0 && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isGenerating ? "Preview & Select as They're Ready!" : "Choose Your Favorite Design"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isGenerating 
                ? `${draftCards.length}/5 front cover variations complete... You can select one now to proceed!`
                : "5 front cover variations created with low quality for fast preview. Select your favorite to generate the complete high-quality card!"
              }
            </p>
          </div>
          
          {/* Progress Bar when still generating */}
          {isGenerating && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="space-y-3">
                {/* Progress Message */}
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    {generationProgress || "Generating remaining variations..."}
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
                      ~30-60 sec expected
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Draft cards display */}
          <div className="w-full">
            <div className="flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 snap-x snap-mandatory touch-pan-x">
              {Array.from({ length: 5 }, (_, displayIndex) => {
                const card = draftCards[displayIndex];
                const isLoading = !card;
                
                return (
                  <div
                    key={displayIndex}
                    className={`flex-shrink-0 w-52 sm:w-56 snap-center rounded-lg border-2 p-3 sm:p-3 transition-all cursor-pointer touch-manipulation ${
                      selectedDraftIndex === displayIndex
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                        : card
                        ? 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
                        : 'border-dashed border-gray-300 dark:border-gray-600'
                    }`}
                    onClick={() => card && onSelectDraft && onSelectDraft(displayIndex)}
                  >
                    {card ? (
                      <>
                        {/* Single front cover preview */}
                        <div className="aspect-[2/3] relative overflow-hidden rounded border mb-3">
                          <img
                            src={card.frontCover}
                            alt={`Design ${displayIndex + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {selectedDraftIndex === displayIndex && (
                            <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                              <div className="bg-white rounded-full p-2">
                                <CheckCircle className="w-8 h-8 text-purple-600" />
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Card info */}
                        <div className="text-center space-y-2">
                          <h4 className="font-medium text-sm">Design {displayIndex + 1}</h4>
                          {formData.selectedArtisticStyle === "ai-smart-style" && card.styleInfo && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {card.styleInfo.styleLabel}
                            </p>
                          )}
                          <div className="space-y-2">
                            {selectedDraftIndex === displayIndex && (
                              <div className="bg-purple-600 text-white text-xs px-3 py-1 rounded-full">
                                ✓ Selected
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add preview functionality if needed
                              }}
                              className="w-full text-xs h-9 touch-manipulation"
                            >
                              <span className="hidden sm:inline">Preview Design</span>
                              <span className="sm:hidden">Preview</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <h4 className="font-medium text-sm mb-1">Creating...</h4>
                        <p className="text-xs text-gray-500">Generating front cover...</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Selection indicator */}
            {selectedDraftIndex !== -1 && (
              <div className="text-center bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 mt-4">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  ✓ Design {selectedDraftIndex + 1} selected - ready to generate complete card!
                </p>
              </div>
            )}
            
            {/* Regenerate button */}
            {!isGenerating && draftCards.filter(Boolean).length === 5 && (
              <div className="text-center mt-4">
                <Button
                  variant="outline"
                  onClick={onGenerateDraftCards}
                  disabled={isGeneratingFinalCard}
                  className="h-10 px-4 text-sm"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerate New Designs
                </Button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Not happy with these? Generate 5 new variations
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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