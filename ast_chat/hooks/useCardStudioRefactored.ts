"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';

// Import modular hooks
import { useWebSocket } from './cardStudio/useWebSocket';
import { useJobManagement } from './cardStudio/useJobManagementSimplified';
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
import { storage } from '@/lib/storageManager';

export function useCardStudio() {
  // Core form state
  const [prompt, setPrompt] = useState("");
  const [toField, setToField] = useState("");
  const [fromField, setFromField] = useState("");
  const [relationshipField, setRelationshipField] = useState("");
  const [personalTraits, setPersonalTraits] = useState("");
  const [selectedType, setSelectedType] = useState<string>("birthday");
  const [customCardType, setCustomCardType] = useState<string>("");
  const [selectedTone, setSelectedTone] = useState<string>("funny");
  
  // Advanced options state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedArtisticStyle, setSelectedArtisticStyle] = useState<string>("ai-smart-style");
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
  
  // Restoration state
  const [isRestoringJobs, setIsRestoringJobs] = useState(true);
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
    relationshipField,
    fileHandling.photoReferences
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
    personalTraits,
    toField,
    fromField,
    userEmail,
    finalCardMessage: messageGeneration.finalCardMessage,
    isHandwrittenMessage,
    isFrontBackOnly,
    referenceImageUrls: fileHandling.referenceImageUrls,
    photoReferences: fileHandling.photoReferences,
    relationshipField,
    saveJobToStorage: jobManagement.saveJobToStorage,
    subscribeToJob: webSocket.subscribeToJob,
    unsubscribeFromAllJobs: webSocket.unsubscribeFromAllJobs,
    startElapsedTimeTracking: jobManagement.startElapsedTimeTracking,
    stopElapsedTimeTracking: jobManagement.stopElapsedTimeTracking,
    setProgressPercentage: jobManagement.setProgressPercentage,
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
    personalTraits,
    toField,
    fromField,
    userEmail,
    finalCardMessage: messageGeneration.finalCardMessage,
    isHandwrittenMessage,
    isFrontBackOnly,
    referenceImageUrls: fileHandling.referenceImageUrls,
    photoReferences: fileHandling.photoReferences,
    relationshipField,
    numberOfCards,
    saveJobToStorage: jobManagement.saveJobToStorage,
    removeJobFromStorage: jobManagement.removeJobFromStorage,
    subscribeToJob: webSocket.subscribeToJob,
    startElapsedTimeTracking: jobManagement.startElapsedTimeTracking,
    stopElapsedTimeTracking: jobManagement.stopElapsedTimeTracking,
    setCurrentJobId: jobManagement.setCurrentJobId,
    setIsDraftMode: draftGeneration.setIsDraftMode,
    setDraftCards: draftGeneration.setDraftCards,
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
    
    // Skip updates if we're still restoring jobs from localStorage
    if (isRestoringJobs) {
      console.log('⏳ Skipping job update during restoration:', job_id);
      return;
    }
    
    // Check if this is a draft job
    const isDraftJob = job_id.startsWith('draft-');
    const draftIndex = isDraftJob ? parseInt(job_id.split('-')[1]) : -1;
    
    // Filter out updates from wrong job type
    // If we're in draft mode, only process draft jobs
    // If we're in final mode, only process non-draft jobs
    const isInDraftMode = draftGeneration.isDraftMode;
    if (isInDraftMode && !isDraftJob) {
      console.log('🚫 Ignoring non-draft job update in draft mode:', job_id);
      return;
    }
    if (!isInDraftMode && isDraftJob) {
      console.log('🚫 Ignoring draft job update in final mode:', job_id);
      return;
    }
    
    console.log('🔄 Processing job update:', { job_id, status, isDraftJob, draftIndex, progress });
    
    // Handle status transitions
    if (status === 'processing' && !cardGeneration.isGenerating && !draftGeneration.isGenerating) {
      console.log('🔄 Job is processing, setting generation state');
      if (isDraftJob) {
        draftGeneration.setIsGenerating(true);
        draftGeneration.setIsDraftMode(true);
        jobManagement.startElapsedTimeTracking('draft');
      } else {
        cardGeneration.setIsGenerating(true);
        jobManagement.startElapsedTimeTracking('final');
      }
    }
    
    // Update progress if provided
    if (progress) {
      // IMPORTANT: Don't show "Generation complete!" until we've actually processed the card
      // This prevents the UI from showing completion before the card is ready
      if (progress.includes('Generation complete!') && status === 'completed' && !isDraftJob) {
        console.log('⏸️ Holding "Generation complete!" message until card is processed');
        // Don't update the progress message yet - it will be set in handleFinalCardCompletion
      } else {
        cardGeneration.setGenerationProgress(progress);
        draftGeneration.setGenerationProgress(progress);
        console.log(`📊 Progress message: ${progress}`);
      }
    }
    
    if (status === 'completed' && cardData) {
      console.log('🎉 Job completed! Card data:', cardData, 'isDraftJob:', isDraftJob);
      
      // Normalize field names to handle backend inconsistencies
      const normalizedCardData = {
        ...cardData,
        leftInterior: cardData.leftInterior || cardData.leftPage || cardData.left_interior || cardData.left_page,
        rightInterior: cardData.rightInterior || cardData.rightPage || cardData.right_interior || cardData.right_page,
        frontCover: cardData.frontCover || cardData.front_cover || cardData.front,
        backCover: cardData.backCover || cardData.back_cover || cardData.back,
        // Keep original fields for backward compatibility
        leftPage: cardData.leftPage || cardData.leftInterior || cardData.left_page || cardData.left_interior,
        rightPage: cardData.rightPage || cardData.rightInterior || cardData.right_page || cardData.right_interior
      };
      
      // Validate that we have the minimum required fields for a complete card
      const hasRequiredFields = normalizedCardData.frontCover && 
        (isDraftJob || (
          isFrontBackOnly 
            ? normalizedCardData.backCover 
            : (normalizedCardData.backCover && normalizedCardData.leftInterior && normalizedCardData.rightInterior)
        ));
      
      if (!hasRequiredFields) {
        console.warn('⚠️ Card data missing required fields:', {
          frontCover: !!normalizedCardData.frontCover,
          backCover: !!normalizedCardData.backCover,
          leftInterior: !!normalizedCardData.leftInterior,
          rightInterior: !!normalizedCardData.rightInterior
        });
      }
      
      // If this is the first update for a recovery job, ensure generation state is set properly
      if (isDraftJob && !draftGeneration.isGenerating && draftGeneration.draftCards.filter(Boolean).length === 0) {
        console.log('📥 Recovered completed draft job - not setting as generating');
        // Don't set isGenerating for already completed jobs during recovery
      }
      
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
          prompt: normalizedCardData.prompt || `Draft Variation ${draftIndex + 1}`,
          frontCover: normalizedCardData.frontCover || "",
          backCover: normalizedCardData.backCover || "",
          leftPage: normalizedCardData.leftInterior || "",
          rightPage: normalizedCardData.rightInterior || "",
          createdAt: new Date(),
          generatedPrompts: normalizedCardData.generatedPrompts || {
            frontCover: cardData.generatedPrompts?.frontCover || "",
            backCover: cardData.generatedPrompts?.backCover || "",
            leftInterior: cardData.generatedPrompts?.leftInterior || "",
            rightInterior: cardData.generatedPrompts?.rightInterior || ""
          },
          styleInfo: styleInfo
        };
        
        // Simplified draft tracking - use fixed array positions
        draftGeneration.setDraftCards(prev => {
          const updated = [...prev];
          // Ensure array has 5 slots
          while (updated.length < 5) {
            updated.push(null as any);
          }
          // Place draft at its correct index
          updated[draftIndex] = draftCard;
          console.log(`✅ Draft ${draftIndex + 1} completed and stored at index ${draftIndex}`);
          
          // No longer save individual drafts to localStorage
          
          return updated;
        });
        
        // Simplified completion tracking - count the updated array including the new draft
        const updatedDrafts = [...draftGeneration.draftCards];
        updatedDrafts[draftIndex] = draftCard;
        const completedCount = updatedDrafts.filter(Boolean).length;
        console.log(`📊 Draft progress: ${completedCount}/5 variations complete`);
        
        // Update progress
        const progressMsg = completedCount === 5 
          ? "All 5 variations ready! Choose your favorite below."
          : `${completedCount}/5 variations complete...${completedCount >= 2 ? " You can select one now!" : ""}`;
        
        draftGeneration.setGenerationProgress(progressMsg);
        
        // Override time-based progress with real progress when drafts complete
        // Don't override time-based progress
        console.log(`🎨 Draft ${completedCount}/5 completed`);
        
        // Handle milestones
        if (completedCount === 1) {
          scrollToCardPreview();
        }
        
        if (completedCount === 5 && !draftGeneration.isGeneratingFinalCard) {
          draftGeneration.setIsGenerating(false);
          jobManagement.stopElapsedTimeTracking();
          // Clear recovery data for completed draft jobs
          storage.clearRecovery();
          console.log('🧹 Cleared recovery data for completed draft job');
          toast.success("🎨 All 5 front cover variations ready! Choose your favorite below.");
        }
        
        // Keep draft jobs in storage for later retrieval
        // Only unsubscribe from WebSocket
        webSocket.unsubscribeFromJob(job_id);
        console.log(`✅ Keeping draft job ${job_id} in storage for future access`);
      } else {
        // Handle final card completion
        console.log('🔍 Final card completion detected. Card data structure:', {
          hasCardData: !!cardData,
          cardDataKeys: Object.keys(cardData || {}),
          frontCover: cardData?.frontCover ? 'Present' : 'Missing',
          backCover: cardData?.backCover ? 'Present' : 'Missing',
          leftInterior: cardData?.leftInterior ? 'Present' : 'Missing',
          rightInterior: cardData?.rightInterior ? 'Present' : 'Missing',
          leftPage: cardData?.leftPage ? 'Present' : 'Missing',
          rightPage: cardData?.rightPage ? 'Present' : 'Missing',
        });
        console.log('📝 Full card data:', JSON.stringify(normalizedCardData, null, 2));
        
        // Use the already normalized card data
        const mappedCardData = normalizedCardData;
        
        console.log('🔄 Normalized card data for frontend:', {
          frontCover: mappedCardData.frontCover ? 'Present' : 'Missing',
          backCover: mappedCardData.backCover ? 'Present' : 'Missing',
          leftInterior: mappedCardData.leftInterior ? 'Present' : 'Missing',
          rightInterior: mappedCardData.rightInterior ? 'Present' : 'Missing',
          hasAllRequiredFields: hasRequiredFields
        });
        
        // Only process completion if we have all required fields
        if (hasRequiredFields) {
          // Call the completion handler
          console.log('🚀 Calling handleFinalCardCompletion...');
          cardGeneration.handleFinalCardCompletion(mappedCardData);
        } else {
          console.error('❌ Cannot complete card - missing required fields');
          toast.error("Card generation incomplete - missing some panels. Please try again.");
          // Force clear the loading state
          cardGeneration.setIsGenerating(false);
          draftGeneration.setIsGeneratingFinalCard(false);
          jobManagement.stopElapsedTimeTracking();
          jobManagement.setGenerationProgress("");
        }
        
        // Card is automatically added to recent cards by markJobComplete
        
        // Only clear recovery if we're not in the middle of restoring
        if (!isRestoringJobs) {
          jobManagement.removeJobFromStorage(job_id);
        }
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
        // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
        jobManagement.setCurrentJobId(null);
        webSocket.unsubscribeFromJob(job_id);
      }
      
      // Only clear recovery if we're not in the middle of restoring
      if (!isRestoringJobs) {
        jobManagement.removeJobFromStorage(job_id);
      }
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
        // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
        jobManagement.stopElapsedTimeTracking();
      }
      
      // Clean up storage
      // Only clear recovery if we're not in the middle of restoring
      if (!isRestoringJobs) {
        jobManagement.removeJobFromStorage(job_id);
      }
      webSocket.unsubscribeFromJob(job_id);
    }
  }, [selectedArtisticStyle, draftGeneration, cardGeneration, jobManagement, webSocket, isRestoringJobs]);

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
              // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
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

  // Simplified job restoration using new storage manager
  const checkPendingJobs = useCallback(async () => {
    console.log('🔄 Checking for recovery data...');
    setIsRestoringJobs(true);
    
    // Check for active recovery job
    const recovery = storage.getRecovery();
    
    if (!recovery) {
      console.log('✅ No active job to recover');
      setIsRestoringJobs(false);
      return;
    }
    
    console.log('🔄 Found recovery data:', recovery);
    
    // In our simplified system, we only track one active job at a time
    // Recovery is meant for browser crashes during generation
    const isRecoveryDraft = recovery.jobId?.startsWith('draft-');
    
    if (isRecoveryDraft) {
      console.log('🎨 Recovering from draft generation');
      // For draft recovery, we can't restore the exact state
      // User will need to restart the draft generation
      setIsRestoringJobs(false);
      return;
    }
    
    // For final card recovery, we can try to restore the job
    console.log('🎯 Recovering from final card generation');
    
    // Restore generation state
    jobManagement.setCurrentJobId(recovery.jobId);
    cardGeneration.setIsGenerating(true);
    cardGeneration.setGenerationProgress("🔄 Resuming generation...");
    jobManagement.startElapsedTimeTracking('final');
    
    // Subscribe to the job to get updates
    webSocket.subscribeToJob(recovery.jobId);
    setIsRestoringJobs(false);
  }, [webSocket, storage]);

  // Load recovery data on component mount
  useEffect(() => {
    console.log('🚀 useCardStudio mounted, checking for recovery...');
    
    // Check for active recovery job
    const recovery = storage.getRecovery();
    console.log('📦 Recovery data:', recovery);
    
    if (recovery) {
      console.log('🔄 Found active job to recover:', recovery.jobId);
      
      // For draft jobs, check if we already have completed drafts
      const isDraft = recovery.jobId.startsWith('draft-');
      
      if (isDraft) {
        // Check if we already have completed draft cards
        const hasCompletedDrafts = draftGeneration.draftCards.filter(card => card !== null).length > 0;
        
        if (hasCompletedDrafts) {
          console.log('✅ Draft job already completed, not setting as generating');
          // Just restore the job ID for reference, but don't set as generating
          jobManagement.setCurrentJobId(recovery.jobId);
          draftGeneration.setIsDraftMode(true);
        } else {
          console.log('🎨 Resuming incomplete draft generation');
          // Subscribe to the job to check its status
          jobManagement.setCurrentJobId(recovery.jobId);
          webSocket.subscribeToJob(recovery.jobId);
          draftGeneration.setIsDraftMode(true);
          // Don't set as generating yet - wait for WebSocket to tell us the actual status
          // This prevents navigation to Step 5 for already completed jobs
          console.log('⏳ Waiting for job status update before setting generation state...');
        }
      } else {
        // For final card recovery, check if already completed
        if (cardGeneration.generatedCard && cardGeneration.isCardCompleted) {
          console.log('✅ Final card already completed, not setting as generating');
          jobManagement.setCurrentJobId(recovery.jobId);
        } else {
          console.log('🎯 Resuming incomplete final card generation');
          jobManagement.setCurrentJobId(recovery.jobId);
          webSocket.subscribeToJob(recovery.jobId);
          cardGeneration.setIsGenerating(true);
          cardGeneration.setGenerationProgress('🎨 Resuming card generation...');
          jobManagement.startElapsedTimeTracking('final');
          
          // If this is a final card generation from a draft, set the appropriate state
          if (recovery.formData && recovery.formData.selectedDraftIndex !== undefined) {
            draftGeneration.setIsGeneratingFinalCard(true);
            draftGeneration.setSelectedDraftIndex(recovery.formData.selectedDraftIndex);
          }
        }
      }
    }
    
    // Always mark restoration as complete
    setIsRestoringJobs(false);
    
    // Mark restoration as complete after a small delay
    setTimeout(() => {
      setIsRestoringJobs(false);
    }, 100);
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
    relationshipField,
    setRelationshipField,
    personalTraits,
    setPersonalTraits,
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
    
    // Simplified photo references
    photoReferences: fileHandling.photoReferences,
    setPhotoReferences: fileHandling.setPhotoReferences,
    updatePhotoDescription: fileHandling.updatePhotoDescription,
    
    // Message functions
    handleGetMessageHelp: messageGeneration.handleGetMessageHelp,
    addMessageToHistory: messageGeneration.addMessageToHistory,
    undoMessage: messageGeneration.undoMessage,
    redoMessage: messageGeneration.redoMessage,
    
    // Job management
    saveJobToStorage: jobManagement.saveJobToStorage,
    removeJobFromStorage: jobManagement.removeJobFromStorage,
    checkPendingJobs,
    isRestoringJobs,
    
    // Main generation functions
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
    unsubscribeFromAllJobs: webSocket.unsubscribeFromAllJobs,
    handleJobUpdate,
    handleFinalCardCompletion: cardGeneration.handleFinalCardCompletion,
  };
}
