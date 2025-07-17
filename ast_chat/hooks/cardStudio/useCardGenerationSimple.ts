"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { PromptGenerator, CardConfig } from '@/lib/promptGenerator';
import { GeneratedCard, artisticStyles, paperSizes, cardTones, PhotoReference } from './constants';
import { chatWithAI } from './utils';

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
  
  // Job management
  saveJobToStorage: (jobId: string, jobData: any) => void;
  subscribeToJob: (jobId: string) => void;
  unsubscribeFromAllJobs?: () => void;
  startElapsedTimeTracking: (jobType?: 'draft' | 'final') => void;
  stopElapsedTimeTracking: () => void;
  setProgressPercentage?: (percentage: number) => void;
}

export function useCardGenerationSimple(props: CardGenerationProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(-1);
  const [isCardCompleted, setIsCardCompleted] = useState(false);
  const [currentJobIds, setCurrentJobIds] = useState<string[]>([]);

  // Generate 5 complete high-quality cards
  const handleGenerateCards = useCallback(async () => {
    const {
      userEmail,
      selectedArtisticStyle,
      customStyleDescription,
      referenceImageUrls,
      selectedImageModel,
      selectedType,
      customCardType,
      selectedTone,
      prompt,
      personalTraits,
      toField,
      fromField,
      selectedPaperSize,
      finalCardMessage,
      isHandwrittenMessage,
      isFrontBackOnly,
      saveJobToStorage,
      subscribeToJob,
      startElapsedTimeTracking
    } = props;

    if (!userEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Validate custom style if selected
    if (selectedArtisticStyle === "custom" && !customStyleDescription.trim()) {
      toast.error("Please describe your custom artistic style");
      return;
    }

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    // Clear ALL WebSocket subscriptions before starting
    if (props.unsubscribeFromAllJobs) {
      props.unsubscribeFromAllJobs();
    }
    
    // Clear progress text immediately before setting new state
    setGenerationProgress("");
    
    setIsGenerating(true);
    startElapsedTimeTracking('final'); // Use 'final' for high-quality
    setGenerationProgress("🎨 Creating 5 unique card variations for you to choose from...");
    setGeneratedCards([]); // Clear previous cards
    setSelectedCardIndex(-1);
    setIsCardCompleted(false);
    
    // Clear saved final card from localStorage when starting new generation
    localStorage.removeItem('vibe-final-card');
    console.log('🧹 Cleared saved final card');

    try {
      console.log("🚀 Starting card generation with 5 variations");
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      
      // Use prompt if provided, otherwise create a simple default
      let effectivePrompt = prompt.trim();
      
      if (!effectivePrompt) {
        effectivePrompt = `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      }

      let messageContent = finalCardMessage;
      // Treat empty messages as handwritten
      if (isHandwrittenMessage || !finalCardMessage || finalCardMessage.trim() === '') {
        messageContent = "[Blank space for handwritten message]";
      }

      // Generate 5 card variations
      const cardPromises = Array.from({ length: 5 }, async (_, index) => {
        try {
          console.log(`🎨 Starting card variation ${index + 1}`);
          
          // Validate required props
          if (!selectedImageModel) {
            throw new Error('selectedImageModel is required but not provided');
          }
          if (!selectedPaperSize) {
            throw new Error('selectedPaperSize is required but not provided');
          }
          if (!userEmail) {
            throw new Error('userEmail is required but not provided');
          }
          
          // For smart style, use predefined styles
          let styleOverride: string | undefined = undefined;
          let styleLabel: string | undefined = undefined;
          if (selectedArtisticStyle === "ai-smart-style") {
            const predefinedStyles = ["watercolor", "botanical", "comic-book", "dreamy-fantasy", "minimalist"];
            const styleLabels = ["🎨 Watercolor", "🌿 Botanical", "💥 Comic Book", "🌸 Dreamy Fantasy", "✨ Minimalist"];
            
            styleOverride = predefinedStyles[index];
            styleLabel = styleLabels[index];
          }
          
          // Generate complete card prompts
          const selectedStyle = artisticStyles.find(style => style.id === (styleOverride || selectedArtisticStyle));
          
          const cardConfig: CardConfig = {
            cardType: selectedType,
            customCardType: customCardType,
            tone: selectedTone,
            toneDescription: toneDescription,
            theme: effectivePrompt,
            toField: toField,
            fromField: fromField,
            relationshipField: props.relationshipField,
            personalTraits: props.personalTraits,
            message: messageContent,
            isHandwrittenMessage: isHandwrittenMessage,
            artisticStyle: selectedStyle,
            referenceImageUrls: referenceImageUrls,
            photoReferences: props.photoReferences,
            isFrontBackOnly: isFrontBackOnly,
            selectedImageModel: selectedImageModel
          };

          // Generate all 4 prompts at once
          const cardPrompts = await PromptGenerator.generateCardPrompts(cardConfig);

          if (!cardPrompts || !cardPrompts.frontCover || !cardPrompts.backCover) {
            throw new Error("Failed to generate complete prompts");
          }

          // Generate the images
          const jobId = `card-${index}-${uuidv4()}`;
          const inputImages: string[] = [];
          if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-image-1") {
            inputImages.push(...referenceImageUrls);
          }

          // Log the request payload for debugging
          const requestPayload = {
            jobId,
            prompts: cardPrompts, // Send all 4 prompts
            config: {
              userNumber: "+17145986105",
              modelVersion: selectedImageModel,
              aspectRatio: paperSizes.find(size => size.id === selectedPaperSize)?.aspectRatio || "9:16",
              quality: "high", // High quality for final cards
              outputFormat: "jpeg",
              outputCompression: 100,
              moderation: "low",
              dimensions: paperSizes.find(size => size.id === selectedPaperSize)?.dimensions || "1024x1536",
              isFrontBackOnly,
              userEmail,
              cardType: cardTypeForPrompt,
              toField,
              fromField,
              isDraftMode: false, // Not draft mode
              ...(inputImages.length > 0 && { 
                input_images: inputImages,
                input_images_mode: "front_cover_only"
              })
            }
          };

          console.log(`📦 Card ${index + 1} request payload:`, {
            jobId,
            promptsExist: !!cardPrompts,
            promptKeys: Object.keys(cardPrompts),
            modelVersion: selectedImageModel,
            paperSize: selectedPaperSize,
            email: userEmail,
            quality: "high"
          });

          const response = await fetch('/api/generate-card-async', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error response for card ${index + 1}:`, errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          
          if (result.status !== 'processing') {
            throw new Error(result.message || 'Failed to start card generation');
          }

          console.log(`✅ Card variation ${index + 1} job started:`, jobId);
          
          // Save job to storage for recovery
          saveJobToStorage(jobId, {
            isComplete: false,
            cardIndex: index,
            styleInfo: styleOverride ? { styleName: styleOverride, styleLabel: styleLabel } : undefined,
            generatedPrompts: cardPrompts,
            userEmail,
            selectedType,
            selectedTone,
            toField,
            fromField
          });

          // Subscribe to WebSocket updates
          subscribeToJob(jobId);
          
          // Track job IDs
          setCurrentJobIds(prev => [...prev, jobId]);

        } catch (error) {
          console.error(`❌ Card variation ${index + 1} failed:`, error);
          console.error('Full error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            error: error
          });
          toast.error(`Card variation ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Wait for all card generations to start
      await Promise.allSettled(cardPromises);
      console.log("🚀 All card variations started");

    } catch (error) {
      console.error('Card generation error:', error);
      toast.error(`Failed to start card generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      setIsGenerating(false);
      setGenerationProgress("");
      props.stopElapsedTimeTracking();
    }
  }, [props]);

  return {
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    generatedCards,
    setGeneratedCards,
    selectedCardIndex,
    setSelectedCardIndex,
    isCardCompleted,
    setIsCardCompleted,
    currentJobIds,
    setCurrentJobIds,
    handleGenerateCards
  };
}