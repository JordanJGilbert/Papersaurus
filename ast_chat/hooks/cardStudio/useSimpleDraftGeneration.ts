"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';
import { GeneratedCard } from './constants';
import { useSimpleWebSocket } from './useSimpleWebSocket';
import { useSimpleTimer } from './useSimpleTimer';

interface DraftGenerationState {
  isGenerating: boolean;
  drafts: GeneratedCard[];
  selectedDraftIndex: number;
  progress: string;
}

export function useSimpleDraftGeneration() {
  const [state, setState] = useState<DraftGenerationState>({
    isGenerating: false,
    drafts: [],
    selectedDraftIndex: -1,
    progress: ''
  });

  const { subscribe, unsubscribe, unsubscribeAll, onUpdate, isConnected } = useSimpleWebSocket();
  const timer = useSimpleTimer();
  const activeJobsRef = useRef<Set<string>>(new Set());

  // Listen for WebSocket updates
  useEffect(() => {
    onUpdate((data) => {
      console.log('📦 Update:', data);
      
      // Only process updates for current active jobs
      const jobId = data.job_id;
      if (!jobId || !activeJobsRef.current.has(jobId)) {
        console.log(`🚫 Ignoring update from non-active job: ${jobId}`);
        return;
      }
      
      if (data.status === 'completed' && data.result) {
        // Draft completed
        setState(prev => ({
          ...prev,
          drafts: [...prev.drafts, data.result].slice(0, 5), // Keep max 5 drafts
          progress: `${prev.drafts.length + 1} of 5 drafts completed`
        }));
        
        // Unsubscribe from completed job
        unsubscribe(jobId);
        activeJobsRef.current.delete(jobId);
        
        // Check if all done
        if (activeJobsRef.current.size === 0) {
          timer.stop();
          setState(prev => ({
            ...prev,
            isGenerating: false,
            progress: 'All drafts completed!'
          }));
          toast.success('✨ All 5 drafts are ready!');
        }
      } else if (data.progress) {
        // Progress update
        setState(prev => ({
          ...prev,
          progress: data.progress
        }));
      }
    });
  }, [onUpdate, unsubscribe, timer]);

  // Generate 5 draft cards
  const generateDrafts = useCallback(async (params: any) => {
    // Reset state
    setState({
      isGenerating: true,
      drafts: [],
      selectedDraftIndex: -1,
      progress: 'Starting draft generation...'
    });
    
    // Clear any active jobs and unsubscribe from all
    activeJobsRef.current.forEach(jobId => unsubscribe(jobId));
    activeJobsRef.current.clear();
    unsubscribeAll(); // Ensure we're not listening to any old jobs
    
    timer.start();

    try {
      // Create 5 draft jobs
      const draftPromises = Array.from({ length: 5 }, async (_, index) => {
        const jobId = `draft-${index}-${uuidv4()}`;
        activeJobsRef.current.add(jobId);
        
        // Subscribe to this job
        subscribe(jobId);

        // Start the job
        const response = await fetch('/api/generate-card-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            ...params,
            isDraft: true,
            draftIndex: index
          })
        });

        if (!response.ok) {
          throw new Error(`Draft ${index + 1} failed`);
        }

        return jobId;
      });

      await Promise.all(draftPromises);
    } catch (error) {
      console.error('Draft generation error:', error);
      timer.stop();
      setState(prev => ({
        ...prev,
        isGenerating: false,
        progress: 'Generation failed'
      }));
      toast.error('Failed to generate drafts');
    }
  }, [subscribe, unsubscribe, unsubscribeAll, timer]);

  // Select a draft
  const selectDraft = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedDraftIndex: index
    }));
  }, []);

  // Reset everything
  const reset = useCallback(() => {
    // Unsubscribe from all active jobs
    activeJobsRef.current.forEach(jobId => unsubscribe(jobId));
    activeJobsRef.current.clear();
    unsubscribeAll(); // Ensure complete cleanup
    
    timer.reset();
    
    setState({
      isGenerating: false,
      drafts: [],
      selectedDraftIndex: -1,
      progress: ''
    });
  }, [unsubscribe, unsubscribeAll, timer]);

  return {
    ...state,
    generateDrafts,
    selectDraft,
    reset,
    timer: timer.formatted,
    isConnected
  };
}