"use client";

import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';
import { GeneratedCard } from './constants';
import { storage } from '@/lib/storageManager';

export function useJobManagement() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [currentElapsedTime, setCurrentElapsedTime] = useState<number>(0);
  const [elapsedTimeInterval, setElapsedTimeInterval] = useState<NodeJS.Timeout | null>(null);
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);
  const [currentJobType, setCurrentJobType] = useState<'draft' | 'final' | null>(null);

  // Save job for recovery during generation
  const saveJobToStorage = (jobId: string, jobData: any) => {
    storage.saveRecovery(jobId, jobData);
  };

  // No longer needed - progress tracked in state only
  const updateJobProgress = (jobId: string, progress: number, progressText: string) => {
    // Progress is only tracked in component state during generation
  };

  // Remove job from storage
  const removeJobFromStorage = (jobId: string) => {
    storage.clearRecovery();
  };

  // No longer needed - storage manager handles expiration
  const cleanupExpiredJobs = useCallback(() => {
    // Storage manager handles expiration automatically
  }, []);

  // Mark job complete and add to recent cards
  const markJobComplete = (jobId: string, completedCard?: GeneratedCard) => {
    // Clear recovery data
    storage.clearRecovery();
    
    // Add to recent cards if completed
    if (completedCard) {
      storage.addRecentCard({
        id: completedCard.id,
        date: new Date().toISOString(),
        type: completedCard.cardType || 'unknown',
        tone: completedCard.tone || 'unknown',
        recipient: completedCard.to,
        preview: completedCard.images?.front
      });
    }
  };

  // Start elapsed time tracking
  const startElapsedTimeTracking = useCallback((jobType: 'draft' | 'final' = 'final') => {
    const start = Date.now();
    setGenerationStartTime(start);
    setCurrentElapsedTime(0);
    setProgressPercentage(0);
    setCurrentJobType(jobType);
    
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    // Expected durations in seconds
    const expectedDuration = jobType === 'draft' ? 45 : 105;
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentElapsedTime(elapsed);
      
      // Calculate progress based on elapsed time
      let progress = 0;
      if (elapsed < expectedDuration) {
        progress = Math.min(95, (elapsed / expectedDuration) * 95);
      } else {
        const overtime = elapsed - expectedDuration;
        const overtimeRatio = overtime / expectedDuration;
        progress = 95 + Math.min(4, overtimeRatio * 4);
      }
      
      setProgressPercentage(Math.round(progress));
    }, 1000);
    
    setElapsedTimeInterval(interval);
  }, [elapsedTimeInterval]);

  // Stop elapsed time tracking
  const stopElapsedTimeTracking = useCallback(() => {
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
      setElapsedTimeInterval(null);
    }
    if (generationStartTime) {
      setGenerationDuration((Date.now() - generationStartTime) / 1000);
    }
  }, [elapsedTimeInterval, generationStartTime]);

  // Format elapsed time for display
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Create new job ID
  const createNewJobId = useCallback((prefix: string = '') => {
    const jobId = prefix ? `${prefix}-${uuidv4()}` : uuidv4();
    setCurrentJobId(jobId);
    return jobId;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimeInterval) {
        clearInterval(elapsedTimeInterval);
      }
    };
  }, [elapsedTimeInterval]);

  return {
    currentJobId,
    setCurrentJobId,
    generationProgress,
    setGenerationProgress,
    progressPercentage,
    setProgressPercentage,
    generationStartTime,
    currentElapsedTime,
    generationDuration,
    currentJobType,
    
    saveJobToStorage,
    updateJobProgress,
    removeJobFromStorage,
    cleanupExpiredJobs,
    markJobComplete,
    
    startElapsedTimeTracking,
    stopElapsedTimeTracking,
    formatElapsedTime,
    createNewJobId,
  };
}