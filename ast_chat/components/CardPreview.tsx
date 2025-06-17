import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff } from "lucide-react";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCoverImageUrl: string;
  interiorLeftImageUrl: string;
  interiorRightImageUrl: string;
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
            Closed View (Front Cover)
          </Button>
          <Button
            variant={viewMode === "open" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("open")}
          >
            <EyeOff className="w-4 h-4 mr-1" />
            Open View (Print Layouts)
          </Button>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={handleZoomOut}><ZoomOut className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleResetZoom}><RotateCcw className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleZoomIn}><ZoomIn className="w-4 h-4" /></Button>
          <Badge variant="secondary" className="ml-2">{Math.round(zoom * 100)}%</Badge>
        </div>
      </div>

      {/* Card Preview */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 overflow-auto">
        <div 
          className="mx-auto transition-transform duration-300 flex flex-col items-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {viewMode === "closed" ? (
            // Closed Card View - Show just the front cover panel
            <div className="relative w-[calc(theme(space.80)/2)] h-80 aspect-[9/16]"> {/* Approx 9:16 portrait panel */}
              <img
                src={card.frontCoverImageUrl}
                alt="Front Cover Panel"
                className="w-full h-full object-cover rounded-lg shadow-lg border-2 border-white"
              />
              <div className="absolute top-2 left-2">
                <Badge className="bg-blue-500 text-white">Front Cover</Badge>
              </div>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2 w-full absolute -bottom-8">
                This is the front cover panel.
              </p>
            </div>
          ) : (
            // Open Card View - Show print layout simulations
            <div className="space-y-8 w-full max-w-3xl">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">Print Layout Preview</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Three separate panels arranged for a two-page print spread.
                </p>
              </div>
              
              {/* Layout 1: Front/Back */}
              <div className="space-y-2">
                <Badge className="bg-blue-500 text-white w-full justify-center">
                  Layout 1: Front/Back (Print on Page 1 - Landscape 16:9)
                </Badge>
                <div className="aspect-[16/9] border border-gray-300 dark:border-gray-600 rounded-lg flex overflow-hidden shadow-md">
                  {/* Left Half - Blank */}
                  <div className="w-1/2 bg-white border-r border-dashed border-gray-400 dark:border-gray-500 flex items-center justify-center">
                    <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded text-sm">
                      Back (Blank)
                    </div>
                  </div>
                  {/* Right Half - Front Cover Panel */}
                  <div className="w-1/2 relative bg-gray-50 dark:bg-gray-700/50">
                    <img 
                      src={card.frontCoverImageUrl} 
                      alt="Front Cover Panel Preview" 
                      className="w-full h-full object-contain p-1"
                    />
                    <div className="absolute top-1 right-1 bg-black/30 text-white px-1.5 py-0.5 rounded text-xs">Front Cover Panel</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Page 1: Left half is blank (back of card), right half shows the Front Cover panel.
                </p>
              </div>

              {/* Layout 2: Interior */}
              <div className="space-y-2">
                <Badge className="bg-emerald-500 text-white w-full justify-center">
                  Layout 2: Interior (Print on Page 2 - Landscape 16:9)
                </Badge>
                <div className="aspect-[16/9] border border-gray-300 dark:border-gray-600 rounded-lg flex overflow-hidden shadow-md">
                  {/* Left Half - Interior Left Panel */}
                  <div className="w-1/2 relative border-r border-dashed border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-700/50">
                    <img 
                      src={card.interiorLeftImageUrl} 
                      alt="Interior Left Panel Preview" 
                      className="w-full h-full object-contain p-1"
                    />
                    <div className="absolute top-1 left-1 bg-black/30 text-white px-1.5 py-0.5 rounded text-xs">Interior Left (Art)</div>
                  </div>
                  {/* Right Half - Interior Right Panel */}
                  <div className="w-1/2 relative bg-gray-50 dark:bg-gray-700/50">
                    <img 
                      src={card.interiorRightImageUrl} 
                      alt="Interior Right Panel Preview" 
                      className="w-full h-full object-contain p-1"
                    />
                    <div className="absolute top-1 right-1 bg-black/30 text-white px-1.5 py-0.5 rounded text-xs">Interior Right (Message)</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Page 2: Left half shows Interior Decorative Art panel, right half shows Interior Message panel.
                </p>
              </div>

              {/* Folding Instructions */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">
                  📄 Printing & Assembly Instructions:
                </h4>
                <ol className="text-sm text-amber-800 dark:text-amber-200 space-y-1 list-decimal list-inside">
                  <li>Print Layout 1 (Front/Back) on one side of landscape cardstock.</li>
                  <li>Print Layout 2 (Interior) on the reverse side, ensuring proper alignment (flip on long edge).</li>
                  <li>Fold the cardstock in half along the center vertical line.</li>
                  <li>The Front Cover panel will be on the outside front. The blank area will be the outside back.</li>
                  <li>When opened, the Interior Left (Art) and Interior Right (Message) panels will be visible inside.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Details */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h4 className="font-medium mb-2">Original Overall Theme:</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 italic">
          "{card.prompt}"
        </p>
      </div>
    </div>
  );
} 