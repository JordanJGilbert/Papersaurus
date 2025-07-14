"use client";

import React from "react";
import Step1CardBasics from "./steps/Step1CardBasics";
import Step2ContentCreation from "./steps/Step2ContentCreation";
import Step3Personalization from "./steps/Step3Personalization";
import Step4Details from "./steps/Step4Details";
import Step5Review from "./steps/Step5Review";
import Step6FinalGeneration from "./steps/Step6FinalGeneration";
import { CardFormData } from "@/hooks/useCardForm";

interface CardWizardStepsProps {
  currentStep: number;
  formData: CardFormData;
  updateFormData: (updates: any) => void;
  cardStudio: any;
  wizardState: any;
  handleFileUploadWrapper: (file: File, type: 'handwriting' | 'reference') => Promise<void>;
  handleGetMessageHelpWrapper: () => Promise<void>;
  undoMessageWrapper: () => void;
  redoMessageWrapper: () => void;
  handleTemplateSelect: (template: any) => void;
  cardHistory?: any;
  handleResumeDraft?: (sessionId: string) => void;
}

export function CardWizardSteps({
  currentStep,
  formData,
  updateFormData,
  cardStudio,
  wizardState,
  handleFileUploadWrapper,
  handleGetMessageHelpWrapper,
  undoMessageWrapper,
  redoMessageWrapper,
  handleTemplateSelect,
  cardHistory,
  handleResumeDraft
}: CardWizardStepsProps) {
  switch (currentStep) {
    case 1:
      return (
        <Step1CardBasics
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(1)) {
              wizardState.markStepCompleted(1);
            }
          }}
          onTemplateSelect={handleTemplateSelect}
          // Photo upload props (moved from Step3)
          handleFileUpload={handleFileUploadWrapper}
          handleRemoveReferenceImage={(index: number) => {
            // Update both cardStudio and form data
            const newImages = formData.referenceImages.filter((_, i) => i !== index);
            const newUrls = formData.referenceImageUrls.filter((_, i) => i !== index);
            
            // Update cardStudio state
            cardStudio.setReferenceImages(newImages);
            cardStudio.setReferenceImageUrls(newUrls);
            cardStudio.handleRemoveReferenceImage(index);
            
            // Update form data
            updateFormData({
              referenceImages: newImages,
              referenceImageUrls: newUrls
            });
          }}
          isUploading={cardStudio.isUploading}
          // Simplified photo references
          photoReferences={cardStudio.photoReferences}
          updatePhotoDescription={cardStudio.updatePhotoDescription}
          // Pass cardStudio's URLs directly for immediate access
          referenceImageUrlsFromStudio={cardStudio.referenceImageUrls}
          // Card history props
          cardHistory={cardHistory}
          onResumeDraft={handleResumeDraft}
        />
      );
    
    case 2:
      return (
        <Step2ContentCreation
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(2)) {
              wizardState.markStepCompleted(2);
            }
          }}
          handleGetMessageHelp={handleGetMessageHelpWrapper}
          isGeneratingMessage={cardStudio.isGeneratingMessage}
          messageHistory={cardStudio.messageHistory}
          currentMessageIndex={cardStudio.currentMessageIndex}
          undoMessage={undoMessageWrapper}
          redoMessage={redoMessageWrapper}
        />
      );
    
    case 3:
      return (
        <Step3Personalization
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(3)) {
              wizardState.markStepCompleted(3);
            }
          }}
          photoReferences={cardStudio.photoReferences}
        />
      );
    
    case 4:
      return (
        <Step4Details
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(4)) {
              wizardState.markStepCompleted(4);
            }
          }}
        />
      );
    
    case 5:
      // Log only significant state changes
      if (process.env.NODE_ENV === 'development') {
        const stateKey = `${cardStudio.isGenerating}-${cardStudio.isDraftMode}-${cardStudio.draftCards.length}`;
        if ((window as any).lastStep5State !== stateKey) {
          console.log('📍 Step 5 state changed:', {
            isGenerating: cardStudio.isGenerating,
            isDraftMode: cardStudio.isDraftMode,
            draftCards: cardStudio.draftCards.length,
            progressPercentage: cardStudio.progressPercentage
          });
          (window as any).lastStep5State = stateKey;
        }
      }
      return (
        <Step5Review
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(5)) {
              wizardState.markStepCompleted(5);
            }
          }}
          isGenerating={cardStudio.isGenerating}
          isGeneratingFinalCard={cardStudio.isGeneratingFinalCard}
          isGeneratingMessage={cardStudio.isGeneratingMessage}
          generationProgress={cardStudio.generationProgress}
          progressPercentage={cardStudio.progressPercentage}
          currentElapsedTime={cardStudio.currentElapsedTime}
          isDraftMode={cardStudio.isDraftMode}
          draftCards={cardStudio.draftCards}
          selectedDraftIndex={cardStudio.selectedDraftIndex}
          formatGenerationTime={cardStudio.formatGenerationTime}
          onGenerateDraftCards={cardStudio.handleGenerateDraftCards}
          onSelectDraft={(index) => {
            cardStudio.setSelectedDraftIndex(index);
            // Auto-advance to final generation step when draft is selected
            if (!wizardState.completedSteps.includes(5)) {
              wizardState.markStepCompleted(5);
            }
            wizardState.updateCurrentStep(6);
          }}
        />
      );
    
    case 6:
      return (
        <Step6FinalGeneration
          formData={formData}
          isGeneratingFinalCard={cardStudio.isGeneratingFinalCard}
          generationProgress={cardStudio.generationProgress}
          progressPercentage={cardStudio.progressPercentage}
          currentElapsedTime={cardStudio.currentElapsedTime}
          selectedDraftIndex={cardStudio.selectedDraftIndex}
          draftCards={cardStudio.draftCards}
          generatedCard={cardStudio.generatedCard}
          isCardCompleted={cardStudio.isCardCompleted}
          onGenerateFinalCard={cardStudio.handleGenerateFinalFromDraft}
          formatGenerationTime={cardStudio.formatGenerationTime}
          onBackToDrafts={() => {
            cardStudio.setGeneratedCard(null);
            cardStudio.setIsCardCompleted(false);
            cardStudio.setIsGeneratingFinalCard(false);
            cardStudio.setCurrentJobId(null);
            cardStudio.setGenerationProgress('');
            cardStudio.setProgressPercentage(0);
            cardStudio.stopElapsedTimeTracking();
            cardStudio.unsubscribeFromAllJobs();
            wizardState.updateCurrentStep(5);
          }}
        />
      );
    
    default:
      return null;
  }
}