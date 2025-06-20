import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Maximize2, X, Edit3, Wand2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

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
  onCardUpdate?: (updatedCard: GeneratedCard) => void;
}

interface SplitImages {
  backCover: string | null;
  frontCover: string | null;
  decorativeArt: string | null;
  message: string | null;
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.8,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.8,
  }),
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

// Utility function to split images using Canvas
const splitImage = (imageUrl: string, side: 'left' | 'right'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // Original image is 16:9, we want to split it in half
      // Each half will be 8:9 aspect ratio (half the width, same height)
      const originalWidth = img.width;
      const originalHeight = img.height;
      const halfWidth = originalWidth / 2;
      
      // Set canvas size to half width, same height
      canvas.width = halfWidth;
      canvas.height = originalHeight;
      
      // Draw the appropriate half
      if (side === 'left') {
        // Draw left half: source (0, 0, halfWidth, height) to canvas (0, 0, halfWidth, height)
        ctx.drawImage(img, 0, 0, halfWidth, originalHeight, 0, 0, halfWidth, originalHeight);
      } else {
        // Draw right half: source (halfWidth, 0, halfWidth, height) to canvas (0, 0, halfWidth, height)
        ctx.drawImage(img, halfWidth, 0, halfWidth, originalHeight, 0, 0, halfWidth, originalHeight);
      }
      
      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
};

// Custom hook to handle image splitting
const useSplitImages = (card: GeneratedCard): [SplitImages, boolean] => {
  const [splitImages, setSplitImages] = useState<SplitImages>({
    backCover: null,
    frontCover: null,
    decorativeArt: null,
    message: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const splitAllImages = async () => {
      try {
        setIsLoading(true);
        
        // Split Layout 1 (frontCover image) into back and front
        const [backCover, frontCover] = await Promise.all([
          splitImage(card.frontCover, 'left'),   // Back is left half
          splitImage(card.frontCover, 'right'),  // Front is right half
        ]);
        
        // Split Layout 2 (leftPage image) into decorative art and message
        const [decorativeArt, message] = await Promise.all([
          splitImage(card.leftPage, 'left'),     // Decorative art is left half
          splitImage(card.leftPage, 'right'),    // Message is right half
        ]);
        
        setSplitImages({
          backCover,
          frontCover,
          decorativeArt,
          message,
        });
      } catch (error) {
        console.error('Error splitting images:', error);
        // Fallback to original images with CSS cropping if splitting fails
        setSplitImages({
          backCover: card.frontCover,
          frontCover: card.frontCover,
          decorativeArt: card.leftPage,
          message: card.leftPage,
        });
      } finally {
        setIsLoading(false);
      }
    };

    splitAllImages();
  }, [card.frontCover, card.leftPage]);

  return [splitImages, isLoading];
};

export default function CardPreview({ card, onCardUpdate }: CardPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Edit state
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState("gpt-image-1");
  const [isEditing, setIsEditing] = useState(false);
  const [editedImages, setEditedImages] = useState<Record<string, string>>({});
  
  // Use the custom hook to get split images
  const [splitImages, isLoadingSplits] = useSplitImages(card);

  // Helper function to get the current image (edited version if available, otherwise original)
  const getCurrentImage = (sectionId: string, originalImage: string | null) => {
    return editedImages[sectionId] || originalImage;
  };

  // Helper function to get the source image URL for editing
  const getSourceImageForEdit = (sectionId: string) => {
    switch (sectionId) {
      case "front-cover":
        return card.frontCover; // We'll edit the full frontCover and extract the right half
      case "back-cover":
        return card.frontCover; // We'll edit the full frontCover and extract the left half
      case "interior":
        return card.leftPage; // Edit the full interior image
      default:
        return null;
    }
  };

  const slides = [
    {
      id: "front-cover",
      title: "Front Cover",
      subtitle: "What recipients see first",
      image: getCurrentImage("front-cover", splitImages.frontCover),
      originalImage: card.frontCover,
      description: "The front cover design that recipients will see first.",
      color: "bg-blue-500",
      type: "single" as const,
      editLabel: "Edit Front Cover",
    },
    {
      id: "interior",
      title: "Interior Pages",
      subtitle: "Left and right pages when opened",
      image: getCurrentImage("interior", card.leftPage),
      originalImage: card.leftPage,
      description: "The interior of your card showing decorative art on the left and your personalized message on the right, just as it will appear when opened.",
      color: "bg-emerald-500",
      type: "single" as const,
      editLabel: "Edit Interior",
    },
    {
      id: "back-cover",
      title: "Back Cover",
      subtitle: "What's on the back",
      image: getCurrentImage("back-cover", splitImages.backCover),
      originalImage: card.frontCover,
      description: "The back of the card (typically blank or with subtle design).",
      color: "bg-gray-500",
      type: "single" as const,
      editLabel: "Edit Back Cover",
    },
  ];

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setCurrentSlide((prev) => {
      if (newDirection === 1) {
        return prev === slides.length - 1 ? 0 : prev + 1;
      } else {
        return prev === 0 ? slides.length - 1 : prev - 1;
      }
    });
  };

  const goToSlide = (index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  };

  const toggleAutoPlay = () => {
    if (isAutoPlay) {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        setAutoPlayInterval(null);
      }
      setIsAutoPlay(false);
    } else {
      const interval = setInterval(() => {
        paginate(1);
      }, 3000);
      setAutoPlayInterval(interval);
      setIsAutoPlay(true);
    }
  };

  useEffect(() => {
    return () => {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
      }
    };
  }, [autoPlayInterval]);

  // Handle fullscreen mode
  const openFullscreen = () => {
    setIsFullscreen(true);
    // Disable body scroll when fullscreen is open
    document.body.style.overflow = 'hidden';
  };

  const closeFullscreen = () => {
    setIsFullscreen(false);
    // Re-enable body scroll
    document.body.style.overflow = 'unset';
  };

  // Handle escape key to close fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        closeFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isFullscreen]);

  // Edit functionality
  const handleEditSection = (sectionId: string) => {
    setEditingSection(sectionId);
    setEditPrompt("");
    setEditModel("gpt-image-1");
  };

  const handleSubmitEdit = async () => {
    if (!editingSection || !editPrompt.trim()) {
      toast.error("Please enter an edit prompt");
      return;
    }

    const sourceImageUrl = getSourceImageForEdit(editingSection);
    if (!sourceImageUrl) {
      toast.error("Could not find source image for editing");
      return;
    }

    setIsEditing(true);

    try {
      // Call the edit_images tool
      const response = await fetch('/internal/call_mcp_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'edit_images',
          arguments: {
            images: [sourceImageUrl],
            edit_prompt: editPrompt,
            user_number: "+17145986105",
            model: editModel,
            output_format: "png",
            quality: "high",
            n: 1
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.error && data.error !== "None" && data.error !== null) {
        throw new Error(data.error);
      }

      let result;
      if (typeof data.result === 'string') {
        try {
          result = JSON.parse(data.result);
        } catch {
          throw new Error('Invalid JSON response');
        }
      } else {
        result = data.result;
      }

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      // Extract the edited image URL
      const editResult = result.results[0];
      if (editResult.status === 'error') {
        throw new Error(editResult.message);
      }

      const editedImageUrl = editResult.edited_url;
      if (!editedImageUrl) {
        throw new Error('No edited image URL returned');
      }

      // For front-cover and back-cover, we need to split the edited image
      if (editingSection === "front-cover" || editingSection === "back-cover") {
        try {
          const side = editingSection === "front-cover" ? "right" : "left";
          const splitEditedImage = await splitImage(editedImageUrl, side);
          
          // Update the edited images state
          setEditedImages(prev => ({
            ...prev,
            [editingSection]: splitEditedImage
          }));

          // Update the card object if callback provided
          if (onCardUpdate) {
            const updatedCard = { ...card };
            updatedCard.frontCover = editedImageUrl; // Update the source image
            onCardUpdate(updatedCard);
          }
        } catch (error) {
          console.error('Error splitting edited image:', error);
          // Fallback: use the full edited image
          setEditedImages(prev => ({
            ...prev,
            [editingSection]: editedImageUrl
          }));
        }
      } else {
        // For interior, use the full edited image
        setEditedImages(prev => ({
          ...prev,
          [editingSection]: editedImageUrl
        }));

        // Update the card object if callback provided
        if (onCardUpdate) {
          const updatedCard = { ...card };
          updatedCard.leftPage = editedImageUrl;
          onCardUpdate(updatedCard);
        }
      }

      toast.success(`✨ ${slides.find(s => s.id === editingSection)?.title} edited successfully!`);
      setEditingSection(null);
      setEditPrompt("");

    } catch (error) {
      console.error('Edit failed:', error);
      toast.error(`Failed to edit image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsEditing(false);
    }
  };

  const resetSection = (sectionId: string) => {
    setEditedImages(prev => {
      const newState = { ...prev };
      delete newState[sectionId];
      return newState;
    });
    toast.success("Reset to original image");
  };

  // Show loading state while images are being split
  if (isLoadingSplits) {
  return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-bold mb-2">Card Preview</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Preparing your card sections...
          </p>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 shadow-xl">
          <div className="h-80 md:h-96 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Splitting images into sections...
              </p>
            </div>
                        </div>
                  </div>
                </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        className="text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h3 className="text-xl font-bold mb-2">Card Preview</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Swipe through your card: front cover, interior pages, and back cover
        </p>
      </motion.div>

      {/* Main Carousel Container */}
      <motion.div 
        className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 overflow-hidden shadow-xl"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Slide Counter & Auto-play Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {slides.map((_, index) => (
              <motion.button
                key={index}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentSlide 
                    ? 'bg-blue-500 scale-125' 
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                }`}
                onClick={() => goToSlide(index)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
              />
            ))}
                </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {currentSlide + 1} / {slides.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAutoPlay}
              className="h-8 w-8 p-0"
            >
              {isAutoPlay ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentSlide(0)}
              className="h-8 w-8 p-0"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={openFullscreen}
              className="h-8 w-8 p-0"
              title="View in fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Carousel */}
        <div className="relative h-80 md:h-96 overflow-hidden rounded-xl">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(e, { offset, velocity }) => {
                const swipe = swipePower(offset.x, velocity.x);

                if (swipe < -swipeConfidenceThreshold) {
                  paginate(1);
                } else if (swipe > swipeConfidenceThreshold) {
                  paginate(-1);
                }
              }}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
            >
              <div className="h-full flex flex-col">
                {/* Slide Header */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Badge className={`${slides[currentSlide].color} text-white w-full justify-center py-2 mb-4 text-sm font-medium`}>
                    {slides[currentSlide].title} ({slides[currentSlide].subtitle})
                  </Badge>
                </motion.div>

                {/* Image Container - Shows single images with edit overlay */}
                <motion.div 
                  className="flex-1 relative border-2 border-white/20 rounded-lg overflow-hidden shadow-2xl bg-white group"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                >
                  {slides[currentSlide].image ? (
                    <>
                      <img
                        src={slides[currentSlide].image}
                        alt={slides[currentSlide].title}
                        className="w-full h-full object-contain bg-white"
                        draggable={false}
                      />
                      
                      {/* Edit Overlay - Mobile: Always visible, Desktop: Hover */}
                      <div className="absolute inset-0 bg-black/0 md:group-hover:bg-black/20 transition-all duration-300">
                        {/* Mobile Edit Button - Always visible */}
                        <button
                          onClick={() => handleEditSection(slides[currentSlide].id)}
                          className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition-all duration-200 md:opacity-0 md:group-hover:opacity-100"
                          title={slides[currentSlide].editLabel}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        
                        {/* Desktop Edit Button - Hover only */}
                        <div className="hidden md:flex absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button
                            onClick={() => handleEditSection(slides[currentSlide].id)}
                            className="bg-white/95 hover:bg-white text-gray-700 px-4 py-2 rounded-lg shadow-lg font-medium transition-all duration-200 flex items-center gap-2"
                          >
                            <Wand2 className="w-4 h-4" />
                            {slides[currentSlide].editLabel}
                          </button>
                        </div>
                        
                        {/* Reset Button - Show only if edited */}
                        {editedImages[slides[currentSlide].id] && (
                          <button
                            onClick={() => resetSection(slides[currentSlide].id)}
                            className="absolute top-3 left-3 bg-amber-500/90 hover:bg-amber-500 text-white rounded-full p-2 shadow-lg transition-all duration-200 md:opacity-0 md:group-hover:opacity-100"
                            title="Reset to original"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        
                        {/* Edited Indicator */}
                        {editedImages[slides[currentSlide].id] && (
                          <div className="absolute bottom-3 left-3 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <Wand2 className="w-3 h-3" />
                            Edited
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                      <p className="text-gray-500 dark:text-gray-400">Loading section...</p>
                    </div>
                  )}
                </motion.div>

                {/* Description */}
                <motion.p 
                  className="text-sm text-gray-600 dark:text-gray-400 text-center mt-3 px-4 leading-relaxed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {slides[currentSlide].description}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Arrows */}
        <motion.button
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors z-10"
          onClick={() => paginate(-1)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft className="w-5 h-5" />
        </motion.button>
        
        <motion.button
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors z-10"
          onClick={() => paginate(1)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronRight className="w-5 h-5" />
        </motion.button>
      </motion.div>

      {/* Quick Navigation Cards */}
      <motion.div 
        className="grid grid-cols-3 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {slides.map((slide, index) => (
          <motion.button
            key={slide.id}
            onClick={() => goToSlide(index)}
            className={`p-3 rounded-lg border-2 transition-all duration-300 text-left ${
              index === currentSlide
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className={`w-3 h-3 rounded-full mb-2 ${slide.color}`}></div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {slide.title}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {slide.subtitle}
            </p>
          </motion.button>
        ))}
      </motion.div>

      {/* Printing Instructions */}
      <motion.div 
        className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <h4 className="font-bold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
          <span className="text-lg">📄</span>
          Printing Instructions
        </h4>
        <ol className="text-sm text-amber-800 dark:text-amber-200 space-y-2 pl-4 list-decimal">
          <li>Print Layout 1 (Front/Back) on one side of cardstock.</li>
          <li>Print Layout 2 (Interior) on the reverse side, ensuring proper alignment (flip on long edge for most printers).</li>
          <li>Fold along the center line.</li>
          <li>Enjoy your perfect greeting card!</li>
        </ol>
      </motion.div>

      {/* Card Details */}
      <motion.div 
        className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <h4 className="font-medium mb-2 text-sm text-gray-900 dark:text-gray-100">Original Prompt:</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">
          "{card.prompt}"
        </p>
      </motion.div>

      {/* Fullscreen Slideshow Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm"
            onClick={closeFullscreen}
          >
            <div className="h-full flex flex-col">
              {/* Fullscreen Header */}
              <div className="flex items-center justify-between p-4 md:p-6">
                <div className="flex items-center gap-4">
                  <Badge className={`${slides[currentSlide].color} text-white px-4 py-2`}>
                    {slides[currentSlide].title}
                  </Badge>
                  <span className="text-white/80 text-sm hidden md:block">
                    {slides[currentSlide].subtitle}
                  </span>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-white/80 text-sm">
                    {currentSlide + 1} / {slides.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAutoPlay();
                    }}
                    className="h-9 w-9 p-0 text-white hover:bg-white/10"
                  >
                    {isAutoPlay ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFullscreen();
                    }}
                    className="h-9 w-9 p-0 text-white hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Fullscreen Image Container */}
              <div className="flex-1 relative px-4 md:px-6 pb-6">
                <div className="h-full relative">
                  <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                      key={`fullscreen-${currentSlide}`}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        x: { type: "spring", stiffness: 300, damping: 30 },
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.2 },
                      }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={1}
                      onDragEnd={(e, { offset, velocity }) => {
                        const swipe = swipePower(offset.x, velocity.x);
                        if (swipe < -swipeConfidenceThreshold) {
                          paginate(1);
                        } else if (swipe > swipeConfidenceThreshold) {
                          paginate(-1);
                        }
                      }}
                      className="absolute inset-0 cursor-grab active:cursor-grabbing"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="h-full flex items-center justify-center">
                        {slides[currentSlide].image ? (
                          <img
                            src={slides[currentSlide].image}
                            alt={slides[currentSlide].title}
                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex items-center justify-center bg-gray-800 rounded-lg p-8">
                            <p className="text-white/70">Loading section...</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Fullscreen Navigation Arrows */}
                  <motion.button
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-sm rounded-full p-3 text-white hover:bg-black/70 transition-colors z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      paginate(-1);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </motion.button>
                  
                  <motion.button
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-sm rounded-full p-3 text-white hover:bg-black/70 transition-colors z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      paginate(1);
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <ChevronRight className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>

              {/* Fullscreen Slide Indicators */}
              <div className="flex items-center justify-center gap-3 pb-6">
                {slides.map((slide, index) => (
                  <motion.button
                    key={`fullscreen-indicator-${slide.id}`}
                    className={`transition-all duration-300 ${
                      index === currentSlide 
                        ? 'w-8 h-3 bg-white rounded-full' 
                        : 'w-3 h-3 bg-white/40 rounded-full hover:bg-white/60'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToSlide(index);
                    }}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                  />
                ))}
              </div>

              {/* Fullscreen Description */}
              <div className="px-6 pb-6">
                <motion.p 
                  className="text-white/80 text-center text-sm md:text-base leading-relaxed max-w-2xl mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  {slides[currentSlide].description}
                </motion.p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <Dialog open={!!editingSection} onOpenChange={(open) => !open && setEditingSection(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-blue-600" />
              {editingSection ? slides.find(s => s.id === editingSection)?.editLabel : "Edit Section"}
            </DialogTitle>
            <DialogDescription>
              Describe how you'd like to modify this section of your card. Be specific about colors, style, content, or any changes you want to make.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current Image Preview */}
            {editingSection && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current Image
                </label>
                <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
                  <img
                    src={slides.find(s => s.id === editingSection)?.image || ""}
                    alt="Current section"
                    className="w-full h-32 object-contain"
                  />
                </div>
              </div>
            )}

            {/* Edit Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Edit Instructions
              </label>
              <Textarea
                placeholder="e.g., Change the background to a sunset sky, make the flowers more colorful, add sparkles, change the text style to handwritten..."
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={4}
                className="resize-none"
                style={{ fontSize: '16px' }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Be specific about what you want to change. The AI will modify only what you describe while keeping the rest intact.
              </p>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Edit Model
              </label>
              <Select value={editModel} onValueChange={setEditModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-image-1">
                    <div>
                      <div className="font-medium">GPT Image 1</div>
                      <div className="text-xs text-muted-foreground">Best for precise edits</div>
                    </div>
                  </SelectItem>
                  <SelectItem value="gemini">
                    <div>
                      <div className="font-medium">Gemini</div>
                      <div className="text-xs text-muted-foreground">Good for creative changes</div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setEditingSection(null)}
                variant="outline"
                className="flex-1"
                disabled={isEditing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim() || isEditing}
                className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Editing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Apply Edit
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 