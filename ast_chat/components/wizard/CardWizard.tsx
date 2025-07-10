"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles, CheckCircle, History, Clock } from "lucide-react";
import { toast } from "sonner";

import StepIndicator from "./StepIndicator";
import Step1CardBasics from "./steps/Step1CardBasics";
import Step2ContentCreation from "./steps/Step2ContentCreation";
import Step3Personalization from "./steps/Step3Personalization";
import Step4Details from "./steps/Step4Details";
import Step5Review from "./steps/Step5Review";
import Step6FinalGeneration from "./steps/Step6FinalGeneration";
import WizardNavigation from "./WizardNavigation";
import CardHistoryModal from "../CardHistoryModal";

import { useCardStudio } from "@/hooks/useCardStudio";
import { useCardForm } from "@/hooks/useCardForm";
import { useWizardState } from "@/hooks/useWizardState";
import { useCardHistory } from "@/hooks/useCardHistory";

export interface WizardStep {
  id: string;
  title: string;
  mobileTitle?: string; // Shorter title for mobile
  description: string;
  isOptional?: boolean;
}

const wizardSteps: WizardStep[] = [
  {
    id: "basics",
    title: "Card Basics",
    mobileTitle: "Basics",
    description: "Choose your card type and tone"
  },
  {
    id: "content",
    title: "Content & Message", 
    mobileTitle: "Content",
    description: "Describe your card and write your message"
  },
  {
    id: "personalization",
    title: "Personalization",
    mobileTitle: "Style",
    description: "Choose artistic style and add photos",
    isOptional: true
  },
  {
    id: "details",
    title: "Email Address",
    mobileTitle: "Email",
    description: "Where to send your finished card"
  },
  {
    id: "drafts",
    title: "Draft Selection",
    mobileTitle: "Drafts",
    description: "Choose from 5 design variations"
  },
  {
    id: "generate",
    title: "Final Generation",
    mobileTitle: "Generate",
    description: "Creating your complete card"
  }
];

export default function CardWizard() {
  // Use hooks for form data and wizard state persistence
  const cardForm = useCardForm();
  const wizardState = useWizardState();
  const cardHistory = useCardHistory();
  
  // Use the comprehensive useCardStudio hook
  const cardStudio = useCardStudio();
  
  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Flag to prevent auto-saving during resume
  const [isResumingDraft, setIsResumingDraft] = useState(false);

  // Check for pending jobs on component mount
  useEffect(() => {
    cardStudio.checkPendingJobs();
  }, []);

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

  // Create a simplified updateFormData function for the wizard steps
  const updateFormData = (updates: any) => {
    // Update form data which will trigger persistence and sync to cardStudio
    cardForm.updateFormData(updates);
  };

  // Create a wrapper for handleFileUpload that updates both form and cardStudio
  const handleFileUploadWrapper = async (file: File, type: 'handwriting' | 'reference') => {
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    cardStudio.setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com'}/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      
      const result = await response.json();
      
      if (type === 'handwriting') {
        // Update cardStudio state
        cardStudio.setHandwritingSample(file);
        cardStudio.setHandwritingSampleUrl(result.url);
        toast.success("Handwriting sample uploaded!");
      } else {
        // Update both cardStudio and form data for reference images
        const newImages = [...cardForm.formData.referenceImages, file];
        const newUrls = [...cardForm.formData.referenceImageUrls, result.url];
        
        // Update cardStudio state
        cardStudio.setReferenceImages(newImages);
        cardStudio.setReferenceImageUrls(newUrls);
        
        // Update form data
        updateFormData({
          referenceImages: newImages,
          referenceImageUrls: newUrls
        });
        
        console.log("🔍 DEBUG: Reference image uploaded successfully:", {
          fileName: file.name,
          url: result.url,
          totalImages: newImages.length
        });
        
        toast.success(`Reference image uploaded! ${newImages.length} photo${newImages.length > 1 ? 's' : ''} ready for character creation.`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error("Upload failed. Please try again.");
    } finally {
      cardStudio.setIsUploading(false);
    }
  };

  // Create a wrapper for handleGetMessageHelp that updates both form and cardStudio
  const handleGetMessageHelpWrapper = async () => {
    // Call the cardStudio's handleGetMessageHelp function which now uses PromptGenerator
    const generatedMessage = await cardStudio.handleGetMessageHelp();
    
    // After message generation, update the form data with the new message
    if (generatedMessage) {
      updateFormData({
        finalCardMessage: generatedMessage
      });
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: any) => {
    // Update form data with template information
    updateFormData({
      prompt: template.prompt || '',
      selectedType: extractCardTypeFromPrompt(template.prompt) || cardForm.formData.selectedType,
      selectedArtisticStyle: template.styleInfo?.styleName || cardForm.formData.selectedArtisticStyle
    });
    
    // Store template info in cardStudio for later use
    cardStudio.setSelectedTemplate(template);
  };

  // Extract card type from prompt (basic implementation)
  const extractCardTypeFromPrompt = (prompt: string): string | null => {
    if (!prompt) return null;
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('birthday')) return 'birthday';
    if (lowerPrompt.includes('thank') || lowerPrompt.includes('grateful')) return 'thank-you';
    if (lowerPrompt.includes('anniversary')) return 'anniversary';
    if (lowerPrompt.includes('congratulat')) return 'congratulations';
    if (lowerPrompt.includes('holiday') || lowerPrompt.includes('christmas') || lowerPrompt.includes('new year')) return 'holiday';
    if (lowerPrompt.includes('love') || lowerPrompt.includes('romantic')) return 'love';
    if (lowerPrompt.includes('wedding')) return 'wedding';
    if (lowerPrompt.includes('graduat')) return 'graduation';
    if (lowerPrompt.includes('baby')) return 'new-baby';
    if (lowerPrompt.includes('sorry') || lowerPrompt.includes('apolog')) return 'apology';
    return null;
  };

  // Resume draft session
  const handleResumeDraft = (sessionId: string) => {
    // Set flag to prevent auto-saving during resume
    setIsResumingDraft(true);
    
    const session = cardHistory.resumeDraftSession(sessionId);
    if (session) {
      // Update form data with saved session data
      cardForm.updateFormData(session.formData);
      
      // Update cardStudio with draft cards
      cardStudio.setDraftCards(session.draftCards);
      cardStudio.setSelectedDraftIndex(session.selectedDraftIndex);
      cardStudio.setIsDraftMode(true);
      
      // Navigate to appropriate step
      if (session.draftCards.length > 0) {
        // If drafts exist, go to draft selection step
        wizardState.goToStep(5);
      } else {
        // Otherwise go to content creation step
        wizardState.goToStep(2);
      }
      
      toast.success('Draft session resumed successfully!');
      
      // Reset flag after a short delay to allow state updates to complete
      setTimeout(() => {
        setIsResumingDraft(false);
      }, 100);
    } else {
      setIsResumingDraft(false);
    }
  };

  // Validation function for each step
  const validateStep = (stepNumber: number): boolean => {
    return cardForm.validateStep(stepNumber);
  };

  // Handle step navigation
  const handleNext = (): boolean => {
    if (!validateStep(wizardState.currentStep)) {
      return false;
    }
    
    // Mark current step as completed
    wizardState.markStepCompleted(wizardState.currentStep);
    
    if (wizardState.currentStep < wizardSteps.length) {
      wizardState.goToNextStep();
    }
    
    return true;
  };

  const handlePrevious = () => {
    if (wizardState.currentStep > 1) {
      wizardState.goToPreviousStep();
    }
  };

  const handleStepClick = (stepNumber: number) => {
    // Allow navigation to completed steps or the next step if current is valid
    if (wizardState.completedSteps.includes(stepNumber) || 
        (stepNumber === wizardState.currentStep + 1 && validateStep(wizardState.currentStep)) ||
        stepNumber < wizardState.currentStep) {
      
      // Mark current step as completed if valid
      if (validateStep(wizardState.currentStep) && !wizardState.completedSteps.includes(wizardState.currentStep)) {
        wizardState.markStepCompleted(wizardState.currentStep);
      }
      
      wizardState.goToStep(stepNumber);
    }
  };

  // Check if we can proceed from current step
  const canProceed = validateStep(wizardState.currentStep);

  // Auto-complete step 1 once user makes selections
  useEffect(() => {
    if (validateStep(1) && !wizardState.completedSteps.includes(1)) {
      wizardState.markStepCompleted(1);
    }
  }, [cardForm.formData.selectedType, cardForm.formData.selectedTone, cardForm.formData.customCardType, wizardState]);

  // Auto-complete step 4 once email is valid
  useEffect(() => {
    if (validateStep(4) && !wizardState.completedSteps.includes(4)) {
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

  // Create complete CardFormData object
  const getCompleteFormData = () => cardForm.formData;

  const renderCurrentStep = () => {
    const completeFormData = getCompleteFormData();
    
    switch (wizardState.currentStep) {
      case 1:
        return (
          <Step1CardBasics
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!wizardState.completedSteps.includes(1)) {
                wizardState.markStepCompleted(1);
              }
            }}
            onTemplateSelect={handleTemplateSelect}
          />
        );
      
      case 2:
        return (
          <Step2ContentCreation
            formData={completeFormData}
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
            undoMessage={cardStudio.undoMessage}
            redoMessage={cardStudio.redoMessage}
          />
        );
      
      case 3:
        return (
          <Step3Personalization
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!wizardState.completedSteps.includes(3)) {
                wizardState.markStepCompleted(3);
              }
            }}
            handleFileUpload={handleFileUploadWrapper}
            handleRemoveReferenceImage={(index: number) => {
              // Update both cardStudio and form data
              const newImages = cardForm.formData.referenceImages.filter((_, i) => i !== index);
              const newUrls = cardForm.formData.referenceImageUrls.filter((_, i) => i !== index);
              
              // Update cardStudio state
              cardStudio.setReferenceImages(newImages);
              cardStudio.setReferenceImageUrls(newUrls);
              
              // Update form data
              updateFormData({
                referenceImages: newImages,
                referenceImageUrls: newUrls
              });
            }}
            isUploading={cardStudio.isUploading}
          />
        );
      
      case 4:
        return (
          <Step4Details
            formData={completeFormData}
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
          <Step5Review
            formData={completeFormData}
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
              wizardState.goToStep(6);
            }}
          />
        );
      
      case 6:
        return (
          <Step6FinalGeneration
            formData={completeFormData}
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
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8 safe-area-padding">
      {/* Header with History Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Card Wizard
          </h1>
          {(cardHistory.hasCompletedCards || cardHistory.hasDraftSessions) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              <span className="sm:hidden">({cardHistory.totalCards + cardHistory.totalDrafts})</span>
            </Button>
          )}
        </div>
        
        {/* Draft Resume Banner */}
        {cardHistory.hasDraftSessions && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-purple-600" />
            <span className="text-gray-600 dark:text-gray-400">
              {cardHistory.totalDrafts} draft{cardHistory.totalDrafts !== 1 ? 's' : ''} available
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
              className="text-purple-600 hover:text-purple-700"
            >
              Resume
            </Button>
          </div>
        )}
      </div>

      {/* Step Indicator */}
      <StepIndicator
        steps={wizardSteps}
        currentStep={wizardState.currentStep}
        completedSteps={wizardState.completedSteps}
        onStepClick={handleStepClick}
      />

      {/* Current Step Content */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                {wizardState.completedSteps.includes(wizardState.currentStep) ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : (
                  <span className="text-white font-bold">{wizardState.currentStep}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                  {wizardSteps[wizardState.currentStep - 1]?.title}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {wizardSteps[wizardState.currentStep - 1]?.description}
                </p>
              </div>
            </div>
            
            {wizardSteps[wizardState.currentStep - 1]?.isOptional && (
              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full flex-shrink-0">
                Optional
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 pb-4">
          {renderCurrentStep()}
        </CardContent>
      </Card>



      {/* Navigation */}
      <WizardNavigation
        currentStep={wizardState.currentStep}
        totalSteps={wizardSteps.length}
        onPrevious={handlePrevious}
        onNext={handleNext}
        canProceed={canProceed}
        isGenerating={cardStudio.isGenerating}
      />

      {/* History Modal */}
      <CardHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        onResumeDraft={handleResumeDraft}
        onLoadCard={(cardId) => {
          // Handle loading completed card for viewing
          toast.info('Card viewing functionality coming soon!');
        }}
      />
    </div>
  );
} 