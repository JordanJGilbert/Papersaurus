import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff } from "lucide-react";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  leftPage: string;
  rightPage: string;
  createdAt: Date;
}

interface CardPreviewProps {
  card: GeneratedCard;
}

export default function CardPreview({ card }: CardPreviewProps) {
  const [viewMode, setViewMode] = useState<"closed" | "open">("closed");
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "closed" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("closed")}
          >
            <Eye className="w-4 h-4 mr-1" />
            Closed View
          </Button>
          <Button
            variant={viewMode === "open" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("open")}
          >
            <EyeOff className="w-4 h-4 mr-1" />
            Open View
          </Button>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetZoom}>
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Badge variant="secondary" className="ml-2">
            {Math.round(zoom * 100)}%
          </Badge>
        </div>
      </div>

      {/* Card Preview */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 overflow-auto">
        <div 
          className="mx-auto transition-transform duration-300"
          style={{ transform: `scale(${zoom})` }}
        >
          {viewMode === "closed" ? (
            // Closed Card View - Show just the front cover (right half of the front/back layout)
            <div className="relative">
              <div className="w-80 h-48 mx-auto">
                <img
                  src={card.frontCover}
                  alt="Front/Back Layout"
                  className="w-full h-full object-cover rounded-lg shadow-lg border-2 border-white"
                  style={{ 
                    objectPosition: '75% center' // Show the right half (front cover)
                  }}
                />
                <div className="absolute top-2 left-2">
                  <Badge className="bg-blue-500 text-white">Front Cover (Right Half)</Badge>
                </div>
              </div>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
                Click "Open View" to see the complete print layouts
              </p>
            </div>
          ) : (
            // Open Card View - Show both layout images
            <div className="space-y-6">
              {/* Print Layout Visualization */}
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Print Layout Preview</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Two perfectly aligned images ready for professional printing
                </p>
              </div>
              
              {/* Two Layout Images */}
              <div className="grid grid-cols-1 gap-6">
                {/* Front/Back Layout */}
                <div className="space-y-2">
                  <Badge className="bg-blue-500 text-white w-full justify-center">
                    Layout 1: Front/Back (Print on Page 1)
                  </Badge>
                  <div className="aspect-[16/9] relative">
                    <img
                      src={card.frontCover}
                      alt="Front/Back Layout"
                      className="w-full h-full object-cover rounded-lg shadow-md border"
                    />
                    {/* Overlay to show the split */}
                    <div className="absolute inset-0 flex">
                      <div className="w-1/2 flex items-center justify-center">
                        <div className="bg-black/20 text-white px-2 py-1 rounded text-xs">
                          Back (Blank)
                        </div>
                      </div>
                      <div className="w-1/2 flex items-center justify-center">
                        <div className="bg-black/20 text-white px-2 py-1 rounded text-xs">
                          Front Cover
                        </div>
                  </div>
                </div>
                    {/* Center split line */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-red-400 opacity-60"></div>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Left half stays blank (back of card), right half shows front cover
                  </p>
                </div>

                {/* Interior Layout */}
                <div className="space-y-2">
                  <Badge className="bg-emerald-500 text-white w-full justify-center">
                    Layout 2: Interior (Print on Page 2)
                  </Badge>
                  <div className="aspect-[16/9] relative">
                    <img
                      src={card.leftPage}
                      alt="Interior Layout"
                      className="w-full h-full object-cover rounded-lg shadow-md border"
                    />
                    {/* Overlay to show the split */}
                    <div className="absolute inset-0 flex">
                      <div className="w-1/2 flex items-center justify-center">
                        <div className="bg-black/20 text-white px-2 py-1 rounded text-xs">
                          Decorative Art
                        </div>
                      </div>
                      <div className="w-1/2 flex items-center justify-center">
                        <div className="bg-black/20 text-white px-2 py-1 rounded text-xs">
                          Message
                        </div>
                      </div>
                    </div>
                    {/* Center split line */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-red-400 opacity-60"></div>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    Left half shows decorative artwork, right half shows handwritten message
                  </p>
                </div>
              </div>

                              {/* Folding Instructions */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">
                  📄 Printing Instructions:
                </h4>
                <ol className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                  <li>1. Print Layout 1 (Front/Back) on one side of cardstock</li>
                  <li>2. Print Layout 2 (Interior) on the reverse side, ensuring proper alignment</li>
                  <li>3. Fold along the center line (red line shown above)</li>
                  <li>4. The result: Perfect greeting card with aligned front, back, and interior pages</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Details */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Original Prompt:</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
          "{card.prompt}"
        </p>
      </div>
    </div>
  );
} 