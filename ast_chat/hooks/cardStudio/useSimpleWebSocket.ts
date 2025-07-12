"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import io, { Socket } from 'socket.io-client';
import { BACKEND_API_BASE_URL } from './constants';

export function useSimpleWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Connect to WebSocket
  useEffect(() => {
    const socket = io(BACKEND_API_BASE_URL, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setIsConnected(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  // Subscribe to a job
  const subscribe = useCallback((jobId: string) => {
    if (socketRef.current?.connected) {
      console.log(`📡 Subscribing to ${jobId}`);
      socketRef.current.emit('subscribe_job', { job_id: jobId });
    }
  }, []);

  // Unsubscribe from a job
  const unsubscribe = useCallback((jobId: string) => {
    if (socketRef.current?.connected) {
      console.log(`📡 Unsubscribing from ${jobId}`);
      socketRef.current.emit('unsubscribe_job', { job_id: jobId });
    }
  }, []);
  
  // Unsubscribe from all jobs
  const unsubscribeAll = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log(`📡 Unsubscribing from all jobs`);
      socketRef.current.emit('unsubscribe_all_jobs');
    }
  }, []);

  // Listen for updates
  const onUpdate = useCallback((callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.off('job_update');
      socketRef.current.on('job_update', callback);
    }
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
    unsubscribeAll,
    onUpdate
  };
}