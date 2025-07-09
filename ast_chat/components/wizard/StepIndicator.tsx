"use client";

import React from "react";
import { Check, Circle } from "lucide-react";
import { WizardStep } from "./CardWizard";

interface StepIndicatorProps {
  steps: WizardStep[];
  currentStep: number;
  completedSteps: number[];
  onStepClick: (stepNumber: number) => void;
}

export default function StepIndicator({ 
  steps, 
  currentStep, 
  completedSteps, 
  onStepClick 
}: StepIndicatorProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = completedSteps.includes(stepNumber);
          const isCurrent = currentStep === stepNumber;
          const isClickable = stepNumber <= currentStep || isCompleted;

          return (
            <React.Fragment key={step.id}>
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => isClickable && onStepClick(stepNumber)}
                  disabled={!isClickable}
                  className={`
                    relative w-10 h-10 rounded-full flex items-center justify-center 
                    transition-all duration-200 mb-2
                    ${isCompleted 
                      ? 'bg-green-500 text-white shadow-lg hover:bg-green-600' 
                      : isCurrent 
                      ? 'bg-blue-500 text-white shadow-lg ring-4 ring-blue-100 dark:ring-blue-900/30' 
                      : isClickable
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    }
                    ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}
                  `}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-medium">{stepNumber}</span>
                  )}
                </button>
                
                {/* Step Label */}
                <div className="text-center">
                  <div className={`
                    text-xs font-medium
                    ${isCurrent 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : isCompleted 
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400'
                    }
                  `}>
                    {step.title}
                  </div>
                  {step.isOptional && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      Optional
                    </div>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 mx-2 mt-5">
                  <div 
                    className={`
                      h-full transition-all duration-300
                      ${completedSteps.includes(stepNumber) 
                        ? 'bg-green-500' 
                        : 'bg-gray-200 dark:bg-gray-700'
                      }
                    `}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Progress Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
          <span>Progress</span>
          <span>
            {Math.round(((completedSteps.length + (currentStep > completedSteps.length ? 0.5 : 0)) / steps.length) * 100)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500 ease-out"
            style={{ 
              width: `${((completedSteps.length + (currentStep > completedSteps.length ? 0.5 : 0)) / steps.length) * 100}%` 
            }}
          />
        </div>
      </div>
    </div>
  );
} 