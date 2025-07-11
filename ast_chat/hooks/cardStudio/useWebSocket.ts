"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import io, { Socket } from 'socket.io-client';
import { BACKEND_API_BASE_URL } from './constants';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const currentJobRef = useRef<string | null>(null);
  const subscribedJobsRef = useRef<Set<string>>(new Set()); // Track all subscribed jobs
  const lastJobUpdateRef = useRef<number>(Date.now());
  const connectionStartTimeRef = useRef<number | null>(null);
  const reconnectionAttemptsRef = useRef<number>(0);
  const MAX_CONNECTION_AGE = 5 * 60 * 1000; // 5 minutes in milliseconds
  const hasShownStaleToastRef = useRef(false);

  const connectWebSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('✅ WebSocket already connected');
      return;
    }

    // Check if connection is stale (older than 5 minutes)
    if (connectionStartTimeRef.current && 
        Date.now() - connectionStartTimeRef.current > MAX_CONNECTION_AGE) {
      console.log('⏰ Connection attempt is stale (>5 minutes), stopping reconnection');
      reconnectionAttemptsRef.current = 0;
      connectionStartTimeRef.current = null;
      
      // Only show toast once
      if (!hasShownStaleToastRef.current) {
        toast.error('Connection timed out. Please refresh the page if needed.');
        hasShownStaleToastRef.current = true;
      }
      
      return;
    }

    // Set connection start time on first attempt
    if (!connectionStartTimeRef.current) {
      connectionStartTimeRef.current = Date.now();
    }

    reconnectionAttemptsRef.current++;

    try {
      console.log('🔌 Connecting to WebSocket...');
      const socket = io(BACKEND_API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 120000, // Increased to 120 seconds for long-running operations
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 20, // Increased retry attempts for better resilience
        reconnectionDelayMax: 5000, // Max delay between reconnection attempts
        forceNew: true // Force new connection to avoid stale connections
      });

      socket.on('connect', () => {
        console.log('✅ WebSocket connected:', socket.id);
        setIsSocketConnected(true);
        toast.success('🔗 Real-time updates connected');
        
        // Reset connection tracking on successful connect
        connectionStartTimeRef.current = null;
        reconnectionAttemptsRef.current = 0;
        hasShownStaleToastRef.current = false;
        
        // Resubscribe to all subscribed jobs
        if (subscribedJobsRef.current.size > 0) {
          console.log('🔄 Resubscribing to jobs:', Array.from(subscribedJobsRef.current));
          subscribedJobsRef.current.forEach(jobId => {
            socket.emit('subscribe_job', { job_id: jobId });
          });
        }
      });

      socket.on('disconnect', (reason: string) => {
        console.log('❌ WebSocket disconnected:', reason);
        setIsSocketConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          socket.connect();
        }
      });

      socket.on('connect_error', (error: Error) => {
        console.error('❌ WebSocket connection error:', error);
        setIsSocketConnected(false);
        
        // Check if we should stop trying
        if (connectionStartTimeRef.current && 
            Date.now() - connectionStartTimeRef.current > MAX_CONNECTION_AGE) {
          console.log('⏰ Stopping reconnection attempts after 5 minutes');
          socket.disconnect();
          connectionStartTimeRef.current = null;
          reconnectionAttemptsRef.current = 0;
        }
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
      toast.error('Failed to connect real-time updates. Using fallback mode.');
    }
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🔌 Disconnecting WebSocket...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsSocketConnected(false);
      connectionStartTimeRef.current = null;
      reconnectionAttemptsRef.current = 0;
    }
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    // For draft jobs, don't unsubscribe from other drafts
    const isDraftJob = jobId.startsWith('draft-');
    
    // Only unsubscribe from previous job if it's not a draft job
    if (!isDraftJob && currentJobRef.current && currentJobRef.current !== jobId && socketRef.current?.connected) {
      console.log('🔄 Unsubscribing from previous job:', currentJobRef.current);
      socketRef.current.emit('unsubscribe_job', { job_id: currentJobRef.current });
      subscribedJobsRef.current.delete(currentJobRef.current);
    }
    
    // Add to subscribed jobs set
    subscribedJobsRef.current.add(jobId);
    
    if (!isDraftJob) {
      currentJobRef.current = jobId;
    }
    
    if (socketRef.current?.connected) {
      console.log('📡 Subscribing to job updates:', jobId);
      socketRef.current.emit('subscribe_job', { job_id: jobId });
    } else {
      console.log('⏳ WebSocket not connected, will subscribe when connected');
    }
  }, []);

  const unsubscribeFromJob = useCallback((jobId: string) => {
    if (currentJobRef.current === jobId) {
      currentJobRef.current = null;
    }
    
    // Remove from subscribed jobs set
    subscribedJobsRef.current.delete(jobId);
    
    if (socketRef.current?.connected) {
      console.log('📡 Unsubscribing from job updates:', jobId);
      socketRef.current.emit('unsubscribe_job', { job_id: jobId });
    }
  }, []);

  const unsubscribeFromAllJobs = useCallback(() => {
    console.log('🧹 Unsubscribing from all job updates');
    currentJobRef.current = null;
    subscribedJobsRef.current.clear();
    
    if (socketRef.current?.connected) {
      // Emit a special event to clear all job subscriptions
      socketRef.current.emit('unsubscribe_all_jobs', {});
    }
  }, []);

  // Set up job update listener
  const setJobUpdateHandler = useCallback((handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.off('job_update'); // Remove any existing handler
      socketRef.current.on('job_update', (data: any) => {
        console.log('📦 Job update received:', data);
        lastJobUpdateRef.current = Date.now();
        
        // Update connection start time to track how long we've been connected
        if (!connectionStartTimeRef.current) {
          connectionStartTimeRef.current = Date.now();
        }
        
        handler(data);
      });
    }
  }, []);

  // WebSocket connection lifecycle management
  useEffect(() => {
    // Connect WebSocket when component mounts
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  return {
    isSocketConnected,
    connectWebSocket,
    disconnectWebSocket,
    subscribeToJob,
    unsubscribeFromJob,
    unsubscribeFromAllJobs,
    setJobUpdateHandler,
    currentJobRef,
    lastJobUpdateRef
  };
}