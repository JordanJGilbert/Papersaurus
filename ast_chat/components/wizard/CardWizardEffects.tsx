"use client";

import { useEffect, useState } from "react";
import { CardFormData } from "@/hooks/useCardForm";
import { GeneratedCard } from "@/hooks/cardStudio/constants";

interface CardWizardEffectsProps {
  cardStudio: any;
  cardForm: any;
  cardHistory: any;
  wizardState: any;
  updateWizardState: (updates: any) => void;
  isResumingDraft: boolean;
  isRestoringJobs: boolean;
}

export function CardWizardEffects({
  cardStudio,
  cardForm,
  cardHistory,
  wizardState,
  updateWizardState,
  isResumingDraft,
  isRestoringJobs
}: CardWizardEffectsProps) {
  // Check for pending jobs on component mount but don't auto-navigate
  useEffect(() => {
    const restorePendingJobs = async () => {
      console.log('🔄 CardWizardEffects: Starting checkPendingJobs...');
      await cardStudio.checkPendingJobs();
      
      // Only auto-navigate if there's an active generation in progress
      // Don't navigate for completed drafts - let user choose
      if (cardStudio.isGenerating && cardStudio.generationProgress) {
        if (cardStudio.isGeneratingFinalCard) {
          console.log('🔄 Restoring to Step 6 due to ongoing final generation');
          // Mark all previous steps as completed
          for (let i = 1; i <= 5; i++) {
            if (!wizardState.completedSteps.includes(i)) wizardState.markStepCompleted(i);
          }
          wizardState.goToStep(6);
        } else if (cardStudio.isDraftMode && cardStudio.isGenerating) {
          console.log('🔄 Restoring to Step 5 due to ongoing draft generation');
          // Mark previous steps as completed
          if (!wizardState.completedSteps.includes(1)) wizardState.markStepCompleted(1);
          if (!wizardState.completedSteps.includes(2)) wizardState.markStepCompleted(2);
          if (!wizardState.completedSteps.includes(3)) wizardState.markStepCompleted(3);
          if (!wizardState.completedSteps.includes(4)) wizardState.markStepCompleted(4);
          wizardState.goToStep(5);
        }
      } else {
        // No active generation - reset wizard to step 1 if we're on a later step
        // This handles the case where user left off on step 5 but isn't actively generating
        if (wizardState.currentStep > 1 && !cardStudio.isGenerating) {
          console.log('🔄 No active generation, resetting to Step 1');
          wizardState.goToStep(1);
        }
      }
      // If we have completed drafts but no active generation, stay on Step 1
      // User can choose to resume via the UI
    };
    
    restorePendingJobs();
  }, []);

  // Only mark step 1 as completed if user has made selections, but don't auto-advance
  useEffect(() => {
    if (!wizardState.isInitialLoadComplete || !cardForm.isInitialLoadComplete) return;
    
    // Only mark step as completed, don't navigate
    if (wizardState.currentStep === 1 && !wizardState.completedSteps.includes(1)) {
      const formData = cardForm.formData;
      
      // Mark step 1 as completed if user has made selections
      if (formData.selectedType && formData.selectedTone) {
        console.log('✅ Marking step 1 as completed based on saved data');
        wizardState.markStepCompleted(1);
      }
    }
  }, [wizardState.isInitialLoadComplete, cardForm.isInitialLoadComplete]);

  // Only navigate to Step 5 when NEW draft cards are being generated (not restored)
  useEffect(() => {
    // Only navigate if we're actively generating NEW drafts, not restoring old ones
    if (cardStudio.draftCards.length > 0 && 
        wizardState.currentStep < 5 && 
        cardStudio.isGenerating && 
        !isRestoringJobs) {
      console.log('📋 New draft cards being generated, navigating to Step 5');
      // Mark previous steps as completed
      for (let i = 1; i <= 4; i++) {
        if (!wizardState.completedSteps.includes(i)) {
          wizardState.markStepCompleted(i);
        }
      }
      wizardState.goToStep(5);
    }
  }, [cardStudio.draftCards.length, cardStudio.isGenerating, isRestoringJobs]);

  // Auto-save drafts when user creates draft cards
  // Track the current session ID to update the same session
  const [currentDraftSessionId, setCurrentDraftSessionId] = useState<string | null>(null);
  const [lastSavedDraftCount, setLastSavedDraftCount] = useState<number>(0);
  
  useEffect(() => {
    // Only save if we have draft cards and not resuming or restoring
    if (cardStudio.draftCards.length > 0) {
      console.log('🔍 Auto-save check:', {
        hasCards: cardStudio.draftCards.length > 0,
        isInitialLoadComplete: cardForm.isInitialLoadComplete,
        isResumingDraft,
        isRestoringJobs,
        shouldSave: cardForm.isInitialLoadComplete && !isResumingDraft && !isRestoringJobs
      });
    }
    
    if (cardStudio.draftCards.length > 0 && cardForm.isInitialLoadComplete && !isResumingDraft && !isRestoringJobs) {
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
  }, [cardStudio.draftCards, cardStudio.selectedDraftIndex, cardForm.formData, cardForm.isInitialLoadComplete, isResumingDraft, isRestoringJobs, currentDraftSessionId, lastSavedDraftCount]);
  
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
    
    // Sync if cardStudio has images but form doesn't, or if photoReferences changed
    const shouldSync = (
      (cardStudio.referenceImageUrls.length > 0 && 
       cardForm.formData.referenceImageUrls.length !== cardStudio.referenceImageUrls.length) ||
      (cardStudio.photoReferences && cardStudio.photoReferences !== cardForm.formData.photoReferences)
    );
    
    if (shouldSync) {
      cardForm.updateFormData({
        referenceImages: cardStudio.referenceImages,
        referenceImageUrls: cardStudio.referenceImageUrls,
        photoReferences: cardStudio.photoReferences
      });
    }
  }, [cardStudio.referenceImageUrls, cardStudio.referenceImages, cardStudio.photoReferences, cardForm.isInitialLoadComplete]);

  return null;
}