"use client";

import { useEffect, useState } from "react";
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
  // Check for pending jobs on component mount and advance to appropriate step
  useEffect(() => {
    const restorePendingJobs = async () => {
      await cardStudio.checkPendingJobs();
      
      // After checking pending jobs, if we're generating drafts, ensure we're on step 5
      // Only navigate if we have actual draft cards or a valid draft generation in progress
      if ((cardStudio.isDraftMode || cardStudio.isGenerating) && 
          !cardStudio.isGeneratingFinalCard && 
          (cardStudio.draftCards.length > 0 || cardStudio.generationProgress)) {
        console.log('🔄 Restoring to Step 5 due to ongoing draft generation', {
          isDraftMode: cardStudio.isDraftMode,
          isGenerating: cardStudio.isGenerating,
          draftCards: cardStudio.draftCards.length,
          generationProgress: cardStudio.generationProgress
        });
        // Mark previous steps as completed
        if (!wizardState.completedSteps.includes(1)) wizardState.markStepCompleted(1);
        if (!wizardState.completedSteps.includes(2)) wizardState.markStepCompleted(2);
        if (!wizardState.completedSteps.includes(3)) wizardState.markStepCompleted(3);
        if (!wizardState.completedSteps.includes(4)) wizardState.markStepCompleted(4);
        wizardState.goToStep(5);
      } else if (cardStudio.isGeneratingFinalCard || cardStudio.isCardCompleted) {
        console.log('🔄 Restoring to Step 6 due to ongoing final generation or completed card');
        // Mark all previous steps as completed
        for (let i = 1; i <= 5; i++) {
          if (!wizardState.completedSteps.includes(i)) wizardState.markStepCompleted(i);
        }
        wizardState.goToStep(6);
      }
    };
    
    restorePendingJobs();
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
        
        // If they have draft cards OR draft generation is in progress, go to step 5
        if (cardStudio.draftCards.length > 0 || cardStudio.isDraftMode || cardStudio.isGenerating) {
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

  // Navigate to Step 5 when draft cards are loaded
  useEffect(() => {
    if (cardStudio.draftCards.length > 0 && wizardState.currentStep < 5) {
      console.log('📋 Draft cards loaded, navigating to Step 5');
      // Mark previous steps as completed
      for (let i = 1; i <= 4; i++) {
        if (!wizardState.completedSteps.includes(i)) {
          wizardState.markStepCompleted(i);
        }
      }
      wizardState.goToStep(5);
    }
  }, [cardStudio.draftCards.length]);

  // Auto-save drafts when user creates draft cards
  // Track the current session ID to update the same session
  const [currentDraftSessionId, setCurrentDraftSessionId] = useState<string | null>(null);
  const [lastSavedDraftCount, setLastSavedDraftCount] = useState<number>(0);
  
  useEffect(() => {
    // Only save if we have draft cards and not resuming
    if (cardStudio.draftCards.length > 0 && cardForm.isInitialLoadComplete && !isResumingDraft) {
      // Count non-null draft cards
      const validDrafts = cardStudio.draftCards.filter(card => card !== null).length;
      
      // Only save when:
      // 1. All 5 drafts are complete (validDrafts === 5)
      // 2. This is the first draft and we haven't saved yet (validDrafts === 1 && !currentDraftSessionId)
      // 3. User selected a draft (selectedDraftIndex >= 0)
      const shouldSave = (
        (validDrafts === 5 && lastSavedDraftCount < 5) || // All drafts complete
        (validDrafts === 1 && !currentDraftSessionId) || // First draft
        (cardStudio.selectedDraftIndex >= 0 && validDrafts > lastSavedDraftCount) // User selected
      );
      
      if (shouldSave && validDrafts > 0) {
        // Save or update the session with the same ID
        const sessionId = cardHistory.saveDraftSession(
          cardForm.formData,
          cardStudio.draftCards,
          cardStudio.selectedDraftIndex,
          currentDraftSessionId || undefined // Use existing session ID if available
        );
        
        // Store the session ID for future updates
        if (!currentDraftSessionId) {
          setCurrentDraftSessionId(sessionId);
        }
        
        // Update the last saved count
        setLastSavedDraftCount(validDrafts);
        
        console.log(`💾 Draft session saved: ${validDrafts}/5 drafts complete`);
      }
    }
  }, [cardStudio.draftCards, cardStudio.selectedDraftIndex, cardForm.formData, cardForm.isInitialLoadComplete, isResumingDraft, currentDraftSessionId, lastSavedDraftCount]);
  
  // Reset session ID when drafts are cleared
  useEffect(() => {
    const validDrafts = cardStudio.draftCards.filter(card => card !== null).length;
    if (validDrafts === 0) {
      setCurrentDraftSessionId(null);
      setLastSavedDraftCount(0);
    }
  }, [cardStudio.draftCards]);

  // Auto-save completed cards and ensure we're on Step 6
  useEffect(() => {
    if (cardStudio.generatedCard && cardStudio.isCardCompleted) {
      cardHistory.addCompletedCard(cardStudio.generatedCard);
      
      // Ensure we're on Step 6 to see the completed card
      if (wizardState.currentStep !== 6) {
        console.log('📍 Card completed but not on Step 6, navigating there now...');
        wizardState.goToStep(6);
      }
    }
  }, [cardStudio.generatedCard, cardStudio.isCardCompleted, wizardState.currentStep]);

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
    cardStudio.setRelationshipField(formData.relationshipField);
    cardStudio.setPrompt(formData.prompt);
    cardStudio.setFinalCardMessage(formData.finalCardMessage);
    cardStudio.setIsHandwrittenMessage(formData.isHandwrittenMessage);
    cardStudio.setSelectedArtisticStyle(formData.selectedArtisticStyle);
    cardStudio.setCustomStyleDescription(formData.customStyleDescription);
    // Skip syncing reference images from form to cardStudio
    // This should only flow from cardStudio -> form after uploads
    // cardStudio.setReferenceImages(formData.referenceImages);
    // cardStudio.setReferenceImageUrls(formData.referenceImageUrls);
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

  // Sync reference images from cardStudio to form when they change
  useEffect(() => {
    if (!cardForm.isInitialLoadComplete) return;
    
    // Only sync if cardStudio has images but form doesn't
    if (cardStudio.referenceImageUrls.length > 0 && 
        cardForm.formData.referenceImageUrls.length !== cardStudio.referenceImageUrls.length) {
      
      cardForm.updateFormData({
        referenceImages: cardStudio.referenceImages,
        referenceImageUrls: cardStudio.referenceImageUrls
      });
    }
  }, [cardStudio.referenceImageUrls, cardStudio.referenceImages, cardForm.isInitialLoadComplete]);

  return null;
}