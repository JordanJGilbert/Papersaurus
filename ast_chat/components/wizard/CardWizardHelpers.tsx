"use client";

import { toast } from "sonner";
import { CardFormData } from "@/hooks/useCardForm";
import { GeneratedCard } from "@/hooks/cardStudio/constants";

// Extract card type from prompt (basic implementation)
export const extractCardTypeFromPrompt = (prompt: string): string | null => {
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

// Create a wrapper for handleFileUpload that updates both form and cardStudio
export const createFileUploadWrapper = (
  cardStudio: any,
  cardForm: any,
  updateFormData: (updates: any) => void
) => {
  return async (file: File, type: 'handwriting' | 'reference') => {
    // Store the current state before upload
    const prevImages = cardForm.formData.referenceImages || [];
    const prevUrls = cardForm.formData.referenceImageUrls || [];
    
    // Use the handleFileUpload method from cardStudio (useFileHandling hook)
    // This will properly trigger the photo analysis modal
    await cardStudio.handleFileUpload(file, type);
    
    // After successful upload, sync the form data with cardStudio state
    // For reference images, we need to sync the state immediately
    if (type === 'reference') {
      // Wait a moment to ensure cardStudio state is updated
      // This needs to be longer to avoid race conditions with CardWizardEffects
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force sync the updated state to form data
      // Get the latest state from cardStudio
      const currentImages = cardStudio.referenceImages;
      const currentUrls = cardStudio.referenceImageUrls;
      
      
      // Always update form data with the current state
      updateFormData({
        referenceImages: currentImages,
        referenceImageUrls: currentUrls
      });
    }
  };
};

// Create a wrapper for handleGetMessageHelp that updates both form and cardStudio
export const createMessageHelpWrapper = (
  cardStudio: any,
  updateFormData: (updates: any) => void
) => {
  return async () => {
    const generatedMessage = await cardStudio.handleGetMessageHelp();
    
    // After message generation, update the form data with the new message
    if (generatedMessage) {
      updateFormData({
        finalCardMessage: generatedMessage
      });
    }
  };
};

// Create wrappers for undo/redo that update both form and cardStudio
export const createUndoWrapper = (
  cardStudio: any,
  updateFormData: (updates: any) => void
) => {
  return () => {
    cardStudio.undoMessage();
    // Update form data with the new message from history
    if (cardStudio.currentMessageIndex > 0) {
      const newMessage = cardStudio.messageHistory[cardStudio.currentMessageIndex - 1];
      updateFormData({
        finalCardMessage: newMessage
      });
    }
  };
};

export const createRedoWrapper = (
  cardStudio: any,
  updateFormData: (updates: any) => void
) => {
  return () => {
    cardStudio.redoMessage();
    // Update form data with the new message from history
    if (cardStudio.currentMessageIndex < cardStudio.messageHistory.length - 1) {
      const newMessage = cardStudio.messageHistory[cardStudio.currentMessageIndex + 1];
      updateFormData({
        finalCardMessage: newMessage
      });
    }
  };
};

// Handle template selection
export const handleTemplateSelect = (
  template: any,
  updateFormData: (updates: any) => void,
  cardStudio: any
) => {
  // Update form data with template information
  updateFormData({
    prompt: template.prompt || '',
    selectedType: extractCardTypeFromPrompt(template.prompt) || cardStudio.selectedType,
    selectedArtisticStyle: template.styleInfo?.styleName || cardStudio.selectedArtisticStyle
  });
  
  // Store template info in cardStudio for later use
  cardStudio.setSelectedTemplate(template);
};

// Resume draft session
export const handleResumeDraft = (
  sessionId: string,
  cardHistory: any,
  cardForm: any,
  cardStudio: any,
  wizardState: any,
  setIsResumingDraft: (value: boolean) => void
) => {
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
      wizardState.updateCurrentStep(5);
    } else {
      // Otherwise go to content creation step
      wizardState.updateCurrentStep(2);
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