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


      {/* Regular Navigation */}
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