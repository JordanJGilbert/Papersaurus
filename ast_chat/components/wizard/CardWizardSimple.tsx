"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSimpleDraftGeneration } from "@/hooks/cardStudio/useSimpleDraftGeneration";
import Step5Simple from "./steps/Step5Simple";

// Simple wizard with just the essential state
export default function CardWizardSimple() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    cardType: 'birthday',
    tone: 'funny',
    to: '',
    from: '',
    message: '',
    email: '',
    prompt: ''
  });

  // Use our simple draft generation hook
  const drafts = useSimpleDraftGeneration();

  // Handle draft generation
  const handleGenerateDrafts = async () => {
    if (!formData.email) {
      toast.error('Please enter your email first');
      return;
    }

    await drafts.generateDrafts({
      cardType: formData.cardType,
      tone: formData.tone,
      to: formData.to,
      from: formData.from,
      message: formData.message,
      prompt: formData.prompt,
      model: 'gpt-image-1'
    });
  };

  // Simple step renderer
  const renderStep = () => {
    switch(step) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Card Details</h2>
            <input
              type="text"
              placeholder="To:"
              className="w-full p-2 border rounded"
              value={formData.to}
              onChange={(e) => setFormData({...formData, to: e.target.value})}
            />
            <input
              type="text"
              placeholder="From:"
              className="w-full p-2 border rounded"
              value={formData.from}
              onChange={(e) => setFormData({...formData, from: e.target.value})}
            />
            <Button onClick={() => setStep(2)}>Next</Button>
          </div>
        );
        
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Message</h2>
            <textarea
              placeholder="Your message..."
              className="w-full p-2 border rounded"
              rows={4}
              value={formData.message}
              onChange={(e) => setFormData({...formData, message: e.target.value})}
            />
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        );
        
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Email</h2>
            <input
              type="email"
              placeholder="your@email.com"
              className="w-full p-2 border rounded"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
            <Button onClick={() => setStep(4)}>Next</Button>
          </div>
        );
        
      case 4:
        return (
          <Step5Simple
            drafts={drafts.drafts}
            selectedIndex={drafts.selectedDraftIndex}
            isGenerating={drafts.isGenerating}
            progress={drafts.progress}
            timer={drafts.timer}
            onGenerate={handleGenerateDrafts}
            onSelect={drafts.selectDraft}
          />
        );
        
      default:
        return null;
    }
  };

  return (
    <Card className="max-w-2xl mx-auto p-6">
      {/* Simple progress bar */}
      <div className="flex gap-2 mb-6">
        {[1,2,3,4].map(i => (
          <div 
            key={i}
            className={`h-2 flex-1 rounded ${
              i <= step ? 'bg-blue-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      
      {/* Current step */}
      {renderStep()}
      
      {/* Navigation */}
      {step > 1 && step < 4 && (
        <Button 
          variant="outline" 
          onClick={() => setStep(step - 1)}
          className="mt-4"
        >
          Back
        </Button>
      )}
    </Card>
  );
}