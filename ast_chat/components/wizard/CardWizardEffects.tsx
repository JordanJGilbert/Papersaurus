"use client";

import { useEffect } from "react";
import { CardFormData } from "@/hooks/useCardForm";
import { GeneratedCard } from "@/hooks/cardStudio/constants";

interface CardWizardEffectsProps {
  cardStudio: any;
  cardForm: any;
  cardHistory: any;
  wizardState: any;
  isResumingDraft: boolean;
}

export function CardWizardEffects({
  cardStudio,
  cardForm,
  cardHistory,
  wizardState,
  isResumingDraft
}: CardWizardEffectsProps) {
  // Check for pending jobs on component mount
  useEffect(() => {
    cardStudio.checkPendingJobs();
  }, []);

  // Auto-resume to the appropriate step based on saved data
  useEffect(() => {
    if (!wizardState.isInitialLoadComplete || !cardForm.isInitialLoadComplete) return;
    
    // Only auto-advance if we're on step 1 and have data
    if (wizardState.currentStep === 1 && wizardState.completedSteps.length === 0) {
      const formData = cardForm.formData;
      
      // Check if user has meaningful progress
      if (formData.userEmail) {
        // User has email, advance to at least step 4
        console.log('🔄 Auto-resuming to email step or beyond');
        wizardState.markStepCompleted(1);
        if (formData.finalCardMessage || formData.prompt) {
          wizardState.markStepCompleted(2);
        }
        if (formData.selectedArtisticStyle || formData.referenceImages.length > 0) {
          wizardState.markStepCompleted(3);
        }
        wizardState.markStepCompleted(4);
        
        // If they have draft cards, go to step 5
        if (cardStudio.draftCards.length > 0) {
          wizardState.goToStep(5);
        } else {
          wizardState.goToStep(4);
        }
      } else if (formData.finalCardMessage || formData.prompt) {
        // User has message content, advance to step 2
        console.log('🔄 Auto-resuming to message step');
        wizardState.markStepCompleted(1);
        wizardState.goToStep(2);
      } else if (formData.selectedType && formData.selectedTone) {
        // User has completed step 1 but not moved on
        console.log('🔄 Auto-completing step 1');
        wizardState.markStepCompleted(1);
      }
    }
  }, [wizardState.isInitialLoadComplete, cardForm.isInitialLoadComplete]);

  // Auto-save drafts when user creates draft cards
  useEffect(() => {
    if (cardStudio.draftCards.length > 0 && cardForm.isInitialLoadComplete && !isResumingDraft) {
      cardHistory.saveDraftSession(
        cardForm.formData,
        cardStudio.draftCards,
        cardStudio.selectedDraftIndex
      );
    }
  }, [cardStudio.draftCards, cardStudio.selectedDraftIndex, cardForm.formData, cardForm.isInitialLoadComplete, isResumingDraft]);

  // Auto-save completed cards
  useEffect(() => {
    if (cardStudio.generatedCard && cardStudio.isCardCompleted) {
      cardHistory.addCompletedCard(cardStudio.generatedCard);
    }
  }, [cardStudio.generatedCard, cardStudio.isCardCompleted]);

  // Sync form data with cardStudio when form data changes
  useEffect(() => {
    if (!cardForm.isInitialLoadComplete) return;

    const { formData } = cardForm;
    
    // Update cardStudio with form data
    cardStudio.setSelectedType(formData.selectedType);
    cardStudio.setCustomCardType(formData.customCardType);
    cardStudio.setSelectedTone(formData.selectedTone);
    cardStudio.setToField(formData.toField);
    cardStudio.setFromField(formData.fromField);
    cardStudio.setPrompt(formData.prompt);
    cardStudio.setFinalCardMessage(formData.finalCardMessage);
    cardStudio.setIsHandwrittenMessage(formData.isHandwrittenMessage);
    cardStudio.setSelectedArtisticStyle(formData.selectedArtisticStyle);
    cardStudio.setCustomStyleDescription(formData.customStyleDescription);
    cardStudio.setReferenceImages(formData.referenceImages);
    cardStudio.setReferenceImageUrls(formData.referenceImageUrls);
    cardStudio.setImageTransformation(formData.imageTransformation);
    cardStudio.setUserEmail(formData.userEmail);
    cardStudio.setSelectedImageModel(formData.selectedImageModel);
    cardStudio.setSelectedDraftModel(formData.selectedDraftModel);
    cardStudio.setSelectedPaperSize(formData.selectedPaperSize);
    cardStudio.setNumberOfCards(formData.numberOfCards);
    cardStudio.setIsFrontBackOnly(formData.isFrontBackOnly);
  }, [cardForm.formData, cardForm.isInitialLoadComplete]);

  // Auto-complete step 1 once user makes selections
  useEffect(() => {
    if (cardForm.validateStep(1) && !wizardState.completedSteps.includes(1)) {
      wizardState.markStepCompleted(1);
    }
  }, [cardForm.formData.selectedType, cardForm.formData.selectedTone, cardForm.formData.customCardType, wizardState]);

  // Auto-complete step 4 once email is valid
  useEffect(() => {
    if (cardForm.validateStep(4) && !wizardState.completedSteps.includes(4)) {
      wizardState.markStepCompleted(4);
    }
  }, [cardForm.formData.userEmail, wizardState]);

  // Auto-advance to Step 6 when final card generation starts
  useEffect(() => {
    if (cardStudio.isGeneratingFinalCard && wizardState.currentStep < 6) {
      console.log('🚀 Auto-advancing to Step 6: Final Generation');
      if (!wizardState.completedSteps.includes(5)) {
        wizardState.markStepCompleted(5);
      }
      wizardState.goToStep(6);
    }
  }, [cardStudio.isGeneratingFinalCard, wizardState]);

  return null;
}