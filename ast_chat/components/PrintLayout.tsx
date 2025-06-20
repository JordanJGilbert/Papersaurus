import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, Info } from "lucide-react";

interface GeneratedCard {
  id: string;
  prompt: string; // Overall theme prompt
  frontCoverImageUrl: string;
  interiorLeftImageUrl: string;
  interiorRightImageUrl: string;
  createdAt: Date;
}

interface PrintLayoutProps {
  card: GeneratedCard;
}

export default function PrintLayout({ card }: PrintLayoutProps) {
  const handleDownloadAll = () => {
    const images = [
      { url: card.frontCoverImageUrl, name: `card-panel-front-cover-${card.id}.png` },
      { url: card.interiorLeftImageUrl, name: `card-panel-interior-left-${card.id}.png` },
      { url: card.interiorRightImageUrl, name: `card-panel-interior-right-${card.id}.png` },
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
      }, index * 300); // Stagger downloads slightly
    });
  };

  // The actual print function is now in page.tsx, this button could trigger that
  // For simplicity in this component, we'll just log or disable it if direct print from here is removed.
  const triggerExternalPrint = () => {
    // This function would ideally call the handlePrint from page.tsx
    // or be disabled if page.tsx's print button is the sole print trigger.
    console.log("Print initiated from PrintLayout - ideally triggers page.tsx's handlePrint");
    // If a global event bus or context API is used, it could trigger it.
    // For now, let page.tsx handle its own print button.
    alert("Please use the main 'Print' button on the 'Preview' tab for actual printing.")
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Print-Ready Layout Guide (3 Panels)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadAll}>
              <Download className="w-4 h-4 mr-1" />
              Download 3 Panels
            </Button>
            {/* The main print button is on the page.tsx, this can be a guide or disabled */}
            <Button variant="secondary" size="sm" onClick={triggerExternalPrint} title="Use main Print button in Preview tab">
              <Printer className="w-4 h-4 mr-1" />
              Show Print Steps
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Double-Sided Printing Instructions (3-Panel Method)
          </h4>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
            <li>You have 3 separate panel images: Front Cover, Interior Left (Art), and Interior Right (Message).</li>
            <li><strong>Page 1 (Front/Back Layout):</strong> The LEFT half of this page will be BLANK (this becomes the back of your card). The RIGHT half will be your Front Cover Panel.</li>
            <li><strong>Page 2 (Interior Layout):</strong> The LEFT half of this page will be your Interior Left (Art) Panel. The RIGHT half will be your Interior Right (Message) Panel.</li>
            <li>Print on cardstock (e.g., 11" x 8.5" or A4 landscape).</li>
            <li>Select "Print double-sided" and "Flip on long edge".</li>
            <li>After printing, fold the cardstock in half along the vertical center.</li>
          </ol>
        </div>

        {/* Print Preview Section */}
        <div className="space-y-6">
          <h4 className="font-medium text-gray-900 dark:text-white text-center">Visual Guide: How Panels Map to Print Pages</h4>
          
          {/* Page 1 Preview - Front/Back Layout */}
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              📄 Page 1 (Printed First - Landscape)
            </div>
            <div className="aspect-[16/9] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded flex overflow-hidden bg-gray-50 dark:bg-gray-700/30">
              {/* Left Half - Blank */}
              <div className="w-1/2 bg-white flex items-center justify-center border-r border-dashed border-gray-400 dark:border-gray-600">
                <div className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1 rounded text-sm">
                  Back of Card (Blank)
                </div>
              </div>
              {/* Right Half - Front Cover Panel */}
              <div className="w-1/2 relative flex items-center justify-center p-1">
                <img 
                  src={card.frontCoverImageUrl} 
                  alt="Front Cover Panel"
                  className="max-w-full max-h-full object-contain block rounded shadow-sm"
                />
                <Badge variant="outline" className="absolute top-2 right-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm">Front Cover Panel</Badge>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Layout for Page 1: Left half is blank, Right half is the Front Cover image.
            </p>
          </div>

          {/* Page 2 Preview - Interior Layout */}
          <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              📄 Page 2 (Printed on Reverse - Landscape, Flipped)
            </div>
            <div className="aspect-[16/9] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded flex overflow-hidden bg-gray-50 dark:bg-gray-700/30">
              {/* Left Half - Interior Left Panel */}
              <div className="w-1/2 relative flex items-center justify-center p-1 border-r border-dashed border-gray-400 dark:border-gray-600">
                <img 
                  src={card.interiorLeftImageUrl} 
                  alt="Interior Left Panel (Decorative Art)"
                  className="max-w-full max-h-full object-contain block rounded shadow-sm"
                />
                <Badge variant="outline" className="absolute top-2 left-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm">Interior Left Panel (Art)</Badge>
              </div>
              {/* Right Half - Interior Right Panel */}
              <div className="w-1/2 relative flex items-center justify-center p-1">
                <img 
                  src={card.interiorRightImageUrl} 
                  alt="Interior Right Panel (Message)"
                  className="max-w-full max-h-full object-contain block rounded shadow-sm"
                />
                <Badge variant="outline" className="absolute top-2 right-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm">Interior Right Panel (Message)</Badge>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Layout for Page 2: Left half is the Decorative Art panel, Right half is the Message panel.
            </p>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
            Assembly Guide
          </h4>
          <ul className="text-sm text-green-800 dark:text-green-200 space-y-1 list-disc list-inside">
            <li>After printing both pages double-sided (flip on long edge), you will have one sheet of cardstock.</li>
            <li>Fold this sheet vertically down the middle.</li>
            <li>The "Front Cover Panel" will be on the outside front.</li>
            <li>The "Back of Card (Blank)" area will be on the outside back.</li>
            <li>Opening the card will reveal the "Interior Left Panel (Art)" on the left and the "Interior Right Panel (Message)" on the right.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 