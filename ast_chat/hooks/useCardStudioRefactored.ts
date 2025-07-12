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
  const [relationshipField, setRelationshipField] = useState("");
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
    unsubscribeFromAllJobs: webSocket.unsubscribeFromAllJobs,
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
          
          // Save draft to localStorage with expiration
          if (typeof window !== 'undefined') {
            try {
              const jobData = localStorage.getItem(`cardJob_${job_id}`);
              if (jobData) {
                const job = JSON.parse(jobData);
                job.draftCards = [draftCard];
                job.draftIndex = draftIndex;
                job.lastUpdate = Date.now();
                job.expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
                localStorage.setItem(`cardJob_${job_id}`, JSON.stringify(job));
              }
            } catch (error) {
              console.error('Failed to save draft:', error);
            }
          }
          
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
        console.log('📝 Full card data:', JSON.stringify(cardData, null, 2));
        
        // Map backend field names to frontend field names
        const mappedCardData = {
          ...cardData,
          leftInterior: cardData.leftInterior || cardData.leftPage,
          rightInterior: cardData.rightInterior || cardData.rightPage,
          // Keep original fields for backward compatibility
          leftPage: cardData.leftPage || cardData.leftInterior,
          rightPage: cardData.rightPage || cardData.rightInterior,
        };
        
        console.log('🔄 Mapped card data for frontend compatibility:', {
          frontCover: mappedCardData.frontCover ? 'Present' : 'Missing',
          backCover: mappedCardData.backCover ? 'Present' : 'Missing',
          leftInterior: mappedCardData.leftInterior ? 'Present' : 'Missing',
          rightInterior: mappedCardData.rightInterior ? 'Present' : 'Missing',
        });
        
        // Call the completion handler
        console.log('🚀 Calling handleFinalCardCompletion...');
        cardGeneration.handleFinalCardCompletion(mappedCardData);
        
        // Save final card metadata to localStorage for recovery (without large images)
        try {
          const finalCardMetadata = {
            jobId: job_id,
            completedAt: Date.now(),
            isFinalCard: true,
            prompt: cardData.prompt,
            id: cardData.id,
            createdAt: cardData.createdAt,
            // Don't save base64 images to avoid quota issues
            hasImages: {
              frontCover: !!cardData.frontCover,
              backCover: !!cardData.backCover,
              leftPage: !!cardData.leftPage,
              rightPage: !!cardData.rightPage
            }
          };
          localStorage.setItem('lastCompletedCard', JSON.stringify(finalCardMetadata));
          console.log('💾 Saved final card metadata to localStorage (without images)');
        } catch (error) {
          console.error('Failed to save final card metadata:', error);
        }
        
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
        // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
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
        // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
        jobManagement.stopElapsedTimeTracking();
      }
      
      // Clean up storage
      jobManagement.removeJobFromStorage(job_id);
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

  // OLD: Complex job restoration - keeping for reference but not using
  const checkPendingJobs = useCallback(async () => {
    console.log('🔄 Starting job restoration...');
    setIsRestoringJobs(true);
    
    const pendingJobs = await jobManagement.checkPendingJobs();
    
    if (pendingJobs.length === 0) {
      console.log('✅ No pending jobs to restore');
      setIsRestoringJobs(false);
      return;
    }
    
    console.log('🔄 Found pending jobs to restore:', pendingJobs);
    
    // Separate draft jobs from final jobs
    const draftJobs = pendingJobs.filter(({ jobId }) => jobId.startsWith('draft-'));
    const finalJobs = pendingJobs.filter(({ jobId }) => !jobId.startsWith('draft-'));
    
    // Process draft jobs first to restore draft state
    if (draftJobs.length > 0) {
      console.log(`🎨 Found ${draftJobs.length} draft jobs to restore`);
      
      // Collect all draft cards from all draft jobs
      const draftsByIndex: (GeneratedCard | null)[] = new Array(5).fill(null);
      
      for (const { job } of draftJobs) {
        if (job.draftCards && Array.isArray(job.draftCards) && job.draftCards.length > 0) {
          const draftCard = job.draftCards[0]; // Each job stores one draft
          const draftIndex = job.draftIndex;
          
          if (draftIndex >= 0 && draftIndex < 5) {
            draftsByIndex[draftIndex] = draftCard;
          }
        }
      }
      
      // Get non-null drafts for counting
      const allDraftCards = draftsByIndex.filter(Boolean) as GeneratedCard[];
      
      // Restore all draft cards at once
      if (allDraftCards.length > 0) {
        console.log(`🔄 Restoring ${allDraftCards.length} draft cards from ${draftJobs.length} jobs`);
        // Only set draft mode when we have actual cards
        console.log('🎯 Setting isDraftMode to true - draft cards found');
        draftGeneration.setIsDraftMode(true);
        
        // Use the draftsByIndex which already has drafts at correct positions
        draftGeneration.setDraftCards(draftsByIndex);
        draftGeneration.setDraftCompletionCount(allDraftCards.length);
        
        // Set appropriate progress state
        if (allDraftCards.length === 5) {
          draftGeneration.setDraftCompletionShown(true);
          draftGeneration.setIsGenerating(false);
          cardGeneration.setIsGenerating(false);
          draftGeneration.setGenerationProgress("");
          cardGeneration.setGenerationProgress("");
          // Time-based progress will be cleared above
        } else {
          draftGeneration.setIsGenerating(true);
          cardGeneration.setIsGenerating(true);
          const progressMsg = `✨ ${allDraftCards.length}/5 front cover variations complete... ${allDraftCards.length >= 2 ? "You can select one now to proceed!" : ""}`;
          draftGeneration.setGenerationProgress(progressMsg);
          cardGeneration.setGenerationProgress(progressMsg);
          // Don't override time-based progress
        }
      }
      
      // If no draft cards were found but we have draft jobs, set appropriate state
      if (allDraftCards.length === 0 && draftJobs.length > 0) {
        console.log('🔄 Draft jobs found but no cards yet - setting generation state');
        // Set draft mode and initialize empty array for draft jobs in progress
        draftGeneration.setIsDraftMode(true);
        draftGeneration.setDraftCards([null, null, null, null, null]);
        draftGeneration.setIsGenerating(true);
        cardGeneration.setIsGenerating(true);
        draftGeneration.setGenerationProgress("🎨 Creating 5 front cover variations for you to choose from...");
        cardGeneration.setGenerationProgress("🎨 Creating 5 front cover variations for you to choose from...");
        // Don't reset progress - let time-based progress continue
        // jobManagement.setProgressPercentage(0);
      }
      
      // Subscribe to all non-stale draft jobs
      for (const { jobId, job } of draftJobs) {
        const jobAge = Date.now() - (job.createdAt || Date.now());
        const isStale = jobAge > 5 * 60 * 1000;
        
        if (!isStale) {
          console.log(`📡 Subscribing to draft job: ${jobId} (has ${job.draftCards?.length || 0} cards)`);
          webSocket.subscribeToJob(jobId);
        }
      }
    }
    
    // Process remaining jobs (final card generation)
    for (const { jobId, job } of finalJobs) {
      console.log(`📋 Processing job ${jobId}:`, {
        isDraft: jobId.startsWith('draft-'),
        status: job.status,
        hasProgress: !!job.lastProgress,
        createdAt: job.createdAt
      });
      // Check if job is stale (older than 5 minutes without completion)
      const jobAge = Date.now() - (job.createdAt || Date.now());
      const isStale = jobAge > 5 * 60 * 1000 && job.status !== 'completed';
      
      if (isStale) {
        console.log(`🧹 Cleaning up stale job: ${jobId} (age: ${Math.round(jobAge / 1000)}s)`);
        jobManagement.removeJobFromStorage(jobId);
        continue;
      }
      
      // Restore progress and state
      // Don't restore progress - let time-based progress handle it
      // if (job.lastProgress !== undefined) {
      //   jobManagement.setProgressPercentage(job.lastProgress);
      //   cardGeneration.setProgressPercentage(job.lastProgress);
      //   draftGeneration.setProgressPercentage(job.lastProgress);
      // }
      
      // Only restore progress text if the job is not completed
      // This prevents showing "Generation complete! (100%)" from old completed jobs
      if (job.lastProgressText && job.status !== 'completed') {
        jobManagement.setGenerationProgress(job.lastProgressText);
        cardGeneration.setGenerationProgress(job.lastProgressText);
        draftGeneration.setGenerationProgress(job.lastProgressText);
      }
      
      // Restore final card generation state
      cardGeneration.setIsGenerating(true);
      draftGeneration.setIsGeneratingFinalCard(true);
      
      // If we have a selected draft, restore it
      if (job.selectedDraftIndex !== undefined) {
        draftGeneration.setSelectedDraftIndex(job.selectedDraftIndex);
      }
      
      jobManagement.setCurrentJobId(jobId);
      
      // Calculate elapsed time since job started
      const jobStartTime = job.createdAt || Date.now();
      const elapsedSinceStart = (Date.now() - jobStartTime) / 1000;
      
      // Start elapsed time tracking
      jobManagement.startElapsedTimeTracking();
      
      // Subscribe to the job updates
      webSocket.subscribeToJob(jobId);
      
      // Verify job exists on backend
      try {
        const response = await fetch(`${BACKEND_API_BASE_URL}/api/job-status/${jobId}`);
        const result = await response.json();
        
        console.log(`📡 Job status check for ${jobId}:`, {
          ok: response.ok,
          status: response.status,
          resultStatus: result.status,
          url: `${BACKEND_API_BASE_URL}/api/job-status/${jobId}`
        });
        
        if (result.status === 'not_found') {
          // Job doesn't exist on backend, clean up and notify user
          console.log(`⚠️ Job ${jobId} not found on backend, cleaning up...`);
          jobManagement.removeJobFromStorage(jobId);
          
          // Reset generation state
          if (isDraftJob) {
            draftGeneration.setIsGenerating(false);
          } else {
            cardGeneration.setIsGenerating(false);
            draftGeneration.setIsGeneratingFinalCard(false);
          }
          
          // Show helpful message to user
          toast.error(
            `Previous ${isDraftJob ? 'draft' : 'card'} generation expired. Please start a new one.`,
            { duration: 5000 }
          );
          continue;
        } else {
          // Job exists, show resuming message
          toast.info(`Resuming ${isDraftJob ? 'draft' : 'card'} generation...`);
        }
      } catch (error) {
        console.error('Failed to verify job status:', error);
        // Continue anyway, WebSocket will handle it
        toast.info(`Attempting to resume ${isDraftJob ? 'draft' : 'card'} generation...`);
      }
    }
    
    // Restoration complete - allow WebSocket updates to be processed
    // Add a small delay to ensure state updates have propagated
    setTimeout(() => {
      console.log('✅ Job restoration complete, allowing WebSocket updates');
      setIsRestoringJobs(false);
    }, 100);
  }, [jobManagement, cardGeneration, draftGeneration, webSocket]);

  // Load most recent draft batch and final card on component mount
  useEffect(() => {
    console.log('🚀 useCardStudio mounted, loading recent cards...');
    
    // Check for completed final card first
    try {
      const savedFinalCard = localStorage.getItem('lastCompletedCard');
      if (savedFinalCard) {
        const finalCard = JSON.parse(savedFinalCard);
        console.log('💾 Found saved final card:', finalCard);
        
        // Restore final card state
        cardGeneration.setGeneratedCard(finalCard);
        cardGeneration.setGeneratedCards([finalCard]);
        cardGeneration.setIsCardCompleted(true);
        draftGeneration.setIsDraftMode(false);
        
        // Clear the saved card after restoring
        localStorage.removeItem('lastCompletedCard');
        console.log('✅ Restored final card from localStorage');
        return; // Don't load drafts if we have a final card
      }
    } catch (error) {
      console.error('Failed to restore final card:', error);
    }
    
    // If no final card, check for drafts
    // First, clear any existing draft state to avoid duplicates
    draftGeneration.setDraftCards([]);
    draftGeneration.setDraftCompletionCount(0);
    
    const recentDrafts = jobManagement.loadMostRecentDraftBatch();
    console.log('📊 Draft batch result:', recentDrafts);
    
    if (recentDrafts && recentDrafts.cards.length > 0) {
      console.log(`📋 Found recent draft batch with ${recentDrafts.count} cards from ${new Date(recentDrafts.createdAt).toLocaleString()}`);
      
      // Set the draft cards and enable draft mode
      draftGeneration.setDraftCards(recentDrafts.cards);
      draftGeneration.setIsDraftMode(true);
      draftGeneration.setDraftCompletionCount(recentDrafts.count);
      
      // If we have all 5 cards, mark as complete
      if (recentDrafts.count === 5) {
        draftGeneration.setDraftCompletionShown(true);
        draftGeneration.setIsGenerating(false);
        cardGeneration.setIsGenerating(false);
      } else {
        // Still generating - set generation state and start timer
        draftGeneration.setIsGenerating(true);
        cardGeneration.setIsGenerating(true);
        
        // Calculate how long generation has been running
        const elapsedSeconds = Math.floor((Date.now() - recentDrafts.createdAt) / 1000);
        jobManagement.setCurrentElapsedTime(elapsedSeconds);
        jobManagement.startElapsedTimeTracking();
        
        // Set progress
        const progressMsg = `✨ ${recentDrafts.count}/5 front cover variations complete...`;
        draftGeneration.setGenerationProgress(progressMsg);
        cardGeneration.setGenerationProgress(progressMsg);
        // Don't override time-based progress
        
        // Check for pending jobs to subscribe to
        const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
        const activeDraftJobs = pendingJobs.filter((id: string) => id.startsWith('draft-'));
        
        // Subscribe to active draft jobs for real-time updates
        activeDraftJobs.forEach((jobId: string) => {
          console.log(`📡 Subscribing to active draft job: ${jobId}`);
          webSocket.subscribeToJob(jobId);
        });
      }
    }
    
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
    progressPercentage: jobManagement.progressPercentage, // Single source of truth based on elapsed time
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
    
    // Photo analysis
    triggerPhotoAnalysis: fileHandling.triggerPhotoAnalysis,
    
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