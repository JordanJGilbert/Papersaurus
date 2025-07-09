"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => boolean;
  canProceed: boolean;
  isGenerating: boolean;
}

export default function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  canProceed,
  isGenerating
}: WizardNavigationProps) {
  const handleNext = () => {
    const success = onNext();
    if (!success) {
      // Could show validation errors here
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Validation Message - Show at top for mobile */}
      {!canProceed && !isGenerating && (
        <div className="text-center px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Please complete the required fields to continue
          </p>
        </div>
      )}

      {/* Mobile Navigation - Full width buttons */}
      <div className="flex flex-col sm:hidden gap-3">
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Step {currentStep} of {totalSteps}
        </div>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onPrevious}
            disabled={currentStep === 1 || isGenerating}
            className="flex-1 gap-2 h-12 px-4 touch-manipulation text-base"
          >
            <ArrowLeft className="w-5 h-5" />
            Previous
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed || isGenerating}
            className="flex-1 gap-2 h-12 px-4 touch-manipulation bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-base"
          >
            Next
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Desktop Navigation - Original layout */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={onPrevious}
          disabled={currentStep === 1 || isGenerating}
          className="gap-2 h-11 px-6 touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>

        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Step {currentStep} of {totalSteps}
        </div>

        <Button
          onClick={handleNext}
          disabled={!canProceed || isGenerating}
          className="gap-2 h-11 px-6 touch-manipulation bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
} 