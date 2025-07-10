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
      localStorage.setItem(`cardJob_${jobId}`, JSON.stringify({
        ...jobData,
        id: jobId,
        status: 'processing',
        createdAt: Date.now()
      }));
      
      const pendingJobs = JSON.parse(localStorage.getItem('pendingCardJobs') || '[]');
      if (!pendingJobs.includes(jobId)) {
        pendingJobs.push(jobId);
        localStorage.setItem('pendingCardJobs', JSON.stringify(pendingJobs));
      }
    } catch (error) {
      console.error('Failed to save job to localStorage:', error);
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
    const start = startTime || Date.now();
    setGenerationStartTime(start);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('generation-start-time', start.toString());
    }
    
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentElapsedTime(elapsed);
      
      const estimatedTotal = estimatedTotalSeconds || 150;
      const percentage = Math.min((elapsed / estimatedTotal) * 100, 95);
      setProgressPercentage(percentage);
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
    removeJobFromStorage,
    startElapsedTimeTracking,
    stopElapsedTimeTracking,
    checkPendingJobs
  };
}