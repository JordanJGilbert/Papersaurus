import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Paintbrush, Eraser, RotateCcw, Download, Upload, Wand2, X, Undo2, Redo2 } from 'lucide-react';
import { toast } from 'sonner';

interface PaintMaskEditorProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onMaskComplete: (maskDataUrl: string) => void;
  title?: string;
  description?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  brushSize: number;
  isEraser: boolean;
}

export default function PaintMaskEditor({
  isOpen,
  onClose,
  imageUrl,
  onMaskComplete,
  title = "Paint Mask Editor",
  description = "Paint the areas you want to edit. White areas will be edited, black areas will remain unchanged."
}: PaintMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);

  // Save state for undo/redo
  const saveState = useCallback(() => {
    setUndoStack(prev => [...prev, [...strokes]]);
    setRedoStack([]); // Clear redo stack when new action is performed
    // Limit undo stack size
    if (undoStack.length > 20) {
      setUndoStack(prev => prev.slice(1));
    }
  }, [strokes, undoStack.length]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setRedoStack(prev => [strokes, ...prev]);
      setStrokes(previousState);
      setUndoStack(prev => prev.slice(0, -1));
    }
  }, [undoStack, strokes]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextState = redoStack[0];
      setUndoStack(prev => [...prev, strokes]);
      setStrokes(nextState);
      setRedoStack(prev => prev.slice(1));
    }
  }, [redoStack, strokes]);

  // Initialize canvas when image loads
  useEffect(() => {
    if (!imageUrl || !isOpen) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Store the loaded image
      setLoadedImage(img);
      
      // Calculate canvas size to fit the image while maintaining aspect ratio
      const maxWidth = 800;
      const maxHeight = 600;
      const aspectRatio = img.width / img.height;
      
      let canvasWidth, canvasHeight;
      if (aspectRatio > maxWidth / maxHeight) {
        canvasWidth = Math.min(maxWidth, img.width);
        canvasHeight = canvasWidth / aspectRatio;
      } else {
        canvasHeight = Math.min(maxHeight, img.height);
        canvasWidth = canvasHeight * aspectRatio;
      }
      
      setCanvasSize({ width: canvasWidth, height: canvasHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      toast.error('Failed to load image for masking');
      setImageLoaded(false);
    };
    img.src = imageUrl;
  }, [imageUrl, isOpen]);

  // Redraw canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background image
    ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);
    
    // Create overlay for mask visualization
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; // Semi-transparent white overlay
    
    // Draw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (stroke.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      }
      
      ctx.stroke();
    });
    
    // Draw current stroke
    if (currentStroke.length > 1) {
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      }
      
      ctx.stroke();
    }
    
    ctx.restore();
  }, [strokes, currentStroke, brushSize, tool, imageLoaded, loadedImage]);

  // Redraw when strokes change
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Get mouse/touch position relative to canvas
  const getEventPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  }, []);

  // Mouse/touch event handlers
  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getEventPos(e);
    setIsDrawing(true);
    setCurrentStroke([pos]);
    saveState();
  }, [getEventPos, saveState]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getEventPos(e);
    setCurrentStroke(prev => [...prev, pos]);
  }, [isDrawing, getEventPos]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentStroke.length > 0) {
      setStrokes(prev => [...prev, {
        points: currentStroke,
        brushSize,
        isEraser: tool === 'eraser'
      }]);
    }
    setCurrentStroke([]);
  }, [isDrawing, currentStroke, brushSize, tool]);

  // Generate mask and call completion handler
  const handleGenerateMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) {
      toast.error('Canvas not ready');
      return;
    }

    // Create a new canvas for the mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = loadedImage.width; // Use original image dimensions
    maskCanvas.height = loadedImage.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) {
      toast.error('Failed to create mask');
      return;
    }

    // Fill with black (areas not to edit)
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Scale factor for converting canvas coordinates to original image coordinates
    const scaleX = loadedImage.width / canvas.width;
    const scaleY = loadedImage.height / canvas.height;

    // Draw white areas (areas to edit)
    maskCtx.fillStyle = 'white';
    maskCtx.strokeStyle = 'white';
    
    strokes.forEach(stroke => {
      if (stroke.points.length < 2 || stroke.isEraser) return;
      
      maskCtx.beginPath();
      maskCtx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
      
      for (let i = 1; i < stroke.points.length; i++) {
        maskCtx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
      }
      
      maskCtx.lineWidth = stroke.brushSize * Math.max(scaleX, scaleY);
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      maskCtx.stroke();
    });

    // Convert to data URL
    const maskDataUrl = maskCanvas.toDataURL('image/png');
    onMaskComplete(maskDataUrl);
    onClose();
    toast.success('Mask created successfully!');
  }, [strokes, onMaskComplete, onClose, loadedImage]);

  // Clear all strokes
  const handleClear = useCallback(() => {
    saveState();
    setStrokes([]);
    setCurrentStroke([]);
  }, [saveState]);

  // Download mask for inspection
  const handleDownloadMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) return;

    // Create mask canvas (same logic as handleGenerateMask)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = loadedImage.width;
    maskCanvas.height = loadedImage.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const scaleX = loadedImage.width / canvas.width;
    const scaleY = loadedImage.height / canvas.height;

    maskCtx.fillStyle = 'white';
    maskCtx.strokeStyle = 'white';
    
    strokes.forEach(stroke => {
      if (stroke.points.length < 2 || stroke.isEraser) return;
      
      maskCtx.beginPath();
      maskCtx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
      
      for (let i = 1; i < stroke.points.length; i++) {
        maskCtx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
      }
      
      maskCtx.lineWidth = stroke.brushSize * Math.max(scaleX, scaleY);
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      maskCtx.stroke();
    });

    // Download
    const link = document.createElement('a');
    link.download = 'mask.png';
    link.href = maskCanvas.toDataURL('image/png');
    link.click();
  }, [strokes, loadedImage]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paintbrush className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-4">
              {/* Tool Selection */}
              <div className="flex items-center space-x-2">
                <Button
                  variant={tool === 'brush' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('brush')}
                  className="gap-2"
                >
                  <Paintbrush className="w-4 h-4" />
                  Paint
                </Button>
                <Button
                  variant={tool === 'eraser' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTool('eraser')}
                  className="gap-2"
                >
                  <Eraser className="w-4 h-4" />
                  Erase
                </Button>
              </div>

              <Separator orientation="vertical" className="h-8" />

              {/* Brush Size */}
              <div className="flex items-center space-x-3">
                <label className="text-sm font-medium">Size:</label>
                <div className="flex items-center space-x-2">
                  <Slider
                    value={[brushSize]}
                    onValueChange={(value) => setBrushSize(value[0])}
                    max={100}
                    min={5}
                    step={1}
                    className="w-24"
                  />
                  <Badge variant="secondary" className="min-w-[3rem] text-center">
                    {brushSize}px
                  </Badge>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className="gap-2"
              >
                <Undo2 className="w-4 h-4" />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="gap-2"
              >
                <Redo2 className="w-4 h-4" />
                Redo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadMask}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download Mask
              </Button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex justify-center bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
            {imageLoaded ? (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  className="border border-gray-300 dark:border-gray-600 rounded cursor-crosshair"
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                  style={{ touchAction: 'none' }}
                />
                
                {/* Cursor Preview */}
                <div 
                  className="absolute pointer-events-none border-2 border-white rounded-full shadow-lg"
                  style={{
                    width: `${brushSize}px`,
                    height: `${brushSize}px`,
                    backgroundColor: tool === 'brush' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 0, 0, 0.3)',
                    transform: 'translate(-50%, -50%)',
                    display: isDrawing ? 'none' : 'block'
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                Loading image...
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Instructions:</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• <strong>Paint (white areas):</strong> These areas will be edited by AI</li>
              <li>• <strong>Unpainted (black areas):</strong> These areas will remain unchanged</li>
              <li>• Use the eraser tool to remove painted areas</li>
              <li>• Adjust brush size for precise or broad selections</li>
              <li>• You can undo/redo your actions</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateMask}
              disabled={strokes.length === 0}
              className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
            >
              <Wand2 className="w-4 h-4" />
              Create Mask & Edit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 