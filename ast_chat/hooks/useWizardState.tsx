"use client";

import { useState, useCallback, useEffect } from "react";

export interface WizardStateData {
  currentStep: number;
  completedSteps: number[];
  timestamp: number;
}

const WIZARD_STATE_KEY = 'vibecarding-wizard-state';

// Helper function to safely store data
const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
    return false;
  }
};

// Helper function to safely retrieve data
const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to retrieve ${key} from localStorage:`, error);
    return null;
  }
};

// Helper function to restore wizard state from storage
const restoreWizardStateFromStorage = (): WizardStateData => {
  try {
    const savedData = safeGetItem(WIZARD_STATE_KEY);
    if (!savedData) return { currentStep: 1, completedSteps: [], timestamp: Date.now() };

    const parsedData = JSON.parse(savedData);
    
    // Check if data is not too old (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (Date.now() - parsedData.timestamp > maxAge) {
      return { currentStep: 1, completedSteps: [], timestamp: Date.now() };
    }
    
    return {
      currentStep: parsedData.currentStep || 1,
      completedSteps: Array.isArray(parsedData.completedSteps) ? parsedData.completedSteps : [],
      timestamp: parsedData.timestamp || Date.now(),
    };
  } catch (error) {
    console.warn('Failed to restore wizard state from localStorage:', error);
    return { currentStep: 1, completedSteps: [], timestamp: Date.now() };
  }
};

export function useWizardState() {
  const [wizardState, setWizardState] = useState<WizardStateData>({ 
    currentStep: 1, 
    completedSteps: [], 
    timestamp: Date.now() 
  });
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Initialize wizard state from storage on component mount (after hydration)
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialLoadComplete) {
      const restoredState = restoreWizardStateFromStorage();
      setWizardState(restoredState);
      setIsInitialLoadComplete(true);
    }
  }, [isInitialLoadComplete]);

  // Save wizard state to localStorage whenever it changes (debounced)
  useEffect(() => {
    if (!isInitialLoadComplete) return;

    const timeoutId = setTimeout(() => {
      const stateToSave = {
        ...wizardState,
        timestamp: Date.now(),
      };
      safeSetItem(WIZARD_STATE_KEY, JSON.stringify(stateToSave));
    }, 300); // Debounce by 300ms

    return () => clearTimeout(timeoutId);
  }, [wizardState, isInitialLoadComplete]);

  const setCurrentStep = useCallback((step: number) => {
    setWizardState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const setCompletedSteps = useCallback((steps: number[]) => {
    setWizardState(prev => ({ ...prev, completedSteps: steps }));
  }, []);

  const markStepCompleted = useCallback((step: number) => {
    setWizardState(prev => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step) 
        ? prev.completedSteps 
        : [...prev.completedSteps, step].sort((a, b) => a - b)
    }));
  }, []);

  const markStepIncomplete = useCallback((step: number) => {
    setWizardState(prev => ({
      ...prev,
      completedSteps: prev.completedSteps.filter(s => s !== step)
    }));
  }, []);

  const resetWizardState = useCallback(() => {
    const newState = { currentStep: 1, completedSteps: [], timestamp: Date.now() };
    setWizardState(newState);
    // Clear stored data
    try {
      localStorage.removeItem(WIZARD_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear wizard state from localStorage:', error);
    }
  }, []);

  const clearStoredWizardState = useCallback(() => {
    try {
      localStorage.removeItem(WIZARD_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear stored wizard state:', error);
    }
  }, []);

  const goToNextStep = useCallback(() => {
    setWizardState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
  }, []);

  const goToPreviousStep = useCallback(() => {
    setWizardState(prev => ({ ...prev, currentStep: Math.max(1, prev.currentStep - 1) }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setWizardState(prev => ({ ...prev, currentStep: step }));
  }, []);

  return {
    currentStep: wizardState.currentStep,
    completedSteps: wizardState.completedSteps,
    setCurrentStep,
    setCompletedSteps,
    markStepCompleted,
    markStepIncomplete,
    resetWizardState,
    clearStoredWizardState,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    isInitialLoadComplete,
  };
}