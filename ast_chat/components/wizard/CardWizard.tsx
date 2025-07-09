"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles, CheckCircle } from "lucide-react";

import StepIndicator from "./StepIndicator";
import Step1CardBasics from "./steps/Step1CardBasics";
import Step2ContentCreation from "./steps/Step2ContentCreation";
import Step3Personalization from "./steps/Step3Personalization";
import Step4Details from "./steps/Step4Details";
import Step5Review from "./steps/Step5Review";
import WizardNavigation from "./WizardNavigation";

import { useCardStudio } from "@/hooks/useCardStudio";

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  isOptional?: boolean;
}

const wizardSteps: WizardStep[] = [
  {
    id: "basics",
    title: "Card Basics",
    description: "Choose your card type and tone"
  },
  {
    id: "content",
    title: "Content & Message", 
    description: "Describe your card and write your message"
  },
  {
    id: "personalization",
    title: "Personalization",
    description: "Choose artistic style and add photos",
    isOptional: true
  },
  {
    id: "details",
    title: "Details & Settings",
    description: "Email and advanced options"
  },
      {
      id: "review",
      title: "Generate",
      description: "Create your personalized card"
    }
];

export default function CardWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  
  // Use the comprehensive useCardStudio hook
  const cardStudio = useCardStudio();

  // Check for pending jobs on component mount
  useEffect(() => {
    cardStudio.checkPendingJobs();
  }, []);

  // Create a simplified updateFormData function for the wizard steps
  const updateFormData = (updates: any) => {
    // Update individual fields based on the updates object
    Object.keys(updates).forEach(key => {
      switch (key) {
        case 'selectedType':
          cardStudio.setSelectedType(updates[key]);
          break;
        case 'customCardType':
          cardStudio.setCustomCardType(updates[key]);
          break;
        case 'selectedTone':
          cardStudio.setSelectedTone(updates[key]);
          break;
        case 'toField':
          cardStudio.setToField(updates[key]);
          break;
        case 'fromField':
          cardStudio.setFromField(updates[key]);
          break;
        case 'prompt':
          cardStudio.setPrompt(updates[key]);
          break;
        case 'finalCardMessage':
          cardStudio.setFinalCardMessage(updates[key]);
          break;
        case 'isHandwrittenMessage':
          cardStudio.setIsHandwrittenMessage(updates[key]);
          break;
        case 'selectedArtisticStyle':
          cardStudio.setSelectedArtisticStyle(updates[key]);
          break;
        case 'customStyleDescription':
          cardStudio.setCustomStyleDescription(updates[key]);
          break;
        case 'referenceImages':
          cardStudio.setReferenceImages(updates[key]);
          break;
        case 'referenceImageUrls':
          cardStudio.setReferenceImageUrls(updates[key]);
          break;
        case 'imageTransformation':
          cardStudio.setImageTransformation(updates[key]);
          break;
        case 'userEmail':
          cardStudio.setUserEmail(updates[key]);
          break;
        case 'selectedImageModel':
          cardStudio.setSelectedImageModel(updates[key]);
          break;
        case 'selectedDraftModel':
          cardStudio.setSelectedDraftModel(updates[key]);
          break;
        case 'selectedPaperSize':
          cardStudio.setSelectedPaperSize(updates[key]);
          break;
        case 'numberOfCards':
          cardStudio.setNumberOfCards(updates[key]);
          break;
        case 'isFrontBackOnly':
          cardStudio.setIsFrontBackOnly(updates[key]);
          break;
      }
    });
  };

  // Validation function for each step
  const validateStep = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1: // Card Basics
        if (cardStudio.selectedType === "custom" && !cardStudio.customCardType.trim()) {
          return false;
        }
        return Boolean(cardStudio.selectedType) && Boolean(cardStudio.selectedTone);
      
      case 2: // Content & Message
        // Always valid - content is optional, message can be auto-generated
        return true;
      
      case 3: // Personalization
        // Always valid - this step is optional
        if (cardStudio.selectedArtisticStyle === "custom" && !cardStudio.customStyleDescription.trim()) {
          return false;
        }
        return true;
      
      case 4: // Details & Settings
        // Require valid email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return Boolean(cardStudio.userEmail.trim()) && emailRegex.test(cardStudio.userEmail);
      
      case 5: // Generate
        // All previous steps must be valid
        return validateStep(1) && validateStep(2) && validateStep(3) && validateStep(4);
      
      default:
        return false;
    }
  };

  // Handle step navigation
  const handleNext = (): boolean => {
    if (!validateStep(currentStep)) {
      return false;
    }
    
    // Mark current step as completed
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep]);
    }
    
    if (currentStep < wizardSteps.length) {
      setCurrentStep(currentStep + 1);
    }
    
    return true;
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepNumber: number) => {
    // Allow navigation to completed steps or the next step if current is valid
    if (completedSteps.includes(stepNumber) || 
        (stepNumber === currentStep + 1 && validateStep(currentStep)) ||
        stepNumber < currentStep) {
      
      // Mark current step as completed if valid
      if (validateStep(currentStep) && !completedSteps.includes(currentStep)) {
        setCompletedSteps(prev => [...prev, currentStep]);
      }
      
      setCurrentStep(stepNumber);
    }
  };

  // Check if we can proceed from current step
  const canProceed = validateStep(currentStep);

  // Auto-complete step 1 once user makes selections
  useEffect(() => {
    if (validateStep(1) && !completedSteps.includes(1)) {
      setCompletedSteps(prev => [...prev, 1]);
    }
  }, [cardStudio.selectedType, cardStudio.selectedTone, cardStudio.customCardType]);

  // Auto-complete step 4 once email is valid
  useEffect(() => {
    if (validateStep(4) && !completedSteps.includes(4)) {
      setCompletedSteps(prev => [...prev, 4]);
    }
  }, [cardStudio.userEmail]);

  // Create complete CardFormData object
  const getCompleteFormData = () => ({
    selectedType: cardStudio.selectedType,
    customCardType: cardStudio.customCardType,
    selectedTone: cardStudio.selectedTone,
    toField: cardStudio.toField,
    fromField: cardStudio.fromField,
    prompt: cardStudio.prompt,
    finalCardMessage: cardStudio.finalCardMessage,
    isHandwrittenMessage: cardStudio.isHandwrittenMessage,
    selectedArtisticStyle: cardStudio.selectedArtisticStyle,
    customStyleDescription: cardStudio.customStyleDescription,
    referenceImages: cardStudio.referenceImages,
    referenceImageUrls: cardStudio.referenceImageUrls,
    imageTransformation: cardStudio.imageTransformation,
    userEmail: cardStudio.userEmail,
    selectedImageModel: cardStudio.selectedImageModel,
    selectedDraftModel: cardStudio.selectedDraftModel,
    selectedPaperSize: cardStudio.selectedPaperSize,
    numberOfCards: cardStudio.numberOfCards,
    isFrontBackOnly: cardStudio.isFrontBackOnly
  });

  const renderCurrentStep = () => {
    const completeFormData = getCompleteFormData();
    
    switch (currentStep) {
      case 1:
        return (
          <Step1CardBasics
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!completedSteps.includes(1)) {
                setCompletedSteps(prev => [...prev, 1]);
              }
            }}
          />
        );
      
      case 2:
        return (
          <Step2ContentCreation
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!completedSteps.includes(2)) {
                setCompletedSteps(prev => [...prev, 2]);
              }
            }}
            handleGetMessageHelp={cardStudio.handleGetMessageHelp}
            isGeneratingMessage={cardStudio.isGeneratingMessage}
          />
        );
      
      case 3:
        return (
          <Step3Personalization
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!completedSteps.includes(3)) {
                setCompletedSteps(prev => [...prev, 3]);
              }
            }}
            handleFileUpload={cardStudio.handleFileUpload}
            handleRemoveReferenceImage={cardStudio.handleRemoveReferenceImage}
            isUploading={cardStudio.isUploading}
          />
        );
      
      case 4:
        return (
          <Step4Details
            formData={completeFormData}
            updateFormData={updateFormData}
            onStepComplete={() => {
              if (!completedSteps.includes(4)) {
                setCompletedSteps(prev => [...prev, 4]);
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
              if (!completedSteps.includes(5)) {
                setCompletedSteps(prev => [...prev, 5]);
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
            formatGenerationTime={cardStudio.formatGenerationTime}
            onGenerateCard={cardStudio.handleGenerateCardAsync}
            onGenerateDraftCards={cardStudio.handleGenerateDraftCards}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Step Indicator */}
      <StepIndicator
        steps={wizardSteps}
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepClick}
      />

      {/* Current Step Content */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-lg">
                {completedSteps.includes(currentStep) ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : (
                  <span className="text-white font-bold">{currentStep}</span>
                )}
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {wizardSteps[currentStep - 1]?.title}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {wizardSteps[currentStep - 1]?.description}
                </p>
              </div>
            </div>
            
            {wizardSteps[currentStep - 1]?.isOptional && (
              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                Optional
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          {renderCurrentStep()}
        </CardContent>
      </Card>

      {/* Draft Cards Selection */}
      {cardStudio.isDraftMode && cardStudio.draftCards.length > 0 && !cardStudio.isGeneratingFinalCard && !cardStudio.generatedCard && (
        <Card className="shadow-lg" data-card-preview>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Choose Your Favorite Design
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              5 front cover variations created with low quality for fast preview. Select your favorite to generate the complete high-quality card!
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Draft cards display */}
            <div className="w-full">
              <div className="flex overflow-x-auto gap-3 pb-4 -mx-4 px-4 snap-x snap-mandatory">
                {Array.from({ length: 5 }, (_, displayIndex) => {
                  const card = cardStudio.draftCards[displayIndex];
                  const originalIndex = cardStudio.draftIndexMapping[displayIndex];
                  const isLoading = displayIndex >= cardStudio.draftCards.length;
                  
                  return (
                    <div
                      key={displayIndex}
                      className={`flex-shrink-0 w-48 sm:w-56 snap-center rounded-lg border-2 p-2 sm:p-3 transition-all ${
                        cardStudio.selectedDraftIndex === displayIndex
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                          : card
                          ? 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
                          : 'border-dashed border-gray-300 dark:border-gray-600'
                      }`}
                      onClick={() => card && cardStudio.setSelectedDraftIndex(displayIndex)}
                    >
                      {card ? (
                        <>
                          {/* Single front cover preview */}
                          <div className="aspect-[2/3] relative overflow-hidden rounded border mb-2 sm:mb-3">
                            <img
                              src={card.frontCover}
                              alt={`Design ${originalIndex + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {cardStudio.selectedDraftIndex === displayIndex && (
                              <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                                <div className="bg-white rounded-full p-2">
                                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Card info */}
                          <div className="text-center space-y-1 sm:space-y-2">
                            <h4 className="font-medium text-sm">Design {originalIndex + 1}</h4>
                            {cardStudio.selectedArtisticStyle === "ai-smart-style" && card.styleInfo && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                {card.styleInfo.styleLabel}
                              </p>
                            )}
                            <div className="space-y-1">
                              {cardStudio.selectedDraftIndex === displayIndex && (
                                <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full mb-1">
                                  ✓ Selected
                                </div>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cardStudio.setPreviewingDraftIndex(displayIndex);
                                }}
                                className="w-full text-xs h-7 sm:h-8"
                              >
                                <span className="hidden sm:inline">Preview Design</span>
                                <span className="sm:hidden">Preview</span>
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 sm:py-8">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2 sm:mb-3" />
                          <h4 className="font-medium text-sm mb-1">Creating...</h4>
                          <p className="text-xs text-gray-500">Generating front cover...</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Selection indicator */}
              {cardStudio.selectedDraftIndex !== -1 && cardStudio.draftIndexMapping[cardStudio.selectedDraftIndex] !== undefined && (
                <div className="text-center bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    ✓ Design {cardStudio.draftIndexMapping[cardStudio.selectedDraftIndex] + 1} selected
                  </p>
                </div>
              )}
            </div>
            
            {/* Generate button */}
            {cardStudio.draftCards.length > 0 && (
              <div className="mt-6 text-center space-y-3">
                <Button
                  onClick={() => {
                    if (cardStudio.selectedDraftIndex !== -1) {
                      cardStudio.handleGenerateFinalFromDraft(cardStudio.selectedDraftIndex);
                    }
                  }}
                  disabled={cardStudio.selectedDraftIndex === -1}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white w-full md:w-auto"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Complete High-Quality Card
                </Button>
                
                {cardStudio.selectedDraftIndex === -1 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Please select a design variation above to proceed
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      ✓ Design {cardStudio.draftIndexMapping[cardStudio.selectedDraftIndex] + 1} selected - ready to generate!
                    </p>
                    {cardStudio.draftCards.length < 5 && cardStudio.isGenerating && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Remaining variations will be cancelled to focus on your selected design
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <WizardNavigation
        currentStep={currentStep}
        totalSteps={wizardSteps.length}
        onPrevious={handlePrevious}
        onNext={handleNext}
        canProceed={canProceed}
        isGenerating={cardStudio.isGenerating}
        showGenerate={currentStep === wizardSteps.length}
        onGenerateCard={cardStudio.handleGenerateCardAsync}
        onGenerateDraftCards={cardStudio.handleGenerateDraftCards}
      />
    </div>
  );
} 