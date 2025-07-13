"use client";

import { useState, useCallback, useEffect } from "react";
import { storage } from "@/lib/storageManager";

export interface CardFormData {
  // Step 1: Card Basics
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  toField: string;
  fromField: string;
  relationshipField: string;

  // Step 2: Content Creation
  prompt: string;
  finalCardMessage: string;
  isHandwrittenMessage: boolean;

  // Step 3: Personalization
  selectedArtisticStyle: string;
  customStyleDescription: string;
  referenceImages: File[];
  referenceImageUrls: string[];
  photoReferences?: Array<{ imageUrl: string; imageIndex: number; description?: string; }>;
  favoriteActivities?: string;
  favoriteFoods?: string;
  hobbiesInterests?: string;

  // Step 4: Details
  userEmail: string;
  selectedImageModel: string;
  selectedDraftModel: string;
  selectedPaperSize: string;
  numberOfCards: number;
  isFrontBackOnly: boolean;
}

const defaultFormData: CardFormData = {
  // Step 1: Card Basics
  selectedType: "birthday",
  customCardType: "",
  selectedTone: "funny",
  toField: "",
  fromField: "",
  relationshipField: "",

  // Step 2: Content Creation
  prompt: "",
  finalCardMessage: "",
  isHandwrittenMessage: false,

  // Step 3: Personalization
  selectedArtisticStyle: "ai-smart-style",
  customStyleDescription: "",
  referenceImages: [],
  referenceImageUrls: [],

  // Step 4: Details
  userEmail: "",
  selectedImageModel: "gpt-image-1",
  selectedDraftModel: "gpt-image-1",
  selectedPaperSize: "standard",
  numberOfCards: 1,
  isFrontBackOnly: false,
};

// Helper function to create serializable form data (excludes File objects)
const createSerializableFormData = (formData: CardFormData): Omit<CardFormData, 'referenceImages'> => {
  const { referenceImages, ...serializableData } = formData;
  return serializableData;
};

export function useCardForm() {
  const [formData, setFormData] = useState<CardFormData>(defaultFormData);
  const [wizardState, setWizardState] = useState({ currentStep: 1, completedSteps: [] as number[] });
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Initialize form data from storage on component mount (after hydration)
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialLoadComplete) {
      const session = storage.getSession();
      if (session) {
        setFormData({
          ...defaultFormData,
          ...session.formData,
          referenceImages: [], // Always reset File objects
        });
        setWizardState(session.wizardState);
      }
      setIsInitialLoadComplete(true);
    }
  }, [isInitialLoadComplete]);

  // Save form data to storage whenever it changes
  useEffect(() => {
    if (!isInitialLoadComplete) return;

    const serializableData = createSerializableFormData(formData);
    storage.saveSession(serializableData, wizardState);
  }, [formData, wizardState, isInitialLoadComplete]);

  const updateFormData = useCallback((updates: Partial<CardFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const resetForm = useCallback(() => {
    setFormData(defaultFormData);
    setWizardState({ currentStep: 1, completedSteps: [] });
    storage.clearSession();
  }, []);

  const clearStoredData = useCallback(() => {
    storage.clearAll();
  }, []);

  const updateWizardState = useCallback((updates: Partial<typeof wizardState>) => {
    setWizardState(prev => ({ ...prev, ...updates }));
  }, []);

  const markStepCompleted = useCallback((step: number) => {
    setWizardState(prev => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step) 
        ? prev.completedSteps 
        : [...prev.completedSteps, step]
    }));
  }, []);

  const resetWizardState = useCallback(() => {
    setWizardState({ currentStep: 1, completedSteps: [] });
  }, []);

  const validateStep = useCallback((step: number): boolean => {
    switch (step) {
      case 1: // Card Basics
        // Card type is required
        if (!formData.selectedType) return false;
        // If custom type is selected, custom description is required
        if (formData.selectedType === "custom" && !formData.customCardType.trim()) return false;
        // Tone is required
        if (!formData.selectedTone) return false;
        // If photos are uploaded, they must have descriptions
        if (formData.referenceImageUrls.length > 0) {
          // Check if we have photoReferences data
          if (!formData.photoReferences || formData.photoReferences.length === 0) return false;
          // Check if all photos have descriptions
          const allHaveDescriptions = formData.photoReferences.every(ref => ref.description && ref.description.trim());
          if (!allHaveDescriptions) return false;
        }
        return true;

      case 2: // Content Creation
        // All fields are optional - let AI generate defaults
        return true;

      case 3: // Personalization
        // All fields are optional
        // If custom style is selected, description is required
        if (formData.selectedArtisticStyle === "custom" && !formData.customStyleDescription.trim()) return false;
        // If reference images with incompatible model
        if (formData.referenceImageUrls.length > 0 && formData.selectedImageModel !== "gpt-image-1") return false;
        return true;

      case 4: // Details
        // Email is required
        if (!formData.userEmail.trim()) return false;
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.userEmail)) return false;
        return true;

      case 5: // Generate
        // All previous steps must be valid
        return validateStep(1) && validateStep(2) && validateStep(3) && validateStep(4);

      default:
        return false;
    }
  }, [formData]);

  const getStepSummary = useCallback((step: number): string[] => {
    const summary: string[] = [];
    
    switch (step) {
      case 1:
        const cardType = formData.selectedType === "custom" ? formData.customCardType : formData.selectedType;
        summary.push(`Card Type: ${cardType || "Not selected"}`);
        summary.push(`Tone: ${formData.selectedTone || "Not selected"}`);
        if (formData.toField) summary.push(`To: ${formData.toField}`);
        if (formData.fromField) summary.push(`From: ${formData.fromField}`);
        break;

      case 2:
        if (formData.prompt) summary.push(`Description: ${formData.prompt.substring(0, 50)}...`);
        if (formData.finalCardMessage) summary.push(`Message: ${formData.finalCardMessage.substring(0, 50)}...`);
        if (formData.isHandwrittenMessage) summary.push("Handwritten message space included");
        break;

      case 3:
        summary.push(`Style: ${formData.selectedArtisticStyle}`);
        if (formData.referenceImageUrls.length > 0) {
          summary.push(`Reference photos: ${formData.referenceImageUrls.length} uploaded`);
        }
        break;

      case 4:
        summary.push(`Email: ${formData.userEmail}`);
        summary.push(`Model: ${formData.selectedImageModel}`);
        summary.push(`Paper: ${formData.selectedPaperSize}`);
        if (formData.isFrontBackOnly) summary.push("Front/back only");
        break;
    }

    return summary;
  }, [formData]);

  const getValidationErrors = useCallback((step: number): string[] => {
    const errors: string[] = [];

    switch (step) {
      case 1:
        if (!formData.selectedType) errors.push("Please select a card type");
        if (formData.selectedType === "custom" && !formData.customCardType.trim()) {
          errors.push("Please describe your custom card type");
        }
        if (!formData.selectedTone) errors.push("Please select a tone");
        // Check photo descriptions
        if (formData.referenceImageUrls.length > 0) {
          if (!formData.photoReferences || formData.photoReferences.length === 0) {
            errors.push("Please describe who's in your photos");
          } else {
            const missingDescriptions = formData.photoReferences.filter(ref => !ref.description || !ref.description.trim()).length;
            if (missingDescriptions > 0) {
              errors.push(`Please describe who's in ${missingDescriptions} photo${missingDescriptions > 1 ? 's' : ''}`);
            }
          }
        }
        break;

      case 3:
        if (formData.selectedArtisticStyle === "custom" && !formData.customStyleDescription.trim()) {
          errors.push("Please describe your custom artistic style");
        }
        if (formData.referenceImageUrls.length > 0 && formData.selectedImageModel !== "gpt-image-1") {
          errors.push("Reference photos are only supported with GPT Image 1 model");
        }
        break;

      case 4:
        if (!formData.userEmail.trim()) {
          errors.push("Email address is required");
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(formData.userEmail)) {
            errors.push("Please enter a valid email address");
          }
        }
        break;
    }

    return errors;
  }, [formData]);

  return {
    formData,
    updateFormData,
    resetForm,
    clearStoredData,
    validateStep,
    getStepSummary,
    getValidationErrors,
    isInitialLoadComplete,
    wizardState: {
      ...wizardState,
      updateCurrentStep: (step: number) => updateWizardState({ currentStep: step }),
      markStepCompleted,
      resetWizardState,
    },
    updateWizardState,
  };
} 