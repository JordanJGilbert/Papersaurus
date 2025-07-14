"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { PromptGenerator, DraftConfig, FinalFromDraftConfig, CardConfig } from '@/lib/promptGenerator';
import { GeneratedCard, artisticStyles, paperSizes, cardTones, PhotoReference } from './constants';
import { chatWithAI } from './utils';

interface DraftGenerationProps {
  // Form data
  selectedType: string;
  customCardType: string;
  selectedTone: string;
  selectedArtisticStyle: string;
  customStyleDescription: string;
  selectedDraftModel: string;
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
}

export function useDraftGeneration(props: DraftGenerationProps) {
  // Draft mode state
  const [isDraftMode, setIsDraftMode] = useState<boolean>(false);
  const [draftCards, setDraftCards] = useState<(GeneratedCard | null)[]>([]);
  const [selectedDraftIndex, setSelectedDraftIndex] = useState<number>(-1);
  const [isGeneratingFinalCard, setIsGeneratingFinalCard] = useState<boolean>(false);
  const [previewingDraftIndex, setPreviewingDraftIndex] = useState<number>(-1);
  const [draftCompletionShown, setDraftCompletionShown] = useState<boolean>(false);
  const [draftCompletionCount, setDraftCompletionCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generatedCard, setGeneratedCard] = useState<GeneratedCard | null>(null);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [isCardCompleted, setIsCardCompleted] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Draft mode generation - creates 5 front cover variations
  const handleGenerateDraftCards = useCallback(async () => {
    const {
      userEmail,
      selectedArtisticStyle,
      customStyleDescription,
      referenceImageUrls,
      selectedDraftModel,
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

    // Validate reference images with model compatibility
    if (referenceImageUrls.length > 0 && selectedDraftModel !== "gpt-image-1") {
      toast.error("Reference photos are only supported with GPT Image 1 model. Please switch to GPT Image 1 for draft mode or remove reference photos.");
      return;
    }

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    // Clear ALL WebSocket subscriptions before starting
    if (props.unsubscribeFromAllJobs) {
      props.unsubscribeFromAllJobs();
    }
    
    // No longer need to clear old draft jobs - storage manager handles this automatically
    
    setIsDraftMode(true);
    setIsGenerating(true);
    startElapsedTimeTracking('draft');
    setGenerationProgress("🎨 Creating 5 front cover variations for you to choose from...");
    setDraftCards([null, null, null, null, null]); // Initialize with 5 empty slots
    setSelectedDraftIndex(-1);
    setDraftCompletionShown(false);
    setDraftCompletionCount(0);
    
    // Clear any previous card state
    setGeneratedCard(null);
    setGeneratedCards([]);
    setIsCardCompleted(false);
    

    try {
      console.log("🚀 Starting draft mode generation with 5 variations");
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      
      // Use prompt if provided, otherwise create a simple default
      let effectivePrompt = prompt.trim();
      
      if (!effectivePrompt) {
        effectivePrompt = `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      }

      // Generate 5 draft variations
      const draftPromises = Array.from({ length: 5 }, async (_, index) => {
        try {
          console.log(`🎨 Starting draft variation ${index + 1}`);
          
          // Validate required props
          if (!selectedDraftModel) {
            throw new Error('selectedDraftModel is required but not provided');
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
          
          // Generate only front cover prompt for draft
          const selectedStyle = artisticStyles.find(style => style.id === (styleOverride || selectedArtisticStyle));
          
          // Use draft prompt generation config for front cover only
          const draftConfig: DraftConfig = {
            cardType: selectedType,
            customCardType: customCardType,
            tone: selectedTone,
            toneLabel: selectedToneObj ? selectedToneObj.label : "Heartfelt",
            toneDescription: toneDescription,
            theme: effectivePrompt,
            toField: toField,
            fromField: fromField,
            relationshipField: props.relationshipField,
            personalTraits: props.personalTraits,
            artisticStyle: selectedStyle,
            referenceImageUrls: referenceImageUrls,
            photoReferences: props.photoReferences,
            isDraftVariation: selectedArtisticStyle === "ai-smart-style",
            variationIndex: index
          };

          // Generate creative front cover prompt using AI
          const frontCoverPrompt = await PromptGenerator.generateCreativeDraftPrompt(draftConfig);

          if (!frontCoverPrompt?.trim()) {
            throw new Error("Failed to generate front cover prompt");
          }

          // Generate the images
          const jobId = `draft-${index}-${uuidv4()}`;
          const inputImages: string[] = [];
          if (referenceImageUrls.length > 0 && selectedDraftModel === "gpt-image-1") {
            inputImages.push(...referenceImageUrls);
          }

          // Log the request payload for debugging
          const requestPayload = {
            jobId,
            prompts: {
              frontCover: frontCoverPrompt
              // Only send front cover prompt for drafts
            },
            config: {
              userNumber: "+17145986105",
              modelVersion: selectedDraftModel,
              aspectRatio: paperSizes.find(size => size.id === selectedPaperSize)?.aspectRatio || "9:16",
              quality: "medium", // Use medium quality for drafts (better than low, faster than high)
              outputFormat: "jpeg",
              outputCompression: 85, // Slightly lower compression for drafts
              moderation: "low",
              dimensions: paperSizes.find(size => size.id === selectedPaperSize)?.dimensions || "1024x1536",
              isFrontBackOnly: true, // Force front-only for drafts
              userEmail,
              cardType: cardTypeForPrompt,
              toField,
              fromField,
              isDraftMode: true,
              ...(inputImages.length > 0 && { 
                input_images: inputImages,
                input_images_mode: "front_cover_only"
              })
            }
          };

          console.log(`📦 Draft ${index + 1} request payload:`, {
            jobId,
            promptsExist: !!frontCoverPrompt,
            promptKeys: ['frontCover'],
            modelVersion: selectedDraftModel,
            paperSize: selectedPaperSize,
            email: userEmail
          });

          const response = await fetch('/api/generate-card-async', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server error response for draft ${index + 1}:`, errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          
          if (result.status !== 'processing') {
            throw new Error(result.message || 'Failed to start draft generation');
          }

          console.log(`✅ Draft variation ${index + 1} job started:`, jobId);
          
          // Save draft job to storage for recovery
          saveJobToStorage(jobId, {
            isDraft: true,
            draftIndex: index,
            styleInfo: styleOverride ? { styleName: styleOverride, styleLabel: styleLabel } : undefined,
            frontCoverPrompt: frontCoverPrompt,
            generatedPrompts: { frontCover: frontCoverPrompt }, // Store only front cover prompt
            userEmail,
            selectedType,
            selectedTone,
            toField,
            fromField,
            draftCards: []  // Will be updated as drafts complete
          });

          // Subscribe to WebSocket updates
          subscribeToJob(jobId);

        } catch (error) {
          console.error(`❌ Draft variation ${index + 1} failed:`, error);
          console.error('Full error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace',
            error: error
          });
          toast.error(`Draft variation ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Wait for all draft generations to start
      await Promise.allSettled(draftPromises);
      console.log("🚀 All draft variations started");

    } catch (error) {
      console.error('Draft card generation error:', error);
      toast.error(`Failed to start draft generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      setIsGenerating(false);
      setIsDraftMode(false);
      setDraftCompletionShown(false);
      setDraftCompletionCount(0);
      setGenerationProgress("");
      props.stopElapsedTimeTracking();
    }
  }, [props]);

  // Generate final high-quality card from selected draft
  const handleGenerateFinalFromDraft = useCallback(async (displayIndex: number) => {
    // Prevent duplicate calls
    if (isGeneratingFinalCard) {
      console.log('⚠️ Final card generation already in progress, skipping duplicate call');
      return;
    }
    
    const selectedDraft = draftCards[displayIndex];
    if (!selectedDraft) {
      toast.error("Please wait for the draft to complete before selecting");
      return;
    }

    const {
      selectedType,
      customCardType,
      selectedTone,
      prompt,
      personalTraits,
      toField,
      fromField,
      finalCardMessage,
      isHandwrittenMessage,
      selectedArtisticStyle,
      customStyleDescription,
      isFrontBackOnly,
      selectedImageModel,
      selectedPaperSize,
      userEmail,
      referenceImageUrls,
      startElapsedTimeTracking,
      subscribeToJob
    } = props;

    // Stop any existing timers first
    props.stopElapsedTimeTracking();
    
    setIsGeneratingFinalCard(true);
    setIsDraftMode(false); // Switch out of draft mode for final generation
    setSelectedDraftIndex(displayIndex);
    startElapsedTimeTracking('final');
    setGenerationProgress("🎨 Creating the complete card based on your selected front cover...");

    try {
      const jobId = uuidv4();
      
      // Generate the missing prompts
      const storedFrontCoverPrompt = selectedDraft.generatedPrompts?.frontCover;
      if (!storedFrontCoverPrompt) {
        throw new Error("Selected draft is missing frontCover prompt");
      }
      
      const cardTypeForPrompt = selectedType === "custom" ? customCardType : selectedType;
      const selectedToneObj = cardTones.find(tone => tone.id === selectedTone);
      const toneDescription = selectedToneObj ? selectedToneObj.description.toLowerCase() : "heartfelt and sincere";
      const effectivePrompt = prompt.trim() || `A beautiful ${cardTypeForPrompt} card with ${toneDescription} style`;
      
      let messageContent = finalCardMessage;
      if (isHandwrittenMessage) {
        messageContent = "[Blank space for handwritten message]";
      }
      
      // Get style from the selected draft
      const draftStyleInfo = selectedDraft.styleInfo;
      let selectedStyle;
      if (draftStyleInfo && draftStyleInfo.styleName) {
        selectedStyle = artisticStyles.find(style => style.id === draftStyleInfo.styleName);
      } else {
        selectedStyle = artisticStyles.find(style => style.id === selectedArtisticStyle);
      }
      
      // Use PromptGenerator for final card from draft
      const finalFromDraftConfig: FinalFromDraftConfig = {
        frontCoverPrompt: storedFrontCoverPrompt,
        cardType: selectedType,
        customCardType: customCardType,
        theme: effectivePrompt,
        tone: selectedTone,
        toneDescription: toneDescription,
        toField: toField,
        fromField: fromField,
        message: messageContent,
        isHandwrittenMessage: isHandwrittenMessage,
        artisticStyle: selectedStyle,
        isFrontBackOnly: isFrontBackOnly
      };

      const finalPrompts = await PromptGenerator.generateFinalFromDraftPromptsCombined(finalFromDraftConfig);

      if (!finalPrompts || !finalPrompts.frontCover || !finalPrompts.backCover) {
        throw new Error("Failed to generate complete prompts for final card");
      }
      
      // Prepare input images for final generation
      const inputImages: string[] = [];
      
      // Add the selected draft's front cover as a reference image for the final front cover
      if (selectedDraft.frontCover) {
        inputImages.push(selectedDraft.frontCover);
        console.log('🖼️ Adding draft front cover as reference for final front cover generation');
      }
      
      // Also include any user-uploaded reference images
      if (referenceImageUrls.length > 0 && selectedImageModel === "gpt-image-1") {
        inputImages.push(...referenceImageUrls);
      }

      const response = await fetch('/api/generate-card-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          prompts: finalPrompts,
          config: {
            userNumber: "+17145986105",
            modelVersion: selectedImageModel,
            aspectRatio: paperSizes.find(size => size.id === selectedPaperSize)?.aspectRatio || "9:16",
            quality: "high",
            outputFormat: "jpeg",
            outputCompression: 100,
            moderation: "low",
            dimensions: paperSizes.find(size => size.id === selectedPaperSize)?.dimensions || "1024x1536",
            isFrontBackOnly,
            userEmail,
            cardType: selectedType === "custom" ? customCardType : selectedType,
            toField,
            fromField,
            isDraftMode: false,
            ...(inputImages.length > 0 && { 
              input_images: inputImages,
              input_images_mode: "front_cover_only"  // Use images as reference for front cover only
            })
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.status !== 'processing') {
        throw new Error(result.message || 'Failed to start final card generation');
      }

      setCurrentJobId(jobId);
      
      // Save job data for recovery
      const jobData = {
        jobId,
        selectedDraftIndex: displayIndex,
        cardType: selectedType,
        customCardType,
        tone: selectedTone,
        prompt,
        personalTraits,
        toField,
        fromField,
        finalCardMessage,
        isHandwrittenMessage,
        selectedArtisticStyle,
        isFrontBackOnly,
        selectedPaperSize,
        userEmail,
        referenceImageUrls
      };
      props.saveJobToStorage(jobId, jobData);
      
      toast.success("🎨 Generating high-quality version of your selected design!");
      
      // Subscribe to WebSocket updates
      subscribeToJob(jobId);

    } catch (error) {
      console.error('Final card generation error:', error);
      toast.error("Failed to generate final card. Please try again.");
      setIsGeneratingFinalCard(false);
      setGenerationProgress("");
      props.stopElapsedTimeTracking(); // Clear time-based progress on error
    }
  }, [draftCards, isGeneratingFinalCard, props]);

  return {
    isDraftMode,
    setIsDraftMode,
    draftCards,
    setDraftCards,
    selectedDraftIndex,
    setSelectedDraftIndex,
    isGeneratingFinalCard,
    setIsGeneratingFinalCard,
    previewingDraftIndex,
    setPreviewingDraftIndex,
    draftCompletionShown,
    setDraftCompletionShown,
    draftCompletionCount,
    setDraftCompletionCount,
    handleGenerateDraftCards,
    handleGenerateFinalFromDraft,
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    generatedCard,
    setGeneratedCard,
    generatedCards,
    setGeneratedCards,
    isCardCompleted,
    setIsCardCompleted,
    currentJobId,
    setCurrentJobId
  };
}