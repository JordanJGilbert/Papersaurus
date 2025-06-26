import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, Info } from "lucide-react";

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;
  leftPage: string;
  rightPage: string;
  createdAt: Date;
}

interface PrintLayoutProps {
  card: GeneratedCard;
}

export default function PrintLayout({ card }: PrintLayoutProps) {
  const handleDownloadAll = () => {
    // Download both layout images
    const images = [
      { url: card.frontCover, name: `card-front-back-layout-${card.id}.jpg` },
      { url: card.leftPage, name: `card-interior-layout-${card.id}.jpg` },
    ];

    images.forEach((image, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = image.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 500); // Stagger downloads
    });
  };

  const handlePrintLayout = () => {
    // Open a new window with print-optimized layout
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Greeting Card - Print Layout</title>
          <style>
            @page {
              size: 11in 8.5in; /* Landscape orientation */
              margin: 0;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }
            
            /* Page 1: Front/Back Layout */
            .page-1 {
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              page-break-after: always;
              position: relative;
            }
            
            /* Page 2: Interior Layout */
            .page-2 {
              width: 100vw;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(180deg); /* This ensures proper orientation after flip */
              position: relative;
            }
            
            .layout-image {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            
            .fold-instructions {
              position: absolute;
              top: 10px;
              left: 10px;
              font-size: 12px;
              color: #666;
              background: rgba(255, 255, 255, 0.9);
              padding: 8px 12px;
              border-radius: 4px;
              border: 1px solid #ccc;
              z-index: 10;
            }
            
            @media print {
              .fold-instructions {
                display: none;
              }
              
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              
              .page-1, .page-2 {
                page-break-inside: avoid;
              }
              
              .layout-image {
                max-width: none;
                max-height: none;
                width: 100%;
                height: 100%;
              }
            }
            
            @media screen {
              .page-1 {
                border-bottom: 2px dashed #ccc;
                margin-bottom: 20px;
              }
              
              .page-2 {
                margin-top: 20px;
              }
            }
          </style>
        </head>
        <body>
          <!-- Page 1: Front/Back Layout -->
            <div class="page-1">
              <div class="fold-instructions">
              📄 Page 1: Front/Back Layout<br/>
              💡 Settings: Double-sided, flip on long edge
              </div>
            <img src="${card.frontCover}" alt="Front/Back Layout" class="layout-image" />
            </div>
            
          <!-- Page 2: Interior Layout -->
            <div class="page-2">
            <div class="fold-instructions">
              📄 Page 2: Interior Layout (rotated for proper alignment)<br/>
              🔄 This page is pre-rotated for double-sided printing
            </div>
            <img src="${card.leftPage}" alt="Interior Layout" class="layout-image" />
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Wait for images to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => {
          printWindow.close();
        };
      }, 1000);
    };
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Print-Ready Layout</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadAll}>
              <Download className="w-4 h-4 mr-1" />
              Download All
            </Button>
            <Button variant="default" size="sm" onClick={handlePrintLayout}>
              <Printer className="w-4 h-4 mr-1" />
              Print Layout
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Print Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Double-Sided Printing Instructions
          </h4>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
            <li>Print on cardstock or heavy paper (recommended: 200-300 GSM)</li>
            <li><strong>Use landscape orientation (11" x 8.5")</strong></li>
            <li><strong>Print double-sided with "flip on long edge"</strong></li>
            <li>Fold in half along the center line to create your card</li>
          </ol>
        </div>

        {/* Print Preview */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Print Preview</h4>
          
          {/* Page 1 Preview - Front/Back Layout */}
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Page 1 (Front side) - Front/Back Layout - Landscape 11" x 8.5"
            </div>
            <div className="aspect-[16/9] border-2 border-dashed border-gray-300 rounded relative">
              <img 
                src={card.frontCover} 
                alt="Front/Back Layout" 
                className="w-full h-full object-contain rounded"
              />
              {/* Split line indicator */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-red-400 opacity-60"></div>
              {/* Labels */}
              <div className="absolute top-2 left-2 bg-black/20 text-white px-2 py-1 rounded text-xs">
                Back (Blank)
              </div>
              <div className="absolute top-2 right-2 bg-black/20 text-white px-2 py-1 rounded text-xs">
                Front Cover
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This split image contains the blank back (left) and front cover (right)
            </p>
          </div>

          {/* Page 2 Preview - Interior Layout */}
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Page 2 (Back side) - Interior Layout - Landscape 11" x 8.5"
            </div>
            <div className="aspect-[16/9] border-2 border-dashed border-gray-300 rounded relative">
                <img 
                  src={card.leftPage} 
                alt="Interior Layout" 
                className="w-full h-full object-contain rounded"
                />
              {/* Split line indicator */}
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-red-400 opacity-60"></div>
              {/* Labels */}
              <div className="absolute top-2 left-2 bg-black/20 text-white px-2 py-1 rounded text-xs">
                Decorative Art
              </div>
              <div className="absolute top-2 right-2 bg-black/20 text-white px-2 py-1 rounded text-xs">
                Message
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This split image contains decorative artwork (left) and handwritten message (right)
            </p>
          </div>
        </div>

        {/* Folding Guide */}
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
            How to Fold Your Card
          </h4>
          <div className="text-sm text-green-800 dark:text-green-200 space-y-1">
            <p><strong>Step 1:</strong> Print both layout images double-sided (flip on long edge)</p>
            <p><strong>Step 2:</strong> Fold the paper in half along the center vertical line (red line shown above)</p>
            <p><strong>Step 3:</strong> The front cover (right half of Page 1) will be on the outside</p>
            <p><strong>Step 4:</strong> When opened, you'll see decorative art (left) and your message (right)</p>
          </div>
        </div>

        {/* Visual Folding Guide */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">
            📐 New 2-Image Layout System
          </h4>
          <div className="text-sm text-yellow-800 dark:text-yellow-200 space-y-1">
            <p><strong>Page 1 (Front/Back Layout):</strong> [Blank Back | Front Cover] - Split image</p>
            <p><strong>Page 2 (Interior Layout):</strong> [Decorative Art | Message] - Split image</p>
            <p><strong>After folding:</strong> Perfect alignment with no visual inconsistencies!</p>
            <p><strong>Advantage:</strong> Both halves of each split image align perfectly when folded</p>
          </div>
        </div>

        {/* Paper Specifications */}
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
          <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
            📄 Paper Specifications
          </h4>
          <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
            <li>• <strong>Paper Type:</strong> Cardstock or heavy paper (200-300 GSM)</li>
            <li>• <strong>Size:</strong> 11" x 8.5" (Landscape orientation)</li>
            <li>• <strong>Print Setting:</strong> Double-sided, flip on long edge</li>
            <li>• <strong>Final Card Size:</strong> 5.5" x 4.25" when folded</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 