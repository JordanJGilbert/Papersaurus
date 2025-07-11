"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface Step5SimpleProps {
  drafts: any[];
  selectedIndex: number;
  isGenerating: boolean;
  progress: string;
  timer: string;
  onGenerate: () => void;
  onSelect: (index: number) => void;
}

export default function Step5Simple({
  drafts,
  selectedIndex,
  isGenerating,
  progress,
  timer,
  onGenerate,
  onSelect
}: Step5SimpleProps) {
  // Show loading state
  if (isGenerating && drafts.length === 0) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <h3 className="text-lg font-semibold">Creating Your Drafts</h3>
        <p className="text-sm text-gray-600">{progress}</p>
        <p className="text-xs text-gray-500">Time: {timer}</p>
      </div>
    );
  }

  // Show drafts
  if (drafts.length > 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Select Your Favorite Design</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {drafts.map((draft, index) => (
            <Card 
              key={index}
              className={`cursor-pointer transition-all ${
                selectedIndex === index ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => onSelect(index)}
            >
              <CardContent className="p-4">
                <img 
                  src={draft.images.frontCover} 
                  alt={`Draft ${index + 1}`}
                  className="w-full h-48 object-cover rounded"
                />
                <p className="text-sm mt-2 text-center">
                  Draft {index + 1}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {isGenerating && (
          <p className="text-sm text-center text-gray-600">
            {progress} • {timer}
          </p>
        )}
      </div>
    );
  }

  // Initial state - ready to generate
  return (
    <div className="text-center space-y-4">
      <h3 className="text-lg font-semibold">Ready to Create Your Card!</h3>
      <p className="text-sm text-gray-600">
        We'll generate 5 unique designs for you to choose from.
      </p>
      <Button onClick={onGenerate} size="lg">
        <Sparkles className="w-4 h-4 mr-2" />
        Generate 5 Drafts
      </Button>
    </div>
  );
}