"use client";

import React from "react";
import { CardFormData } from "@/hooks/useCardForm";
import Step5Review from "./Step5Review";
import Step6FinalGeneration from "./Step6FinalGeneration";

interface Step7Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
  currentJobId?: string;
  draftCards?: any[];
  handleSelectDraft?: (draft: any) => void;
  isGeneratingFinal?: boolean;
  generationProgress?: number;
  generationMessage?: string;
  finalCardData?: any;
  handleGenerateFinal?: () => void;
  handleGetCardAsync?: () => Promise<void>;
  handleSendEmail?: () => void;
  isJobComplete?: boolean;
  onDownloadCard?: () => void;
  isGeneratingDrafts?: boolean;
  showConfetti?: boolean;
}

export default function Step7CreateCard(props: Step7Props) {
  const {
    formData,
    draftCards,
    finalCardData,
    isGeneratingDrafts,
    isGeneratingFinal,
    isJobComplete
  } = props;

  // Show draft selection if we're still generating drafts or have drafts but no final card
  const showDraftSelection = isGeneratingDrafts || (draftCards && draftCards.length > 0 && !finalCardData);
  
  // Show final generation if we have a selected draft or are generating final card
  const showFinalGeneration = formData.selectedDraft || isGeneratingFinal || finalCardData || isJobComplete;

  return (
    <div className="space-y-6">
      {showDraftSelection && !showFinalGeneration && (
        <Step5Review {...props} />
      )}
      
      {showFinalGeneration && (
        <Step6FinalGeneration {...props} />
      )}
    </div>
  );
}