"use client";

import { useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';
import { GeneratedCard } from './constants';

export function useJobManagement() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [currentElapsedTime, setCurrentElapsedTime] = useState<number>(0);
  const [elapsedTimeInterval, setElapsedTimeInterval] = useState<NodeJS.Timeout | null>(null);
  const [generationDuration, setGenerationDuration] = useState<number | null>(null);
  const [currentJobType, setCurrentJobType] = useState<'draft' | 'final' | null>(null);

  // Job management functions
  const saveJobToStorage = (jobId: string, jobData: any) => {
    if (typeof window === 'undefined') return;
    
    try {
      // Enhanced job data with progress, state, and expiration
      const enhancedJobData = {
        ...jobData,
        id: jobId,
        status: 'processing',
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days expiration
        lastProgress: progressPercentage,
        lastProgressText: generationProgress,
        elapsedTime: currentElapsedTime
      };
      
      localStorage.setItem(`cardJob_${jobId}`, JSON.stringify(enhancedJobData));
      
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      if (!pendingJobs.includes(jobId)) {
        pendingJobs.push(jobId);
        localStorage.setItem('pendingCardJobs', JSON.stringify(pendingJobs));
      }
      
      // Run cleanup of expired jobs
      cleanupExpiredJobs();
    } catch (error) {
      console.error('Failed to save job to localStorage:', error);
    }
  };

  // Update job progress in storage
  const updateJobProgress = (jobId: string, progress: number, progressText: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const jobData = localStorage.getItem(`cardJob_${jobId}`);
      if (!jobData) return;
      
      const job = JSON.parse(jobData);
      job.lastProgress = progress;
      job.lastProgressText = progressText;
      job.elapsedTime = currentElapsedTime;
      job.lastUpdate = Date.now();
      
      localStorage.setItem(`cardJob_${jobId}`, JSON.stringify(job));
    } catch (error) {
      console.error('Failed to update job progress:', error);
    }
  };

  // Remove job from storage
  const removeJobFromStorage = (jobId: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(`cardJob_${jobId}`);
      
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const updatedJobs = pendingJobs.filter((id: string) => id !== jobId);
      localStorage.setItem('pendingCardJobs', JSON.stringify(updatedJobs));
    } catch (error) {
      console.error('Failed to remove job from localStorage:', error);
    }
  };

  // Cleanup expired jobs from localStorage
  const cleanupExpiredJobs = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    // Check all localStorage keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cardJob_')) {
        try {
          const jobData = localStorage.getItem(key);
          if (jobData) {
            const job = JSON.parse(jobData);
            // Remove if expired or corrupted data
            if (!job.expiresAt || job.expiresAt < now) {
              keysToRemove.push(key);
            }
          }
        } catch (error) {
          // Remove corrupted data
          keysToRemove.push(key);
        }
      }
    });
    
    // Remove expired jobs
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🧹 Removed expired job: ${key}`);
    });
    
    // Update pending jobs list
    if (keysToRemove.length > 0) {
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const cleanedJobs = pendingJobs.filter((jobId: string) => 
        !keysToRemove.includes(`cardJob_${jobId}`)
      );
      localStorage.setItem('pendingCardJobs', JSON.stringify(cleanedJobs));
    }
  }, []);

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
    const expectedDuration = jobType === 'draft' ? 45 : 105; // 45s for draft, 105s for final
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentElapsedTime(elapsed);
      
      // Calculate progress based on elapsed time
      // Progress increases linearly up to 95% at expected duration
      // Then slows down to reach 99% at 2x expected duration
      let progress = 0;
      if (elapsed < expectedDuration) {
        // Linear progress up to 95%
        progress = (elapsed / expectedDuration) * 95;
      } else {
        // Slow progress from 95% to 99% over the next expectedDuration seconds
        const overtime = elapsed - expectedDuration;
        const overtimeProgress = Math.min(overtime / expectedDuration, 1) * 4; // 4% more
        progress = 95 + overtimeProgress;
      }
      
      setProgressPercentage(Math.min(Math.round(progress), 99));
    }, 100); // Update every 100ms for smooth progress
    
    setElapsedTimeInterval(interval);
  }, [elapsedTimeInterval]);

  // Stop elapsed time tracking
  const stopElapsedTimeTracking = useCallback(() => {
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
      setElapsedTimeInterval(null);
    }
    // Set progress to 100% when stopping
    setProgressPercentage(100);
  }, [elapsedTimeInterval]);

  // Clear all job data from localStorage
  const clearAllJobData = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    console.log('🧹 Clearing all job data from localStorage');
    
    // Get all keys
    const keys = Object.keys(localStorage);
    
    // Remove all job-related keys
    keys.forEach(key => {
      if (key.startsWith('cardJob_') || key === 'pendingCardJobs' || key === 'generation-start-time') {
        localStorage.removeItem(key);
      }
    });
    
    // Reset state
    setCurrentElapsedTime(0);
    setProgressPercentage(0);
    setGenerationStartTime(null);
  }, []);

  // Recovery function - resume WebSocket subscriptions for pending jobs
  const checkPendingJobs = async () => {
    if (typeof window === 'undefined') return [];
    
    try {
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      const jobsData = [];
      
      for (const jobId of pendingJobs) {
        const jobData = localStorage.getItem(`cardJob_${jobId}`);
        if (!jobData) continue;
        
        const job = JSON.parse(jobData);
        jobsData.push({ jobId, job });
      }
      
      return jobsData;
    } catch (error) {
      console.error('Failed to check pending jobs:', error);
      return [];
    }
  };

  // Load most recent draft batch (5 cards)
  const loadMostRecentDraftBatch = () => {
    if (typeof window === 'undefined') return null;
    
    try {
      // Get all localStorage keys
      const keys = Object.keys(localStorage);
      const draftJobKeys = keys.filter(key => key.startsWith('cardJob_draft-'));
      console.log(`🔍 Found ${draftJobKeys.length} draft job keys in localStorage`);
      
      const draftJobs = [];
      
      // Find all draft job entries
      for (const key of draftJobKeys) {
        const jobData = localStorage.getItem(key);
        if (jobData) {
          try {
            const job = JSON.parse(jobData);
            console.log(`📄 Checking ${key}:`, { 
              hasDraftCards: !!job.draftCards, 
              cardCount: job.draftCards?.length || 0,
              createdAt: job.createdAt
            });
            
            if (job.draftCards && Array.isArray(job.draftCards) && job.draftCards.length > 0) {
              draftJobs.push({
                key,
                job,
                createdAt: job.createdAt || 0
              });
            }
          } catch (e) {
            console.error(`Failed to parse ${key}:`, e);
          }
        }
      }
      
      // If no draft jobs found, return null
      if (draftJobs.length === 0) return null;
      
      // Sort by creation time (newest first)
      draftJobs.sort((a, b) => b.createdAt - a.createdAt);
      
      // Get the most recent batch (they should all have similar timestamps)
      const mostRecentTimestamp = draftJobs[0].createdAt;
      const recentBatch = draftJobs.filter(job => {
        // Consider jobs within 5 minutes of each other as the same batch
        return Math.abs(job.createdAt - mostRecentTimestamp) < 5 * 60 * 1000;
      });
      
      // Collect all draft cards from the batch, avoiding duplicates
      const draftCardMap = new Map();
      
      for (const { job } of recentBatch) {
        if (job.draftCards && job.draftCards.length > 0) {
          // Each job now stores only one draft card
          const draftCard = job.draftCards[0];
          const draftIndex = job.draftIndex !== undefined ? job.draftIndex : 
            parseInt(draftCard.id.match(/draft-(\d+)-/)?.[1] || '0') - 1;
          
          // Use draft index as key to avoid duplicates
          if (!draftCardMap.has(draftIndex)) {
            draftCardMap.set(draftIndex, draftCard);
          }
        }
      }
      
      // Convert map to array and sort by draft index
      const allDraftCards = Array.from(draftCardMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([_, card]) => card);
      
      console.log(`📋 Loaded ${allDraftCards.length} unique draft cards from batch`);
      
      // Return the batch info
      return {
        cards: allDraftCards,
        createdAt: mostRecentTimestamp,
        count: allDraftCards.length
      };
    } catch (error) {
      console.error('Failed to load recent draft batch:', error);
      return null;
    }
  };

  // Run cleanup on mount
  useEffect(() => {
    cleanupExpiredJobs();
  }, [cleanupExpiredJobs]);

  return {
    currentJobId,
    setCurrentJobId,
    generationProgress,
    setGenerationProgress,
    progressPercentage, // Read-only, calculated from elapsed time
    generationStartTime,
    setGenerationStartTime,
    currentElapsedTime,
    setCurrentElapsedTime,
    elapsedTimeInterval,
    setElapsedTimeInterval,
    generationDuration,
    setGenerationDuration,
    currentJobType,
    setCurrentJobType,
    saveJobToStorage,
    updateJobProgress,
    removeJobFromStorage,
    startElapsedTimeTracking,
    stopElapsedTimeTracking,
    clearAllJobData,
    checkPendingJobs,
    loadMostRecentDraftBatch,
    cleanupExpiredJobs
  };
}