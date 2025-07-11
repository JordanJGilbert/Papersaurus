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

  // Job management functions
  const saveJobToStorage = (jobId: string, jobData: any) => {
    if (typeof window === 'undefined') return;
    
    try {
      // Enhanced job data with progress and state
      const enhancedJobData = {
        ...jobData,
        id: jobId,
        status: 'processing',
        createdAt: Date.now(),
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

  // Start elapsed time tracking
  const startElapsedTimeTracking = useCallback((startTime?: number, estimatedTotalSeconds?: number) => {
    // Always use fresh start time, ignore any old stored values
    const start = startTime || Date.now();
    setGenerationStartTime(start);
    setCurrentElapsedTime(0); // Reset elapsed time
    setProgressPercentage(0); // Reset progress
    
    if (typeof window !== 'undefined') {
      // Clear any old generation time before setting new one
      localStorage.removeItem('generation-start-time');
      localStorage.setItem('generation-start-time', start.toString());
    }
    
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentElapsedTime(elapsed);
      
      // Only use time-based estimation if we don't have real progress
      // Don't update percentage here - let WebSocket updates handle it
      const estimatedTotal = estimatedTotalSeconds || 150;
      const timeBasedPercentage = Math.min((elapsed / estimatedTotal) * 100, 90);
      
      // Only set time-based progress if we haven't received WebSocket updates
      setProgressPercentage(prev => {
        // If we have WebSocket progress (> 0), don't override with time estimation
        if (prev > 0 && prev < timeBasedPercentage) {
          // WebSocket might be lagging, use time estimation as minimum
          return Math.max(prev, timeBasedPercentage);
        } else if (prev === 0) {
          // No WebSocket updates yet, use time estimation
          return timeBasedPercentage;
        }
        return prev;
      });
    }, 1000);
    
    setElapsedTimeInterval(interval);
  }, [elapsedTimeInterval]);

  // Stop elapsed time tracking
  const stopElapsedTimeTracking = useCallback(() => {
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
      setElapsedTimeInterval(null);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('generation-start-time');
    }
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

  return {
    currentJobId,
    setCurrentJobId,
    generationProgress,
    setGenerationProgress,
    progressPercentage,
    setProgressPercentage,
    generationStartTime,
    setGenerationStartTime,
    currentElapsedTime,
    setCurrentElapsedTime,
    elapsedTimeInterval,
    setElapsedTimeInterval,
    generationDuration,
    setGenerationDuration,
    saveJobToStorage,
    updateJobProgress,
    removeJobFromStorage,
    startElapsedTimeTracking,
    stopElapsedTimeTracking,
    clearAllJobData,
    checkPendingJobs
  };
}