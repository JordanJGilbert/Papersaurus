"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, Clock, CheckCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import StepIndicator from "./StepIndicator";
import WizardNavigation from "./WizardNavigation";
import CardHistoryModal from "../CardHistoryModal";
import { CardWizardEffects } from "./CardWizardEffects";
import { CardWizardSteps } from "./CardWizardSteps";
import {
  createFileUploadWrapper,
  createMessageHelpWrapper,
  createUndoWrapper,
  createRedoWrapper,
  handleTemplateSelect as handleTemplateSelectHelper,
  handleResumeDraft as handleResumeDraftHelper
} from "./CardWizardHelpers";

import { useCardStudio } from "@/hooks/useCardStudio";
import { useCardForm } from "@/hooks/useCardForm";
import { useCardHistory } from "@/hooks/useCardHistorySimplified";

export interface WizardStep {
  id: string;
  title: string;
  mobileTitle?: string;
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
    title: "Message", 
    mobileTitle: "Message",
    description: "Write your personalized card message"
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
  const cardHistory = useCardHistory();
  const cardStudio = useCardStudio();
  
  // Extract wizard state from cardForm
  const { wizardState, updateWizardState } = cardForm;
  
  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Flag to prevent auto-saving during resume
  const [isResumingDraft, setIsResumingDraft] = useState(false);

  // Create a simplified updateFormData function for the wizard steps
  const updateFormData = (updates: any) => {
    cardForm.updateFormData(updates);
  };

  // Create wrapper functions
  const handleFileUploadWrapper = createFileUploadWrapper(cardStudio, cardForm, updateFormData);
  const handleGetMessageHelpWrapper = createMessageHelpWrapper(cardStudio, updateFormData);
  const undoMessageWrapper = createUndoWrapper(cardStudio, updateFormData);
  const redoMessageWrapper = createRedoWrapper(cardStudio, updateFormData);
  
  const handleTemplateSelect = (template: any) => {
    handleTemplateSelectHelper(template, updateFormData, cardStudio);
  };
  
  const handleResumeDraft = (sessionId: string) => {
    handleResumeDraftHelper(sessionId, cardHistory, cardForm, cardStudio, wizardState, setIsResumingDraft);
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
    
    wizardState.markStepCompleted(wizardState.currentStep);
    
    if (wizardState.currentStep < wizardSteps.length) {
      wizardState.updateCurrentStep(wizardState.currentStep + 1);
    }
    
    return true;
  };

  const handlePrevious = () => {
    if (wizardState.currentStep > 1) {
      wizardState.updateCurrentStep(wizardState.currentStep - 1);
    }
  };

  const handleStepClick = (stepNumber: number) => {
    // Allow free navigation to any completed step
    if (wizardState.completedSteps.includes(stepNumber)) {
      wizardState.updateCurrentStep(stepNumber);
      return;
    }
    
    // Allow navigation to the next step if current is valid
    if (stepNumber === wizardState.currentStep + 1 && validateStep(wizardState.currentStep)) {
      if (!wizardState.completedSteps.includes(wizardState.currentStep)) {
        wizardState.markStepCompleted(wizardState.currentStep);
      }
      wizardState.updateCurrentStep(stepNumber);
      return;
    }
    
    // Allow backward navigation
    if (stepNumber < wizardState.currentStep) {
      wizardState.updateCurrentStep(stepNumber);
      return;
    }
  };

  // Check if we can proceed from current step
  const canProceed = validateStep(wizardState.currentStep);

  // Handle create new card
  const handleCreateNew = () => {
    if (wizardState.currentStep > 1 || cardForm.formData.selectedType || cardForm.formData.selectedTone) {
      // Show confirmation if user has made progress
      if (window.confirm('Are you sure you want to start over? All current progress will be lost.')) {
        cardForm.resetForm();
        wizardState.resetWizardState();
        // TODO: Add resetStudio method to cardStudio hook
        // Reset key cardStudio state manually for now
        cardStudio.setDraftCards([]);
        cardStudio.setGeneratedCard(null);
        cardStudio.setIsGenerating(false);
        cardStudio.setGenerationProgress("");
        cardStudio.setSelectedDraftIndex(-1);
        toast.success('Started new card');
      }
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
        
        {/* Right side buttons */}
        <div className="flex items-center gap-2">
          {/* Create New Card Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateNew}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Card</span>
          </Button>
          
          {/* Draft Resume Banner */}
          {cardHistory.hasDraftSessions && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-purple-600" />
              <span className="text-gray-600 dark:text-gray-400 hidden sm:inline">
                {cardHistory.totalDrafts} saved
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
          <CardWizardSteps
            currentStep={wizardState.currentStep}
            formData={cardForm.formData}
            updateFormData={updateFormData}
            cardStudio={cardStudio}
            wizardState={wizardState}
            handleFileUploadWrapper={handleFileUploadWrapper}
            handleGetMessageHelpWrapper={handleGetMessageHelpWrapper}
            undoMessageWrapper={undoMessageWrapper}
            redoMessageWrapper={redoMessageWrapper}
            handleTemplateSelect={handleTemplateSelect}
            cardHistory={cardHistory}
            handleResumeDraft={handleResumeDraft}
          />
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

      {/* Effects Component */}
      <CardWizardEffects
        cardStudio={cardStudio}
        cardForm={cardForm}
        cardHistory={cardHistory}
        wizardState={wizardState}
        updateWizardState={updateWizardState}
        isResumingDraft={isResumingDraft}
        isRestoringJobs={cardStudio.isRestoringJobs}
      />
    </div>
  );
}