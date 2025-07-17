"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { PromptGenerator, CardConfig } from '@/lib/promptGenerator';
import { GeneratedCard, cardTones, artisticStyles, paperSizes, PhotoReference } from './constants';
import { chatWithAI, sendThankYouEmail, scrollToCardPreview } from './utils';

interface CardGenerationProps {
  // Form data
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  selectedArtisticStyle: string;
  customStyleDescription: string;
  selectedImageModel: string;
  selectedPaperSize: string;
  prompt: string;
  personalTraits?: string;
  toField: string;
  fromField: string;
  relationshipField: string;
  userEmail: string;
  finalCardMessage: string;
  isHandwrittenMessage: boolean;
  isFrontBackOnly: boolean;
  referenceImageUrls: string[];
  photoReferences?: PhotoReference[];
  numberOfCards: number;
  
  // Job management
  saveJobToStorage: (jobId: string, jobData: any) => void;
  removeJobFromStorage: (jobId: string) => void;
  subscribeToJob: (jobId: string) => void;
  startElapsedTimeTracking: (jobType?: 'draft' | 'final') => void;
  stopElapsedTimeTracking: () => void;
  setCurrentJobId: (id: string | null) => void;
  
  // Draft state setters
  setIsDraftMode: (value: boolean) => void;
  setDraftCards: (value: any) => void;
  setSelectedDraftIndex: (value: number) => void;
  setIsGeneratingFinalCard: (value: boolean) => void;
  setPreviewingDraftIndex: (value: number) => void;
  setDraftCompletionShown: (value: boolean) => void;
  setDraftCompletionCount: (value: number) => void;
}

export function useCardGeneration(props: CardGenerationProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);
  const [isCardCompleted, setIsCardCompleted] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [currentCardId, setCurrentCardId] = useState<string | null>(null);
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);

  // Handle final card completion
  const handleFinalCardCompletion = useCallback(async (cardData: any) => {
    console.log('🎯 handleFinalCardCompletion called with cardData:', cardData);
    console.log('🎯 Current userEmail state:', props.userEmail);
    console.log('🎯 Current states:', {
      isGenerating,
      isCardCompleted,
      generatedCard: generatedCard ? 'Present' : 'None'
    });
    let cardWithQR = { ...cardData };
    
    // Ensure the card has a valid createdAt date
    if (!cardWithQR.createdAt) {
      cardWithQR.createdAt = new Date();
    } else if (typeof cardWithQR.createdAt === 'string' || typeof cardWithQR.createdAt === 'number') {
      cardWithQR.createdAt = new Date(cardWithQR.createdAt);
    }
    
    // Ensure the card has a valid ID
    if (!cardWithQR.id) {
      cardWithQR.id = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Add message data for handwritten overlay
    // Treat empty messages as handwritten
    if (props.isHandwrittenMessage || !props.finalCardMessage || props.finalCardMessage.trim() === '') {
      cardWithQR.message = props.finalCardMessage || '';
      cardWithQR.isHandwrittenMessage = true;
    }
    
    console.log('🔄 Final card data prepared:', cardWithQR);
    
    // Note: QR code overlay is now handled automatically by the backend
    console.log('✅ Card completion processing finished - QR codes handled by backend');
    
    console.log('🎯 Setting final card state:', cardWithQR);
    
    // Set the card states
    setGeneratedCard(cardWithQR);
    setGeneratedCards([cardWithQR]);
    setSelectedCardIndex(0);
    setIsCardCompleted(true);
    setGenerationProgress("🎉 Your beautiful card is ready!");
    
    // Scroll to the card preview
    scrollToCardPreview();
    
    // Clear the current job
    setCurrentCardId(null);
    props.stopElapsedTimeTracking();
    
    // Call sendThankYouEmail regardless of generation method
    console.log('🎯 Attempting to send thank you email after final card completion');
    console.log('🎯 Card data being sent:', {
      id: cardWithQR.id,
      userEmail: props.userEmail,
      frontCover: cardWithQR.frontCover ? 'Present' : 'Missing',
      backCover: cardWithQR.backCover ? 'Present' : 'Missing',
      leftInterior: cardWithQR.leftInterior ? 'Present' : 'Missing',
      rightInterior: cardWithQR.rightInterior ? 'Present' : 'Missing',
    });
    
    try {
      const cardUrl = `https://vibecarding.com/cards/${cardWithQR.id}`;
      const cardType = props.customCardType || props.selectedType || 'Card';
      await sendThankYouEmail(props.userEmail, cardType, cardUrl);
      console.log('✅ Thank you email sent successfully');
    } catch (error) {
      console.error('❌ Failed to send thank you email:', error);
      // Don't show error to user - email is not critical to card generation
    }
    
    // Show completion message
    toast.success("🎉 Your card is ready! Check your email for the downloadable version.");
    
    console.log('✅ Final card completion process finished successfully');
    console.log('✅ Final states:', {
      isCardCompleted: true,
      generatedCard: cardWithQR
    });
  }, [props, isGenerating, isCardCompleted, generatedCard]);

  return {
    isGenerating,
    setIsGenerating,
    generatedCard,
    setGeneratedCard,
    generatedCards,
    setGeneratedCards,
    selectedCardIndex,
    setSelectedCardIndex,
    isCardCompleted,
    setIsCardCompleted,
    generationProgress,
    setGenerationProgress,
    currentCardId,
    setCurrentCardId,
    generationDuration,
    setGenerationDuration,
    handleFinalCardCompletion
  };
}