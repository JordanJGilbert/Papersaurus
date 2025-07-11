"use client";

import { useState, useEffect, useCallback } from "react";

export function useSimpleTimer() {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const start = useCallback(() => {
    setSeconds(0);
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setSeconds(0);
    setIsRunning(false);
  }, []);

  return {
    seconds,
    isRunning,
    start,
    stop,
    reset,
    formatted: `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`
  };
}