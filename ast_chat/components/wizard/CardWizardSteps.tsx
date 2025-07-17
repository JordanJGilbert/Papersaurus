"use client";

import React from "react";
import Step1CardBasics from "./steps/Step1CardBasics";
import Step2ContentCreation from "./steps/Step2ContentCreation";
import Step3Personalization from "./steps/Step3Personalization";
import Step4Details from "./steps/Step4Details";
import Step5Generate from "./steps/Step5Generate";
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
      return (
        <Step5Generate
          formData={formData}
          updateFormData={updateFormData}
          onStepComplete={() => {
            if (!wizardState.completedSteps.includes(5)) {
              wizardState.markStepCompleted(5);
            }
          }}
          isGenerating={cardStudio.isGenerating}
          isGeneratingMessage={cardStudio.isGeneratingMessage}
          generationProgress={cardStudio.generationProgress}
          progressPercentage={cardStudio.progressPercentage}
          currentElapsedTime={cardStudio.currentElapsedTime}
          generatedCards={cardStudio.generatedCards}
          selectedCardIndex={cardStudio.selectedCardIndex}
          formatGenerationTime={cardStudio.formatGenerationTime}
          onGenerateCards={cardStudio.handleGenerateCards}
          onSelectCard={(index) => {
            cardStudio.setSelectedCardIndex(index);
          }}
          isCardCompleted={cardStudio.isCardCompleted}
          onRegenerate={cardStudio.handleGenerateCards}
        />
      );
    
    default:
      return null;
  }
}