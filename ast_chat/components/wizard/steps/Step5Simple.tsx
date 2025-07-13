"use client";

import React, { useState } from "react";
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

// Only showing front covers for drafts

export default function Step5Simple({
  drafts,
  selectedIndex,
  isGenerating,
  progress,
  timer,
  onGenerate,
  onSelect
}: Step5SimpleProps) {
  // No longer need view modes or panel navigation for front-only drafts

  const getFrontCoverImage = (draft: any): string | null => {
    if (!draft) return null;
    return draft.frontCover || null;
  };

  // Show loading state
  if (isGenerating && drafts.length === 0) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
        <h3 className="text-lg font-semibold">Creating Draft Previews</h3>
        <p className="text-sm text-gray-600">
          Generating 5 quick, rough drafts for you to choose from
        </p>
        <p className="text-sm text-gray-600">{progress}</p>
        <p className="text-xs text-gray-500">Time: {timer}</p>
        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg max-w-md mx-auto">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            💡 These are quick previews only. Your final card will be generated in high quality.
          </p>
        </div>
      </div>
    );
  }

  // Show drafts
  if (drafts.length > 0) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Choose Your Favorite Design</h3>
          <p className="text-sm text-gray-600">
            Select from these rough draft previews
          </p>
          <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg max-w-md mx-auto">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              🎨 <strong>Note:</strong> These are quick, low-resolution drafts. After you select one, 
              we'll generate your final high-quality card with all 4 panels.
            </p>
          </div>
        </div>
        
        {/* Simple grid showing only front covers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((draft, index) => {
            const frontCoverImage = getFrontCoverImage(draft);
            
            return (
              <Card 
                key={index}
                className={`cursor-pointer transition-all ${
                  selectedIndex === index ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => onSelect(index)}
              >
                <CardContent className="p-4">
                  <div className="relative">
                    {frontCoverImage ? (
                      <img 
                        src={frontCoverImage} 
                        alt={`Draft ${index + 1}`}
                        className="w-full h-64 object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-64 bg-gray-100 rounded flex items-center justify-center">
                        <p className="text-gray-400">Loading...</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-2 text-center">
                    <p className="text-sm font-medium">
                      Draft Preview {index + 1}
                    </p>
                    <p className="text-xs text-gray-500">
                      Front cover only
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
        We'll generate 5 unique front cover designs for you to choose from.
      </p>
      <p className="text-xs text-gray-500">
        Once you select your favorite, we'll create the complete card with all panels.
      </p>
      <Button onClick={onGenerate} size="lg">
        <Sparkles className="w-4 h-4 mr-2" />
        Generate 5 Front Cover Designs
      </Button>
    </div>
  );
}