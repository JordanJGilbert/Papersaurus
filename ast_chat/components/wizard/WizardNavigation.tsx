"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles, Palette } from "lucide-react";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => boolean;
  canProceed: boolean;
  isGenerating: boolean;
  showGenerate: boolean;
  onGenerateCard?: () => void;
  onGenerateDraftCards?: () => void;
}

export default function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  canProceed,
  isGenerating,
  showGenerate,
  onGenerateCard,
  onGenerateDraftCards
}: WizardNavigationProps) {
  const handleNext = () => {
    const success = onNext();
    if (!success) {
      // Could show validation errors here
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Generate Buttons (Only on last step) */}
      {showGenerate && !isGenerating && (
        <div className="space-y-3">
          {/* Draft Mode Description */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-2">
              <Palette className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-purple-900 dark:text-purple-100">
                  🎨 Draft Mode (Recommended)
                </p>
                <p className="text-purple-700 dark:text-purple-300 text-xs mt-1">
                  Generate 5 different front cover designs quickly, then pick your favorite for complete high-quality card generation.
                </p>
              </div>
            </div>
          </div>
          
          {/* Draft Mode Button */}
          <Button
            onClick={onGenerateDraftCards}
            disabled={isGenerating || !canProceed}
            className="w-full h-12 transition-all duration-300 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            size="lg"
          >
            <Palette className="w-5 h-5 mr-2" />
            <span>Create 5 Front Cover Options</span>
          </Button>
          
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            or
          </div>
          
          {/* Direct Generation Button */}
          <Button
            onClick={onGenerateCard}
            disabled={isGenerating || !canProceed}
            variant="outline"
            className="w-full h-10 transition-all duration-300 border-blue-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            size="lg"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            <span>Direct Generation</span>
          </Button>
        </div>
      )}

      {/* Regular Navigation */}
      {!showGenerate && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={currentStep === 1 || isGenerating}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </Button>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            Step {currentStep} of {totalSteps}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed || isGenerating}
            className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Validation Message */}
      {!canProceed && !isGenerating && (
        <div className="text-center">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Please complete the required fields to continue
          </p>
        </div>
      )}
    </div>
  );
} 