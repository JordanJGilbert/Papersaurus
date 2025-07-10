"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import io, { Socket } from 'socket.io-client';
import { BACKEND_API_BASE_URL } from './constants';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const currentJobRef = useRef<string | null>(null);
  const lastJobUpdateRef = useRef<number>(Date.now());

  const connectWebSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('✅ WebSocket already connected');
      return;
    }

    try {
      console.log('🔌 Connecting to WebSocket...');
      const socket = io(BACKEND_API_BASE_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      socket.on('connect', () => {
        console.log('✅ WebSocket connected:', socket.id);
        setIsSocketConnected(true);
        toast.success('🔗 Real-time updates connected');
        
        // Resubscribe to current job if any
        if (currentJobRef.current) {
          console.log('🔄 Resubscribing to job:', currentJobRef.current);
          socket.emit('subscribe_job', { job_id: currentJobRef.current });
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
    }
  }, []);

  const subscribeToJob = useCallback((jobId: string) => {
    currentJobRef.current = jobId;
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
    
    if (socketRef.current?.connected) {
      console.log('📡 Unsubscribing from job updates:', jobId);
      socketRef.current.emit('unsubscribe_job', { job_id: jobId });
    }
  }, []);

  // Set up job update listener
  const setJobUpdateHandler = useCallback((handler: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.off('job_update'); // Remove any existing handler
      socketRef.current.on('job_update', (data: any) => {
        console.log('📦 Job update received:', data);
        lastJobUpdateRef.current = Date.now();
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
    setJobUpdateHandler,
    currentJobRef,
    lastJobUpdateRef
  };
}