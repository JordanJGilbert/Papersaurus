"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { CardFormData } from "@/hooks/useCardForm";

interface Step4Props {
  formData: CardFormData;
  updateFormData: (updates: Partial<CardFormData>) => void;
  onStepComplete?: () => void;
}

export default function Step4Details({ formData, updateFormData, onStepComplete }: Step4Props) {

  React.useEffect(() => {
    // Validate email and auto-complete when valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = formData.userEmail.trim() && emailRegex.test(formData.userEmail);
    
    if (isValid) {
      onStepComplete?.();
    }
  }, [formData.userEmail, onStepComplete]);

  return (
    <div className="space-y-4">
      {/* User Email Field */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-8 bg-gradient-to-b from-orange-500 to-red-500 rounded-full" />
          <label className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Your Email
          </label>
        </div>
        <Input
          type="email"
          placeholder="📧 your.email@example.com"
          required
          value={formData.userEmail}
          onChange={(e) => updateFormData({ userEmail: e.target.value })}
          style={{ fontSize: '16px' }}
          className="h-12 sm:h-14 border-2 hover:border-orange-300 dark:hover:border-orange-700 transition-colors touch-manipulation text-base"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          We'll email you when your card is ready!
        </p>
      </div>

      {/* Tips */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
        <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-2">📧 Almost There!</h4>
        <p className="text-sm text-orange-800 dark:text-orange-200">
          Your email is required to generate and deliver your personalized greeting card.
        </p>
      </div>
    </div>
  );
} 