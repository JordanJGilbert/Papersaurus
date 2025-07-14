// Utility to manage and recover from stuck loading states

interface LoadingStateConfig {
  isGenerating: boolean;
  isGeneratingFinalCard: boolean;
  isDraftMode: boolean;
  progressPercentage: number;
  lastUpdateTime: number;
  jobId: string | null;
  generationStartTime: number | null;
}

interface RecoveryActions {
  setIsGenerating: (value: boolean) => void;
  setIsGeneratingFinalCard: (value: boolean) => void;
  setIsDraftMode: (value: boolean) => void;
  setProgressPercentage: (value: number) => void;
  setGenerationProgress: (value: string) => void;
  stopElapsedTimeTracking: () => void;
  setCurrentJobId: (value: string | null) => void;
  unsubscribeFromJob: (jobId: string) => void;
  removeJobFromStorage: (jobId: string) => void;
}

const MAX_GENERATION_TIME = 180000; // 3 minutes
const STALE_UPDATE_THRESHOLD = 30000; // 30 seconds
const HIGH_PROGRESS_THRESHOLD = 90;
const CRITICAL_PROGRESS_THRESHOLD = 95;

export class LoadingStateManager {
  private checkInterval: NodeJS.Timeout | null = null;
  
  constructor(
    private getState: () => LoadingStateConfig,
    private actions: RecoveryActions,
    private onStaleDetected?: (timeSinceUpdate: number) => void
  ) {}
  
  startMonitoring() {
    this.stopMonitoring(); // Clear any existing interval
    
    this.checkInterval = setInterval(() => {
      const state = this.getState();
      
      if (!state.isGenerating && !state.isGeneratingFinalCard) {
        return; // Nothing to monitor
      }
      
      const now = Date.now();
      const timeSinceLastUpdate = now - state.lastUpdateTime;
      const timeSinceStart = state.generationStartTime ? now - state.generationStartTime : 0;
      
      // Check for absolute timeout
      if (timeSinceStart > MAX_GENERATION_TIME) {
        console.error('❌ Generation timeout - exceeded 3 minutes');
        this.forceResetAllStates('Generation timed out. Please try again.');
        return;
      }
      
      // Check for stale updates at high progress
      if (state.progressPercentage >= CRITICAL_PROGRESS_THRESHOLD && timeSinceLastUpdate > 5000) {
        console.warn(`⚠️ Critical: No updates for ${Math.round(timeSinceLastUpdate/1000)}s at ${state.progressPercentage}% progress`);
        this.onStaleDetected?.(timeSinceLastUpdate);
      } else if (state.progressPercentage >= HIGH_PROGRESS_THRESHOLD && timeSinceLastUpdate > 10000) {
        console.warn(`⚠️ Warning: No updates for ${Math.round(timeSinceLastUpdate/1000)}s at ${state.progressPercentage}% progress`);
        this.onStaleDetected?.(timeSinceLastUpdate);
      } else if (timeSinceLastUpdate > STALE_UPDATE_THRESHOLD) {
        console.warn(`⚠️ No updates for ${Math.round(timeSinceLastUpdate/1000)}s`);
      }
    }, 1000); // Check every second
  }
  
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  forceResetAllStates(errorMessage: string) {
    const state = this.getState();
    
    // Reset all generation states
    this.actions.setIsGenerating(false);
    this.actions.setIsGeneratingFinalCard(false);
    this.actions.setIsDraftMode(false);
    this.actions.setProgressPercentage(0);
    this.actions.setGenerationProgress(errorMessage);
    this.actions.stopElapsedTimeTracking();
    this.actions.setCurrentJobId(null);
    
    // Clean up job if exists
    if (state.jobId) {
      this.actions.unsubscribeFromJob(state.jobId);
      this.actions.removeJobFromStorage(state.jobId);
    }
    
    // Stop monitoring after reset
    this.stopMonitoring();
  }
  
  // Helper to detect inconsistent states
  detectInconsistentStates(): string[] {
    const state = this.getState();
    const issues: string[] = [];
    
    // Check for progress at 100% but still generating
    if (state.progressPercentage >= 100 && (state.isGenerating || state.isGeneratingFinalCard)) {
      issues.push('Progress at 100% but still showing as generating');
    }
    
    // Check for stuck at high progress
    if (state.progressPercentage >= 95 && state.generationStartTime) {
      const elapsed = Date.now() - state.generationStartTime;
      if (elapsed > 60000) { // More than 1 minute at 95%+
        issues.push(`Stuck at ${state.progressPercentage}% for over ${Math.round(elapsed/1000)}s`);
      }
    }
    
    // Check for no job ID but generating
    if ((state.isGenerating || state.isGeneratingFinalCard) && !state.jobId) {
      issues.push('Generating state active but no job ID');
    }
    
    return issues;
  }
}

// Export helper to normalize card data fields
export function normalizeCardData(cardData: any) {
  return {
    ...cardData,
    // Normalize all possible field name variations
    frontCover: cardData.frontCover || cardData.front_cover || cardData.front || '',
    backCover: cardData.backCover || cardData.back_cover || cardData.back || '',
    leftInterior: cardData.leftInterior || cardData.leftPage || cardData.left_interior || cardData.left_page || '',
    rightInterior: cardData.rightInterior || cardData.rightPage || cardData.right_interior || cardData.right_page || '',
    // Keep original fields for backward compatibility
    leftPage: cardData.leftPage || cardData.leftInterior || cardData.left_page || cardData.left_interior || '',
    rightPage: cardData.rightPage || cardData.rightInterior || cardData.right_page || cardData.right_interior || ''
  };
}

// Export helper to validate card has required fields
export function validateCardFields(cardData: any, isDraft: boolean = false): {
  isValid: boolean;
  missingFields: string[];
} {
  const normalized = normalizeCardData(cardData);
  const missingFields: string[] = [];
  
  // Draft cards only need front cover
  if (!normalized.frontCover) {
    missingFields.push('frontCover');
  }
  
  // Final cards need all panels
  if (!isDraft) {
    if (!normalized.backCover) missingFields.push('backCover');
    if (!normalized.leftInterior) missingFields.push('leftInterior');
    if (!normalized.rightInterior) missingFields.push('rightInterior');
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}