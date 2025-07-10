"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';

// Import modular hooks
import { useWebSocket } from './cardStudio/useWebSocket';
import { useJobManagement } from './cardStudio/useJobManagement';
import { useMessageGeneration } from './cardStudio/useMessageGeneration';
import { useFileHandling } from './cardStudio/useFileHandling';
import { useDraftGeneration } from './cardStudio/useDraftGeneration';
import { useCardGeneration } from './cardStudio/useCardGeneration';

// Import constants and utils
import { 
  cardTones, 
  artisticStyles, 
  paperSizes, 
  formatGenerationTime, 
  formatCountdown,
  GeneratedCard 
} from './cardStudio/constants';
import { sendThankYouEmail, chatWithAI, scrollToCardPreview } from './cardStudio/utils';

export function useCardStudio() {
  // Core form state
  const [prompt, setPrompt] = useState("");
  const [toField, setToField] = useState("");
  const [fromField, setFromField] = useState("");
  const [selectedType, setSelectedType] = useState<string>("birthday");
  const [customCardType, setCustomCardType] = useState<string>("");
  const [selectedTone, setSelectedTone] = useState<string>("funny");
  
  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("watercolor");
  const [customStyleDescription, setCustomStyleDescription] = useState<string>("");
  const [selectedImageModel, setSelectedImageModel] = useState<string>("gpt-image-1");
  const [selectedDraftModel, setSelectedDraftModel] = useState<string>("gpt-image-1");
  const [fastPreviewMode, setFastPreviewMode] = useState<boolean>(true);
  
  // Email state
  const [userEmail, setUserEmail] = useState<string>("");
  
  // Card options
  const [numberOfCards, setNumberOfCards] = useState<number>(1);
  const [isHandwrittenMessage, setIsHandwrittenMessage] = useState(false);
  const [isFrontBackOnly, setIsFrontBackOnly] = useState(false);
  const [selectedPaperSize, setSelectedPaperSize] = useState<string>("standard");
  
  // UI state
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showPrintConfirmation, setShowPrintConfirmation] = useState(false);
  const [showTemplateCustomization, setShowTemplateCustomization] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratedCard | null>(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  
  // Template state
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [isSearchingTemplates, setIsSearchingTemplates] = useState(false);
  const [aiFilteredCards, setAiFilteredCards] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState<'text' | 'ai' | 'hybrid'>('text');
  const [textFilteredCards, setTextFilteredCards] = useState<any[]>([]);
  const [showPrompts, setShowPrompts] = useState(false);
  const [printOption, setPrintOption] = useState<'physical' | 'email'>('physical');
  
  // Template customization state
  const [templateCustomizations, setTemplateCustomizations] = useState({
    promptChanges: "",
    messageChanges: "",
    useReferenceImage: false,
    referenceImageFile: null as File | null,
    referenceImageUrls: [] as string[],
    referenceImageTransformation: ""
  });
  
  // Section loading states
  const [sectionLoadingStates, setSectionLoadingStates] = useState<{
    frontCover: 'idle' | 'loading' | 'completed' | 'error';
    backCover: 'idle' | 'loading' | 'completed' | 'error';
    leftInterior: 'idle' | 'loading' | 'completed' | 'error';
    rightInterior: 'idle' | 'loading' | 'completed' | 'error';
  }>({
    frontCover: 'idle',
    backCover: 'idle',
    leftInterior: 'idle',
    rightInterior: 'idle',
  });
  
  // Countdown state
  const [countdown, setCountdown] = useState<number>(0);
  const [countdownInterval, setCountdownInterval] = useState<NodeJS.Timeout | null>(null);

  // Use modular hooks
  const webSocket = useWebSocket();
  const jobManagement = useJobManagement();
  const fileHandling = useFileHandling();
  const messageGeneration = useMessageGeneration(
    selectedType,
    customCardType,
    selectedTone,
    prompt,
    toField,
    fromField,
    fileHandling.photoAnalyses
  );
  
  // Draft generation props
  const draftGenerationProps = {
    selectedType,
    customCardType,
    selectedTone,
    selectedArtisticStyle,
    customStyleDescription,
    selectedDraftModel,
    selectedImageModel,
    selectedPaperSize,
    prompt,
    toField,
    fromField,
    userEmail,
    finalCardMessage: messageGeneration.finalCardMessage,
    isHandwrittenMessage,
    isFrontBackOnly,
    referenceImageUrls: fileHandling.referenceImageUrls,
    photoAnalyses: fileHandling.photoAnalyses,
    saveJobToStorage: jobManagement.saveJobToStorage,
    subscribeToJob: webSocket.subscribeToJob,
    startElapsedTimeTracking: jobManagement.startElapsedTimeTracking,
    stopElapsedTimeTracking: jobManagement.stopElapsedTimeTracking,
  };
  
  const draftGeneration = useDraftGeneration(draftGenerationProps);
  
  // Card generation props
  const cardGenerationProps = {
    selectedType,
    customCardType,
    selectedTone,
    selectedArtisticStyle,
    customStyleDescription,
    selectedImageModel,
    selectedPaperSize,
    prompt,
    toField,
    fromField,
    userEmail,
    finalCardMessage: messageGeneration.finalCardMessage,
    isHandwrittenMessage,
    isFrontBackOnly,
    referenceImageUrls: fileHandling.referenceImageUrls,
    photoAnalyses: fileHandling.photoAnalyses,
    numberOfCards,
    saveJobToStorage: jobManagement.saveJobToStorage,
    removeJobFromStorage: jobManagement.removeJobFromStorage,
    subscribeToJob: webSocket.subscribeToJob,
    startElapsedTimeTracking: jobManagement.startElapsedTimeTracking,
    stopElapsedTimeTracking: jobManagement.stopElapsedTimeTracking,
    setCurrentJobId: jobManagement.setCurrentJobId,
    setIsDraftMode: draftGeneration.setIsDraftMode,
    setDraftCards: draftGeneration.setDraftCards,
    setDraftIndexMapping: draftGeneration.setDraftIndexMapping,
    setSelectedDraftIndex: draftGeneration.setSelectedDraftIndex,
    setIsGeneratingFinalCard: draftGeneration.setIsGeneratingFinalCard,
    setPreviewingDraftIndex: draftGeneration.setPreviewingDraftIndex,
    setDraftCompletionShown: draftGeneration.setDraftCompletionShown,
    setDraftCompletionCount: draftGeneration.setDraftCompletionCount,
  };
  
  const cardGeneration = useCardGeneration(cardGenerationProps);

  // Handle job updates from WebSocket
  const handleJobUpdate = useCallback((data: any) => {
    const { job_id, status, progress, cardData, error, completedAt } = data;
    
    if (!job_id) return;
    
    // Check if this is a draft job
    const isDraftJob = job_id.startsWith('draft-');
    const draftIndex = isDraftJob ? parseInt(job_id.split('-')[1]) : -1;
    
    console.log('🔄 Processing job update:', { job_id, status, isDraftJob, draftIndex, progress });
    
    // Update progress if provided
    if (progress) {
      cardGeneration.setGenerationProgress(progress);
      draftGeneration.setGenerationProgress(progress);
      
      // Extract percentage from progress string if possible
      const percentMatch = progress.match(/(\d+)%/);
      if (percentMatch) {
        const percent = parseInt(percentMatch[1]);
        jobManagement.setProgressPercentage(percent);
        cardGeneration.setProgressPercentage(percent);
        draftGeneration.setProgressPercentage(percent);
        console.log(`📊 Progress update: ${percent}% - ${progress}`);
      } else if (progress.toLowerCase().includes('complete')) {
        // If progress indicates completion but no percentage, set to 100%
        jobManagement.setProgressPercentage(100);
        cardGeneration.setProgressPercentage(100);
        draftGeneration.setProgressPercentage(100);
        console.log(`📊 Progress update: 100% - ${progress}`);
      }
    }
    
    if (status === 'completed' && cardData) {
      console.log('🎉 Job completed! Card data:', cardData, 'isDraftJob:', isDraftJob);
      
      if (isDraftJob && draftIndex >= 0) {
        // Handle draft card completion
        console.log(`🎨 Draft variation ${draftIndex + 1} completed!`);
        
        // Get style info for smart style mode
        let styleInfo: { styleName: string; styleLabel: string } | undefined = undefined;
        if (selectedArtisticStyle === "ai-smart-style") {
          const predefinedStyles = [
            "watercolor", "botanical", "comic-book", "dreamy-fantasy", "minimalist"
          ];
          const styleLabels = [
            "🎨 Watercolor", "🌿 Botanical", "💥 Comic Book", "🌸 Dreamy Fantasy", "✨ Minimalist"
          ];
          if (draftIndex >= 0 && draftIndex < predefinedStyles.length) {
            styleInfo = {
              styleName: predefinedStyles[draftIndex],
              styleLabel: styleLabels[draftIndex]
            };
          }
        }

        const draftCard: GeneratedCard = {
          id: `draft-${draftIndex + 1}-${Date.now()}`,
          prompt: cardData.prompt || `Draft Variation ${draftIndex + 1}`,
          frontCover: cardData.frontCover || "",
          backCover: "",
          leftPage: "",
          rightPage: "",
          createdAt: new Date(),
          generatedPrompts: {
            frontCover: cardData.generatedPrompts?.frontCover || ""
          },
          styleInfo: styleInfo
        };
        
        // Update draft cards state
        draftGeneration.setDraftCards(prev => {
          const updated = [...prev];
          updated.push(draftCard);
          return updated;
        });
        
        draftGeneration.setDraftIndexMapping(prev => {
          const updatedMapping = [...prev];
          updatedMapping.push(draftIndex);
          return updatedMapping;
        });
        
        // Update completion count
        draftGeneration.setDraftCompletionCount(prevCount => {
          const newCompletedCount = prevCount + 1;
          console.log(`📊 Draft progress: ${newCompletedCount}/5 front cover variations complete`);
          
          if (newCompletedCount === 1) {
            scrollToCardPreview();
          }
          
          if (newCompletedCount === 5) {
            // Only reset generation state if we're not generating the final card
            if (!draftGeneration.isGeneratingFinalCard) {
              draftGeneration.setIsGenerating(false);
              cardGeneration.setIsGenerating(false);
              draftGeneration.setGenerationProgress("");
              cardGeneration.setGenerationProgress("");
              jobManagement.setProgressPercentage(100);
              jobManagement.stopElapsedTimeTracking();
            }
            
            draftGeneration.setDraftCompletionShown(prev => {
              if (!prev && !draftGeneration.isGeneratingFinalCard) {
                toast.success("🎨 All 5 front cover variations ready! Choose your favorite below.");
                return true;
              }
              return prev;
            });
          } else {
            const progressMsg = `✨ ${newCompletedCount}/5 front cover variations complete... ${newCompletedCount >= 2 ? "You can select one now to proceed!" : ""}`;
            draftGeneration.setGenerationProgress(progressMsg);
            cardGeneration.setGenerationProgress(progressMsg);
            jobManagement.setProgressPercentage((newCompletedCount / 5) * 100);
          }
          
          return newCompletedCount;
        });
        
        jobManagement.removeJobFromStorage(job_id);
      } else {
        // Handle final card completion
        cardGeneration.handleFinalCardCompletion(cardData);
        jobManagement.removeJobFromStorage(job_id);
        jobManagement.setCurrentJobId(null);
        webSocket.unsubscribeFromJob(job_id);
      }
    } else if (status === 'failed') {
      console.error('❌ Job failed:', error);
      
      if (isDraftJob && draftIndex >= 0) {
        toast.error(`Draft variation ${draftIndex + 1} failed. Continuing with others...`);
      } else {
        toast.error("❌ Card generation failed. Please try again.");
        cardGeneration.setIsGenerating(false);
        draftGeneration.setIsGeneratingFinalCard(false);
        jobManagement.stopElapsedTimeTracking();
        cardGeneration.setGenerationProgress("");
        jobManagement.setProgressPercentage(0);
        jobManagement.setCurrentJobId(null);
        webSocket.unsubscribeFromJob(job_id);
      }
      
      jobManagement.removeJobFromStorage(job_id);
    } else if (status === 'not_found') {
      console.warn('⚠️ Job not found on server, cleaning up stale reference:', job_id);
      
      // Clean up stale job reference
      if (webSocket.currentJobRef.current === job_id) {
        webSocket.currentJobRef.current = null;
      }
      
      // Reset UI state if this was the current job
      if (jobManagement.currentJobId === job_id) {
        jobManagement.setCurrentJobId(null);
        cardGeneration.setIsGenerating(false);
        draftGeneration.setIsGeneratingFinalCard(false);
        cardGeneration.setGenerationProgress("");
        jobManagement.setProgressPercentage(0);
        jobManagement.stopElapsedTimeTracking();
      }
      
      // Clean up storage
      jobManagement.removeJobFromStorage(job_id);
      webSocket.unsubscribeFromJob(job_id);
    }
  }, [selectedArtisticStyle, draftGeneration, cardGeneration, jobManagement, webSocket]);

  // Set up WebSocket job update handler
  useEffect(() => {
    webSocket.setJobUpdateHandler(handleJobUpdate);
  }, [webSocket, handleJobUpdate]);

  // Track if we've already logged the stale job message
  const staleJobLoggedRef = useRef(false);

  // Auto-reconnect WebSocket if disconnected during active generation
  useEffect(() => {
    if (!webSocket.isSocketConnected && 
        (cardGeneration.isGenerating || draftGeneration.isGeneratingFinalCard) && 
        webSocket.currentJobRef.current) {
      
      // Check if the generation has been running for more than 5 minutes
      if (jobManagement.generationStartTime) {
        const jobAge = Date.now() - jobManagement.generationStartTime;
        if (jobAge > 5 * 60 * 1000) { // 5 minutes
          if (!staleJobLoggedRef.current) {
            console.log('⏰ Job is older than 5 minutes, stopping reconnection attempts');
            staleJobLoggedRef.current = true;
            
            // Clean up stale job
            const jobId = webSocket.currentJobRef.current;
            if (jobId) {
              console.log('🧹 Cleaning up stale job:', jobId);
              
              // Remove from localStorage (only if not a draft job)
              if (!jobId.startsWith('draft-')) {
                jobManagement.removeJobFromStorage(jobId);
              }
              
              // Reset generation states
              cardGeneration.setIsGenerating(false);
              draftGeneration.setIsGeneratingFinalCard(false);
              draftGeneration.setIsDraftMode(false);
              draftGeneration.setDraftCards([]);
              draftGeneration.setDraftCompletionCount(0);
              draftGeneration.setDraftCompletionShown(false);
              jobManagement.setCurrentJobId(null);
              jobManagement.setGenerationProgress('');
              jobManagement.setProgressPercentage(0);
              jobManagement.stopElapsedTimeTracking();
              
              // Unsubscribe from job
              webSocket.unsubscribeFromJob(jobId);
              
              // Show error toast
              toast.error('Card generation timed out. Please try again.');
            }
          }
          return;
        }
      }
      
      console.log('🔄 WebSocket disconnected during generation, attempting reconnect...');
      const reconnectTimer = setTimeout(() => {
        webSocket.connectWebSocket();
        
        // Re-subscribe to current job after reconnection
        const jobId = webSocket.currentJobRef.current;
        if (jobId) {
          setTimeout(() => {
            console.log('📡 Re-subscribing to job after reconnect:', jobId);
            webSocket.subscribeToJob(jobId);
          }, 1000);
        }
      }, 2000);
      
      return () => clearTimeout(reconnectTimer);
    }
  }, [webSocket, cardGeneration.isGenerating, draftGeneration.isGeneratingFinalCard, jobManagement.generationStartTime]);

  // Reset stale job flag when generation starts
  useEffect(() => {
    if (cardGeneration.isGenerating || draftGeneration.isGeneratingFinalCard) {
      staleJobLoggedRef.current = false;
    }
  }, [cardGeneration.isGenerating, draftGeneration.isGeneratingFinalCard]);

  // Monitor for stale job updates
  useEffect(() => {
    if ((cardGeneration.isGenerating || draftGeneration.isGeneratingFinalCard) && 
        webSocket.currentJobRef.current) {
      const checkInterval = setInterval(async () => {
        const timeSinceLastUpdate = Date.now() - webSocket.lastJobUpdateRef.current;
        const jobId = webSocket.currentJobRef.current;
        
        // Very aggressive checking when at 95%+ progress
        if (jobManagement.progressPercentage >= 95 && timeSinceLastUpdate > 5000) {
          console.warn(`⚠️ No updates for ${Math.round(timeSinceLastUpdate/1000)}s at ${jobManagement.progressPercentage}% progress - checking job status...`);
          
          if (jobId) {
            try {
              const response = await fetch(`/api/job-status/${jobId}`);
              if (response.ok) {
                const jobStatus = await response.json();
                console.log('📊 Direct job status check:', jobStatus);
                
                if (jobStatus.status === 'completed' && jobStatus.cardData) {
                  console.log('✅ Job is actually completed! Processing result...');
                  handleJobUpdate({
                    job_id: jobId,
                    status: 'completed',
                    progress: 'Card generation complete!',
                    cardData: jobStatus.cardData
                  });
                  return; // Exit early on completion
                }
              }
            } catch (error) {
              console.error('Failed to check job status:', error);
            }
          }
        }
        // More aggressive checking when at high progress
        else if (jobManagement.progressPercentage >= 90 && timeSinceLastUpdate > 10000) {
          console.warn(`⚠️ No updates for ${Math.round(timeSinceLastUpdate/1000)}s at ${jobManagement.progressPercentage}% progress`);
          
          if (jobId) {
            try {
              const response = await fetch(`/api/job-status/${jobId}`);
              if (response.ok) {
                const jobStatus = await response.json();
                console.log('📊 Direct job status check:', jobStatus);
                
                if (jobStatus.status === 'completed' && jobStatus.cardData) {
                  console.log('✅ Job is actually completed! Processing result...');
                  handleJobUpdate({
                    job_id: jobId,
                    status: 'completed',
                    progress: 'Card generation complete!',
                    cardData: jobStatus.cardData
                  });
                  return; // Exit early on completion
                }
              }
            } catch (error) {
              console.error('Failed to check job status:', error);
            }
          }
        }
        
        // Standard stale update check
        if (timeSinceLastUpdate > 30000) { // 30 seconds without update
          console.warn('⚠️ No job updates for 30 seconds, checking connection...');
          
          if (!webSocket.isSocketConnected) {
            console.log('🔄 WebSocket disconnected, reconnecting...');
            webSocket.connectWebSocket();
          } else if (jobId) {
            console.log('📡 Re-subscribing to job due to stale updates:', jobId);
            webSocket.subscribeToJob(jobId);
          }
          
          // Reset the timer
          webSocket.lastJobUpdateRef.current = Date.now();
        }
      }, 3000); // Check every 3 seconds for faster detection at high progress
      
      return () => clearInterval(checkInterval);
    }
  }, [cardGeneration.isGenerating, draftGeneration.isGeneratingFinalCard, 
      webSocket, jobManagement.progressPercentage, handleJobUpdate]);

  // Check pending jobs on mount
  const checkPendingJobs = useCallback(async () => {
    const pendingJobs = await jobManagement.checkPendingJobs();
    
    for (const { jobId, job } of pendingJobs) {
      // Restore the loading state and resubscribe
      cardGeneration.setIsGenerating(true);
      jobManagement.setCurrentJobId(jobId);
      cardGeneration.setGenerationProgress("Resuming card generation...");
      
      // Start elapsed time tracking from when job was originally created
      const jobStartTime = job.createdAt ? new Date(job.createdAt).getTime() : Date.now();
      jobManagement.startElapsedTimeTracking(jobStartTime);
      
      toast.info("🔄 Resuming card generation where you left off...");
      
      // Subscribe to WebSocket for resumed job
      webSocket.subscribeToJob(jobId);
    }
  }, [jobManagement, cardGeneration, webSocket]);

  // Check for pending jobs on component mount
  useEffect(() => {
    checkPendingJobs();
  }, []);

  // Return all the state and functions that the UI needs
  return {
    // Core state
    prompt,
    setPrompt,
    finalCardMessage: messageGeneration.finalCardMessage,
    setFinalCardMessage: messageGeneration.setFinalCardMessage,
    toField,
    setToField,
    fromField,
    setFromField,
    selectedType,
    setSelectedType,
    customCardType,
    setCustomCardType,
    selectedTone,
    setSelectedTone,
    isGenerating: cardGeneration.isGenerating || draftGeneration.isGenerating,
    setIsGenerating: cardGeneration.setIsGenerating,
    isGeneratingMessage: messageGeneration.isGeneratingMessage,
    setIsGeneratingMessage: messageGeneration.setIsGeneratingMessage,
    generatedCard: cardGeneration.generatedCard,
    setGeneratedCard: cardGeneration.setGeneratedCard,
    numberOfCards,
    setNumberOfCards,
    generatedCards: cardGeneration.generatedCards,
    setGeneratedCards: cardGeneration.setGeneratedCards,
    selectedCardIndex: cardGeneration.selectedCardIndex,
    setSelectedCardIndex: cardGeneration.setSelectedCardIndex,
    
    // Advanced options
    showAdvanced,
    setShowAdvanced,
    selectedArtisticStyle,
    setSelectedArtisticStyle,
    customStyleDescription,
    setCustomStyleDescription,
    selectedImageModel,
    setSelectedImageModel,
    selectedDraftModel,
    setSelectedDraftModel,
    
    // Draft mode
    isDraftMode: draftGeneration.isDraftMode,
    setIsDraftMode: draftGeneration.setIsDraftMode,
    draftCards: draftGeneration.draftCards,
    setDraftCards: draftGeneration.setDraftCards,
    draftIndexMapping: draftGeneration.draftIndexMapping,
    setDraftIndexMapping: draftGeneration.setDraftIndexMapping,
    selectedDraftIndex: draftGeneration.selectedDraftIndex,
    setSelectedDraftIndex: draftGeneration.setSelectedDraftIndex,
    isGeneratingFinalCard: draftGeneration.isGeneratingFinalCard,
    setIsGeneratingFinalCard: draftGeneration.setIsGeneratingFinalCard,
    previewingDraftIndex: draftGeneration.previewingDraftIndex,
    setPreviewingDraftIndex: draftGeneration.setPreviewingDraftIndex,
    draftCompletionShown: draftGeneration.draftCompletionShown,
    setDraftCompletionShown: draftGeneration.setDraftCompletionShown,
    draftCompletionCount: draftGeneration.draftCompletionCount,
    setDraftCompletionCount: draftGeneration.setDraftCompletionCount,
    
    // Progress tracking
    generationProgress: draftGeneration.isGenerating ? draftGeneration.generationProgress : cardGeneration.generationProgress,
    setGenerationProgress: cardGeneration.setGenerationProgress,
    progressPercentage: jobManagement.progressPercentage,
    setProgressPercentage: jobManagement.setProgressPercentage,
    isCardCompleted: cardGeneration.isCardCompleted,
    setIsCardCompleted: cardGeneration.setIsCardCompleted,
    
    // Upload and personalization
    referenceImages: fileHandling.referenceImages,
    setReferenceImages: fileHandling.setReferenceImages,
    referenceImageUrls: fileHandling.referenceImageUrls,
    setReferenceImageUrls: fileHandling.setReferenceImageUrls,
    imageTransformation: fileHandling.imageTransformation,
    setImageTransformation: fileHandling.setImageTransformation,
    isUploading: fileHandling.isUploading,
    setIsUploading: fileHandling.setIsUploading,
    
    // Email and settings
    userEmail,
    setUserEmail,
    isHandwrittenMessage,
    setIsHandwrittenMessage,
    isFrontBackOnly,
    setIsFrontBackOnly,
    selectedPaperSize,
    setSelectedPaperSize,
    
    // UI state
    isTextareaExpanded,
    setIsTextareaExpanded,
    isMessageExpanded,
    setIsMessageExpanded,
    showSettings,
    setShowSettings,
    showTemplateGallery,
    setShowTemplateGallery,
    showPrintConfirmation,
    setShowPrintConfirmation,
    
    // Generation time
    generationDuration: cardGeneration.generationDuration,
    setGenerationDuration: cardGeneration.setGenerationDuration,
    currentElapsedTime: jobManagement.currentElapsedTime,
    setCurrentElapsedTime: jobManagement.setCurrentElapsedTime,
    
    // Helper functions
    formatGenerationTime,
    formatCountdown,
    sendThankYouEmail,
    chatWithAI,
    scrollToCardPreview,
    
    // Time tracking functions
    startElapsedTimeTracking: jobManagement.startElapsedTimeTracking,
    stopElapsedTimeTracking: jobManagement.stopElapsedTimeTracking,
    
    // File handling functions
    handleFileUpload: fileHandling.handleFileUpload,
    handleRemoveReferenceImage: fileHandling.handleRemoveReferenceImage,
    
    // Photo analysis
    photoAnalyses: fileHandling.photoAnalyses,
    setPhotoAnalyses: fileHandling.setPhotoAnalyses,
    isAnalyzing: fileHandling.isAnalyzing,
    showAnalysisModal: fileHandling.showAnalysisModal,
    setShowAnalysisModal: fileHandling.setShowAnalysisModal,
    pendingAnalysisIndex: fileHandling.pendingAnalysisIndex,
    setPendingAnalysisIndex: fileHandling.setPendingAnalysisIndex,
    analyzePhoto: fileHandling.analyzePhoto,
    savePhotoAnalysis: fileHandling.savePhotoAnalysis,
    skipPhotoAnalysis: fileHandling.skipPhotoAnalysis,
    getCombinedPhotoAnalysis: fileHandling.getCombinedPhotoAnalysis,
    
    // Message functions
    handleGetMessageHelp: messageGeneration.handleGetMessageHelp,
    addMessageToHistory: messageGeneration.addMessageToHistory,
    undoMessage: messageGeneration.undoMessage,
    redoMessage: messageGeneration.redoMessage,
    
    // Job management
    saveJobToStorage: jobManagement.saveJobToStorage,
    removeJobFromStorage: jobManagement.removeJobFromStorage,
    checkPendingJobs,
    
    // Main generation functions
    handleGenerateCardAsync: cardGeneration.handleGenerateCardAsync,
    handleGenerateDraftCards: draftGeneration.handleGenerateDraftCards,
    handleGenerateFinalFromDraft: draftGeneration.handleGenerateFinalFromDraft,
    
    // Additional state for message refinement
    messageHistory: messageGeneration.messageHistory,
    setMessageHistory: messageGeneration.setMessageHistory,
    currentMessageIndex: messageGeneration.currentMessageIndex,
    setCurrentMessageIndex: messageGeneration.setCurrentMessageIndex,
    refinementPrompt: messageGeneration.refinementPrompt,
    setRefinementPrompt: messageGeneration.setRefinementPrompt,
    isRefiningMessage: messageGeneration.isRefiningMessage,
    setIsRefiningMessage: messageGeneration.setIsRefiningMessage,
    showRefinementBox: messageGeneration.showRefinementBox,
    setShowRefinementBox: messageGeneration.setShowRefinementBox,
    
    // Template state
    showTemplateCustomization,
    setShowTemplateCustomization,
    selectedTemplate,
    setSelectedTemplate,
    templateCustomizations,
    setTemplateCustomizations,
    templateSearchQuery,
    setTemplateSearchQuery,
    isSearchingTemplates,
    setIsSearchingTemplates,
    aiFilteredCards,
    setAiFilteredCards,
    searchMode,
    setSearchMode,
    textFilteredCards,
    setTextFilteredCards,
    showPrompts,
    setShowPrompts,
    
    // Print state
    printOption,
    setPrintOption,
    
    // Additional draft mode state
    handwritingSample: fileHandling.handwritingSample,
    setHandwritingSample: fileHandling.setHandwritingSample,
    handwritingSampleUrl: fileHandling.handwritingSampleUrl,
    setHandwritingSampleUrl: fileHandling.setHandwritingSampleUrl,
    
    // Job tracking
    currentJobId: jobManagement.currentJobId,
    setCurrentJobId: jobManagement.setCurrentJobId,
    countdown,
    setCountdown,
    countdownInterval,
    setCountdownInterval,
    
    // Section loading states
    sectionLoadingStates,
    setSectionLoadingStates,
    
    // Fast preview mode
    fastPreviewMode,
    setFastPreviewMode,
    
    // Additional tracking
    currentCardId: cardGeneration.currentCardId,
    setCurrentCardId: cardGeneration.setCurrentCardId,
    isInitialLoadComplete,
    setIsInitialLoadComplete,
    
    // Elapsed time tracking
    generationStartTime: jobManagement.generationStartTime,
    setGenerationStartTime: jobManagement.setGenerationStartTime,
    elapsedTimeInterval: jobManagement.elapsedTimeInterval,
    setElapsedTimeInterval: jobManagement.setElapsedTimeInterval,
    
    // Constants for UI
    cardTones,
    artisticStyles,
    paperSizes,
    
    // WebSocket functions and state
    isSocketConnected: webSocket.isSocketConnected,
    connectWebSocket: webSocket.connectWebSocket,
    disconnectWebSocket: webSocket.disconnectWebSocket,
    subscribeToJob: webSocket.subscribeToJob,
    unsubscribeFromJob: webSocket.unsubscribeFromJob,
    handleJobUpdate,
    handleFinalCardCompletion: cardGeneration.handleFinalCardCompletion,
  };
}