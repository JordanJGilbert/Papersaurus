import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Maximize2, X, Edit3, Wand2, Loader2, Printer, CheckCircle, AlertCircle, Share2, Mail, Copy, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ProgressiveImage from "./ProgressiveImage";
import { generateSizesAttribute, preloadCriticalImages, generateMultipleThumbnails } from "../utils/imageUtils";

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

interface GeneratedCard {
  id: string;
  prompt: string;
  frontCover: string;      // Portrait image - what recipients see first
  backCover: string;       // Portrait image - back of the card
  leftPage: string;        // Portrait image - left interior (decorative art)
  rightPage: string;       // Portrait image - right interior (message area)
  createdAt: Date;
  shareUrl?: string;       // Optional shareable URL for the card
  // Store the actual prompts sent to image generation
  generatedPrompts?: {
    frontCover?: string;
    backCover?: string;
    leftInterior?: string;
    rightInterior?: string;
  };
  // Thumbnail URLs for faster loading
  thumbnails?: {
    frontCover?: string;
    backCover?: string;
    leftPage?: string;
    rightPage?: string;
  };
}

interface PaperConfig {
  id: string;
  label: string;
  description: string;
  aspectRatio: string;
  dimensions: string;
  printWidth: string;
  printHeight: string;
}

interface CardPreviewProps {
  card: GeneratedCard;
  onCardUpdate?: (updatedCard: GeneratedCard) => void;
  isFrontBackOnly?: boolean;
  onPrint?: () => void;
  paperConfig?: PaperConfig;
  sectionLoadingStates?: {
    frontCover: 'idle' | 'loading' | 'completed' | 'error';
    backCover: 'idle' | 'loading' | 'completed' | 'error';
    leftInterior: 'idle' | 'loading' | 'completed' | 'error';
    rightInterior: 'idle' | 'loading' | 'completed' | 'error';
  };
  // Paper size control props
  selectedPaperSize?: string;
  onPaperSizeChange?: (paperSize: string) => void;
  paperSizes?: PaperConfig[];
  isCardCompleted?: boolean;
  // Fast preview mode - show only front cover for quick loading
  fastPreviewMode?: boolean;
  onViewFullCard?: () => void;
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

export default function CardPreview({ 
  card, 
  onCardUpdate, 
  isFrontBackOnly = false, 
  onPrint, 
  paperConfig, 
  sectionLoadingStates,
  selectedPaperSize,
  onPaperSizeChange,
  paperSizes,
  isCardCompleted,
  fastPreviewMode = false,
  onViewFullCard
}: CardPreviewProps) {
  
  // Check if we're in a loading state (when card is null but we have loading states)
  const isLoadingCard = !card && sectionLoadingStates && Object.values(sectionLoadingStates).some(state => state === 'loading');
  
  // Create a placeholder card object when loading
  const displayCard = card || (isLoadingCard ? {
    id: 'loading',
    prompt: 'Loading...',
    frontCover: '', // Empty strings will show loading placeholders
    backCover: '',
    leftPage: '',
    rightPage: '',
    createdAt: new Date(),
  } : null);
  
  // Don't render anything if no card and not loading
  if (!displayCard) {
    return null;
  }
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState<NodeJS.Timeout | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Edit state
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
  
  // Version history state
  const [versionHistory, setVersionHistory] = useState<Record<string, string[]>>({});
  const [currentVersionIndex, setCurrentVersionIndex] = useState<Record<string, number>>({});
  
  // Sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // Factory state
  const [isSendingToFactory, setIsSendingToFactory] = useState(false);

  // Thumbnail generation state
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  // Generate thumbnail for an image
  const generateThumbnail = async (imageUrl: string): Promise<string | null> => {
    try {
      // Check if thumbnail already exists
      if (thumbnailUrls[imageUrl]) {
        return thumbnailUrls[imageUrl];
      }

      const response = await fetch('/generate_thumbnail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          width: 400,
          height: 600,
          quality: 85
        })
      });

      if (!response.ok) {
        console.warn('Failed to generate thumbnail:', response.statusText);
        return null;
      }

      const data = await response.json();
      const thumbnailUrl = data.thumbnail_url;
      
      // Cache the thumbnail URL
      setThumbnailUrls(prev => ({
        ...prev,
        [imageUrl]: thumbnailUrl
      }));

      return thumbnailUrl;
    } catch (error) {
      console.warn('Error generating thumbnail:', error);
      return null;
    }
  };

  // Preload critical images for better performance (no thumbnails - use full quality)
  useEffect(() => {
    if (displayCard && !isLoadingCard) {
      // Preload the front cover as it's most critical
      if (displayCard.frontCover) {
        preloadCriticalImages([displayCard.frontCover]);
      }
      
      // Preload other images for better UX
      const otherImages = [
        displayCard.backCover,
        displayCard.leftPage,
        displayCard.rightPage
      ].filter(Boolean);
      
      if (otherImages.length > 0) {
        // Preload other images with a slight delay to prioritize front cover
        setTimeout(() => {
          preloadCriticalImages(otherImages);
        }, 1000);
      }
    }
  }, [displayCard, isLoadingCard]);

  // Helper function to get the current image (from version history if available, otherwise original)
  const getCurrentImage = (sectionId: string, originalImage: string) => {
    const history = versionHistory[sectionId];
    const currentIndex = currentVersionIndex[sectionId];
    
    if (history && history.length > 0 && currentIndex !== undefined) {
      return history[currentIndex];
    }
    
    return originalImage;
  };

  // Version navigation functions
  const canGoBack = (sectionId: string) => {
    const currentIndex = currentVersionIndex[sectionId];
    return currentIndex !== undefined && currentIndex > 0;
  };

  const canGoForward = (sectionId: string) => {
    const history = versionHistory[sectionId];
    const currentIndex = currentVersionIndex[sectionId];
    return history && currentIndex !== undefined && currentIndex < history.length - 1;
  };

  const goToPreviousVersion = (sectionId: string) => {
    if (canGoBack(sectionId)) {
      setCurrentVersionIndex(prev => ({
        ...prev,
        [sectionId]: prev[sectionId] - 1
      }));
    }
  };

  const goToNextVersion = (sectionId: string) => {
    if (canGoForward(sectionId)) {
      setCurrentVersionIndex(prev => ({
        ...prev,
        [sectionId]: prev[sectionId] + 1
      }));
    }
  };

  const addToVersionHistory = (sectionId: string, imageUrl: string) => {
    const currentHistory = versionHistory[sectionId] || [];
    const currentIndex = currentVersionIndex[sectionId] || -1;
    
    // If we're not at the latest version, truncate history from current position
    const truncatedHistory = currentHistory.slice(0, currentIndex + 1);
    const newHistory = [...truncatedHistory, imageUrl];
    
    setVersionHistory(prev => ({
      ...prev,
      [sectionId]: newHistory
    }));
    
    setCurrentVersionIndex(prev => ({
      ...prev,
      [sectionId]: newHistory.length - 1 // Points to the newly added version
    }));
  };

  // Helper function to get the source image URL for editing
  const getSourceImageForEdit = (sectionId: string) => {
    switch (sectionId) {
      case "front-cover":
        return displayCard.frontCover;
      case "back-cover":
        return displayCard.backCover;
      case "left-interior":
        return displayCard.leftPage;
      case "right-interior":
        return displayCard.rightPage;
      default:
        return null;
    }
  };

  const allSlides = [
    {
      id: "front-cover",
      title: "Front Cover",
      subtitle: "What recipients see first",
      image: getCurrentImage("front-cover", displayCard.frontCover),
      originalImage: displayCard.frontCover,
      description: "The front cover design that recipients will see first.",
      color: "bg-blue-500",
      type: "single" as const,
      editLabel: "Edit Front Cover",
    },
    {
      id: "left-interior",
      title: "Left Interior",
      subtitle: "Decorative page",
      image: getCurrentImage("left-interior", displayCard.leftPage),
      originalImage: displayCard.leftPage,
      description: "The decorative left page when the card is opened.",
      color: "bg-emerald-500",
      type: "single" as const,
      editLabel: "Edit Left Interior",
    },
    {
      id: "right-interior",
      title: "Right Interior", 
      subtitle: "Message page",
      image: getCurrentImage("right-interior", displayCard.rightPage),
      originalImage: displayCard.rightPage,
      description: "The right page with your message when the card is opened.",
      color: "bg-emerald-600",
      type: "single" as const,
      editLabel: "Edit Right Interior",
    },
    {
      id: "back-cover",
      title: "Back Cover",
      subtitle: "What's on the back",
      image: getCurrentImage("back-cover", displayCard.backCover),
      originalImage: displayCard.backCover,
      description: "The back of the card with subtle design elements.",
      color: "bg-gray-500",
      type: "single" as const,
      editLabel: "Edit Back Cover",
    },
  ];

  // Filter slides based on isFrontBackOnly prop
  const slides = isFrontBackOnly 
    ? allSlides.filter(slide => !slide.id.includes("interior"))
    : allSlides;

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
    // Don't allow editing if we're in loading mode
    if (isLoadingCard) {
      toast.error("Please wait for the card to finish generating before editing");
      return;
    }
    
    setEditingSection(sectionId);
    setEditPrompt("");
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
      // Modify the edit prompt based on section for portrait images
      let finalEditPrompt = `CRITICAL: This is a greeting card ${editingSection.replace('-', ' ')} in portrait format.

Your edit request: "${editPrompt}"

IMPORTANT INSTRUCTIONS:
- This is a portrait (vertical) image for a greeting card
- You must PRESERVE the portrait format and dimensions
- Only modify what was specifically requested in the edit
- Keep the overall layout structure intact - do not crop or cut off any sections
- Maintain the aspect ratio and size of the original image
- Ensure the edited result is suitable for printing as part of a greeting card
- Position any text elements safely away from edges with generous margins
- The image should remain focused on its specific purpose: ${editingSection.replace('-', ' ')}

Apply the requested changes while preserving the complete image structure and portrait format.`;

      // Call the edit_images tool
      const response = await fetch('/internal/call_mcp_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'edit_images',
          arguments: {
            images: [sourceImageUrl],
            edit_prompt: finalEditPrompt,
            user_number: "+17145986105",
            model: "gpt-image-1",
            output_format: "jpeg",
            quality: "auto",
            output_compression: 100,
            size: paperConfig?.dimensions || "1024x1536", // Use paper config dimensions
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

      // Add to version history
      addToVersionHistory(editingSection, editedImageUrl);

      // Update the card object if callback provided (only if not loading placeholder)
      if (onCardUpdate && !isLoadingCard) {
        const updatedCard = { ...displayCard };
        switch (editingSection) {
          case "front-cover":
            updatedCard.frontCover = editedImageUrl;
            break;
          case "back-cover":
            updatedCard.backCover = editedImageUrl;
            break;
          case "left-interior":
            updatedCard.leftPage = editedImageUrl;
            break;
          case "right-interior":
            updatedCard.rightPage = editedImageUrl;
            break;
        }
        onCardUpdate(updatedCard);
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
    setVersionHistory(prev => {
      const newState = { ...prev };
      delete newState[sectionId];
      return newState;
    });
    setCurrentVersionIndex(prev => {
      const newState = { ...prev };
      delete newState[sectionId];
      return newState;
    });
    toast.success("Reset to original image");
  };

  // Helper function to get loading state for a slide
  const getLoadingState = (slideId: string) => {
    if (!sectionLoadingStates) return 'idle';
    
    switch (slideId) {
      case 'front-cover':
        return sectionLoadingStates.frontCover;
      case 'back-cover':
        return sectionLoadingStates.backCover;
      case 'left-interior':
        return sectionLoadingStates.leftInterior;
      case 'right-interior':
        return sectionLoadingStates.rightInterior;
      case 'interior':
        // For combined interior view, show loading if either left or right is loading
        const leftState = sectionLoadingStates.leftInterior;
        const rightState = sectionLoadingStates.rightInterior;
        if (leftState === 'loading' || rightState === 'loading') return 'loading';
        if (leftState === 'error' || rightState === 'error') return 'error';
        if (leftState === 'completed' && rightState === 'completed') return 'completed';
        return 'idle';
      default:
        return 'idle';
    }
  };

  // Helper function to render loading indicator
  const renderLoadingIndicator = (state: 'idle' | 'loading' | 'completed' | 'error') => {
    switch (state) {
      case 'loading':
        return (
          <div className="absolute top-3 left-16 bg-blue-500/90 text-white rounded-full p-2 shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        );
      case 'completed':
        return (
          <div className="absolute top-3 left-16 bg-green-500/90 text-white rounded-full p-2 shadow-lg">
            <CheckCircle className="w-4 h-4" />
          </div>
        );
      case 'error':
        return (
          <div className="absolute top-3 left-16 bg-red-500/90 text-white rounded-full p-2 shadow-lg">
            <AlertCircle className="w-4 h-4" />
          </div>
        );
      default:
        return null;
    }
  };

  // Sharing functions
  const handleShareCard = async () => {
    // Don't allow sharing if we're in loading mode
    if (isLoadingCard) {
      toast.error("Please wait for the card to finish generating before sharing");
      return;
    }
    
    setIsSharing(true);
    try {
      // Check if card already has a share URL from email creation
      if (displayCard.shareUrl) {
        setShareUrl(displayCard.shareUrl);
        setShowShareDialog(true);
        toast.success("Card is ready to share!");
        setIsSharing(false);
        return;
      }

      // If no existing URL, create a new one
      const response = await fetch('/api/cards/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: displayCard.prompt,
          frontCover: displayCard.frontCover,
          backCover: displayCard.backCover,
          leftPage: displayCard.leftPage,
          rightPage: displayCard.rightPage,
          generatedPrompts: displayCard.generatedPrompts || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to store card');
      }

      const result = await response.json();
      setShareUrl(result.share_url);
      
      // Update the card with the new share URL
      if (onCardUpdate && !isLoadingCard) {
        onCardUpdate({ ...displayCard, shareUrl: result.share_url });
      }
      
      setShowShareDialog(true);
      toast.success("Card is ready to share!");
    } catch (error) {
      console.error('Error sharing card:', error);
      toast.error("Failed to prepare card for sharing");
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handleEmailCard = async () => {
    if (!emailAddress.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSendingEmail(true);
    try {
      // Use the same working email service as the thank you email
      const response = await fetch('https://16504442930.work/send_email_with_attachments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: emailAddress,
          from: 'vibecarding@ast.engineer',
          subject: '🎉 Someone shared a beautiful card with you!',
          body: `Hi there!

Someone thought you'd love to see this beautiful greeting card created with VibeCarding!

View the card: ${shareUrl}

This card was created with love using our AI-powered greeting card platform. You can create your own cards at https://vibecarding.com

Best regards,
The VibeCarding Team
vibecarding@ast.engineer`,
          html: false
        }),
      });

      if (response.ok) {
        toast.success("✉️ Card sent successfully via email!");
        setShowShareDialog(false);
        setEmailAddress(""); // Clear the email field
      } else {
        const errorText = await response.text();
        console.error('Email send failed:', response.status, errorText);
        toast.error("Failed to send email. Please try again.");
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error("Failed to send email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendToFactory = async () => {
    // Don't allow sending to factory if we're in loading mode
    if (isLoadingCard) {
      toast.error("Please wait for the card to finish generating before sending to factory");
      return;
    }
    
    setIsSendingToFactory(true);
    try {
      // Create a concatenated string of all image prompts
      const promptDetails = `
Front Cover Prompt:
${displayCard.generatedPrompts?.frontCover || 'Not available'}

Back Cover Prompt:
${displayCard.generatedPrompts?.backCover || 'Not available'}

${!isFrontBackOnly && displayCard.generatedPrompts?.leftInterior ? `Left Interior Prompt:
${displayCard.generatedPrompts.leftInterior}

` : ''}${!isFrontBackOnly && displayCard.generatedPrompts?.rightInterior ? `Right Interior Prompt:
${displayCard.generatedPrompts.rightInterior}

` : ''}`;

      const response = await fetch('https://vibecarding.com/send_email_nodejs_style', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'cards1@ast.engineer',
          from: 'vibecarding@ast.engineer',
          subject: 'New Card Request',
          body: promptDetails,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'success') {
        toast.success("🏭 Card sent to factory successfully!");
      } else {
        throw new Error(result.message || 'Failed to send to factory');
      }
    } catch (error) {
      console.error('Error sending to factory:', error);
      toast.error("Failed to send to factory. Please try again.");
    } finally {
      setIsSendingToFactory(false);
    }
  };

  // Fast preview mode - only show front cover for quick loading
  if (fastPreviewMode && displayCard.frontCover) {
    return (
      <motion.div 
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Fast Preview Header */}
        <div className="text-center">
          <h3 className="text-lg font-bold mb-1">Quick Preview</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Front cover preview - loading faster for you
          </p>
        </div>

        {/* Front Cover Preview */}
        <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 shadow-lg">
          <div className="relative aspect-[2/3] max-w-sm mx-auto">
            <div className="w-full h-full relative bg-white rounded-lg overflow-hidden shadow-xl group">
              <ProgressiveImage
                src={displayCard.frontCover}
                thumbnailSrc={undefined}
                alt="Card front cover"
                className="w-full h-full object-contain"
                priority={true}
                sizes={generateSizesAttribute()}
              />
              
              {/* Quick actions overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all duration-200 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {onViewFullCard && (
                    <Button
                      onClick={onViewFullCard}
                      className="bg-white/90 hover:bg-white text-gray-700 shadow-lg"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Full Card
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Loading state indicator */}
              {renderLoadingIndicator(getLoadingState('front-cover'))}
            </div>
          </div>
          
          {/* Fast preview description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-4">
            The front cover design that recipients will see first
          </p>
        </div>

        {/* View Full Card Button */}
        {onViewFullCard && (
          <div className="flex justify-center">
            <Button
              onClick={onViewFullCard}
              variant="outline"
              className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Complete Card
            </Button>
          </div>
        )}
      </motion.div>
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
          {isFrontBackOnly 
            ? "Swipe through your card: front cover and back cover"
            : "Swipe through your card: front cover, left interior, right interior, and back cover"
          }
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
        <div className="relative h-[60vh] sm:h-80 md:h-96 overflow-hidden rounded-xl">
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

                {/* Image Container - Shows single or double images */}
                <motion.div 
                  className="flex-1 relative border-2 border-white/20 rounded-lg overflow-hidden shadow-2xl bg-white group"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                >
                  {/* Single image layout with click-to-fullscreen */}
                  {slides[currentSlide].image ? (
                    <div 
                      className="w-full h-full relative cursor-pointer group/image"
                      onClick={openFullscreen}
                      title="Click to view fullscreen"
                    >
                      <ProgressiveImage
                        src={slides[currentSlide].image}
                        thumbnailSrc={undefined}
                        alt={slides[currentSlide].title}
                        className="w-full h-full object-contain bg-white"
                        priority={currentSlide === 0} // Only prioritize front cover
                        sizes={generateSizesAttribute()}
                      />
                      
                      {/* Fullscreen hint overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-all duration-200 flex items-center justify-center">
                        <div className="opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 bg-white/90 rounded-full p-3 shadow-lg">
                          <Maximize2 className="w-6 h-6 text-gray-700" />
                        </div>
                      </div>
                      
                      {/* Edit Buttons - Always visible */}
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Loading State Indicator */}
                        <div className="absolute top-3 left-3 pointer-events-auto">
                          {renderLoadingIndicator(getLoadingState(slides[currentSlide].id))}
                        </div>

                        {/* Edit Button - Always visible */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSection(slides[currentSlide].id);
                          }}
                          className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition-all duration-200 pointer-events-auto"
                          title={slides[currentSlide].editLabel}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        
                        {/* Reset Button - Show only if has version history */}
                        {versionHistory[slides[currentSlide].id] && versionHistory[slides[currentSlide].id].length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resetSection(slides[currentSlide].id);
                            }}
                            className="absolute top-3 left-3 bg-amber-500/90 hover:bg-amber-500 text-white rounded-full p-2 shadow-lg transition-all duration-200 pointer-events-auto"
                            title="Reset to original"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        
                        {/* Version Navigation - Show only if has version history */}
                        {versionHistory[slides[currentSlide].id] && versionHistory[slides[currentSlide].id].length > 0 && (
                          <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg shadow-lg p-2 flex items-center gap-2 pointer-events-auto">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                goToPreviousVersion(slides[currentSlide].id);
                              }}
                              disabled={!canGoBack(slides[currentSlide].id)}
                              className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                              title="Previous version"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <span className="text-xs text-gray-700 px-1">
                              {(currentVersionIndex[slides[currentSlide].id] || 0) + 1}/{versionHistory[slides[currentSlide].id].length}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                goToNextVersion(slides[currentSlide].id);
                              }}
                              disabled={!canGoForward(slides[currentSlide].id)}
                              className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                              title="Next version"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        
                        {/* Edited Indicator */}
                        {versionHistory[slides[currentSlide].id] && versionHistory[slides[currentSlide].id].length > 0 && (
                          <div className="absolute bottom-3 right-3 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 pointer-events-auto">
                            <Wand2 className="w-3 h-3" />
                            Edited
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800">
                      <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-8 flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        <div className="text-center">
                          <p className="text-gray-500 dark:text-gray-400 font-medium">
                            {getLoadingState(slides[currentSlide].id) === 'loading' ? 'Generating...' : 'Loading section...'}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {slides[currentSlide].title}
                          </p>
                        </div>
                      </div>
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
        className={`grid ${isFrontBackOnly ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-3`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        {slides.map((slide, index) => {
          const loadingState = getLoadingState(slide.id);
          return (
            <motion.button
              key={slide.id}
              onClick={() => goToSlide(index)}
              className={`p-3 rounded-lg border-2 transition-all duration-300 text-left relative ${
                index === currentSlide
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Loading state indicator for navigation cards */}
              <div className="absolute top-2 right-2">
                {loadingState === 'loading' && (
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                )}
                {loadingState === 'completed' && (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                )}
                {loadingState === 'error' && (
                  <AlertCircle className="w-3 h-3 text-red-500" />
                )}
              </div>
              
              <div className={`w-3 h-3 rounded-full mb-2 ${slide.color}`}></div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {slide.title}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {slide.subtitle}
              </p>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Paper Size Selector - Only show if card is completed and props are provided */}
      {isCardCompleted && paperSizes && onPaperSizeChange && (
        <motion.div 
          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                Print Size
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Change the paper size for printing (doesn't affect your images)
              </p>
            </div>
            <div className="w-48">
              <Select value={selectedPaperSize} onValueChange={onPaperSizeChange}>
                <SelectTrigger className="border-blue-300 dark:border-blue-700">
                  <SelectValue placeholder="Choose paper size" />
                </SelectTrigger>
                <SelectContent>
                  {paperSizes.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      <div className="text-left">
                        <div className="font-medium">{size.label}</div>
                        <div className="text-xs text-muted-foreground">{size.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>
      )}

      {/* Card Actions */}
      <motion.div 
        className="flex flex-col sm:flex-row gap-3 pt-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        {/* Print Button */}
        {onPrint && (
          <Button
            onClick={onPrint}
            className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Card
            {paperConfig && (
              <span className="ml-2 text-xs opacity-75">
                ({paperConfig.printWidth} × {paperConfig.printHeight})
              </span>
            )}
          </Button>
        )}

        {/* Send to Factory Button */}
        <Button
          onClick={handleSendToFactory}
          disabled={isSendingToFactory || isLoadingCard}
          variant="outline"
          className="flex-1 border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50"
        >
          {isSendingToFactory ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : isLoadingCard ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              🏭
              <span className="ml-2">Send to Factory</span>
            </>
          )}
        </Button>
        
        {/* Share Button */}
        <Button
          onClick={handleShareCard}
          disabled={isSharing || isLoadingCard}
          variant="outline"
          className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
        >
          {isSharing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing...
            </>
          ) : isLoadingCard ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 mr-2" />
              Share Card
            </>
          )}
        </Button>
      </motion.div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share Your Card
            </DialogTitle>
            <DialogDescription>
              Your card is ready to share! Copy the link or send it via email.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Share URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Share URL</label>
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="flex-1"
                />
                <Button
                  onClick={handleCopyShareUrl}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Email Section */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Send via Email</label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="recipient@example.com"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleEmailCard}
                  variant="outline"
                  size="sm"
                  disabled={!emailAddress.trim() || isSendingEmail}
                >
                  {isSendingEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {isSendingEmail ? "Sending email..." : "Sends the card directly via email"}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                      onDragEnd={(_, { offset, velocity }) => {
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
                          <div className="max-w-full max-h-full">
                            <ProgressiveImage
                              src={slides[currentSlide].image}
                              thumbnailSrc={undefined}
                              alt={slides[currentSlide].title}
                              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                              priority={true} // Always prioritize in fullscreen
                            />
                          </div>
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
              {editingSection === "interior" ? (
                <>
                  Describe how you'd like to modify this section of your card. This interior has <strong>two areas</strong>: decorative artwork on the left and your message on the right. Be specific about which area you want to change and what modifications you want.
                  <br /><br />
                  <span className="text-amber-600 dark:text-amber-400 text-sm">
                    💡 <strong>Tip:</strong> Specify "left side" for decorative changes or "right side" for message changes to ensure both areas are preserved.
                  </span>
                </>
              ) : (
                "Describe how you'd like to modify this section of your card. Be specific about colors, style, content, or any changes you want to make."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current Image Preview */}
            {editingSection && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current Image{editingSection === "left-interior" || editingSection === "right-interior" ? "s" : ""}
                </label>
                <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white">
                  {editingSection === "left-interior" || editingSection === "right-interior" ? (
                    // Show both interior images for context
                    <div className="flex h-64">
                      <div className="w-1/2 relative">
                        <ProgressiveImage
                          src={getCurrentImage("left-interior", card.leftPage)}
                          thumbnailSrc={undefined}
                          alt="Left Interior"
                          className="w-full h-full object-contain"
                        />
                        {editingSection === "left-interior" && (
                          <div className="absolute inset-0 border-4 border-blue-500 bg-blue-500/10"></div>
                        )}
                      </div>
                      <div className="w-px bg-gray-300"></div>
                      <div className="w-1/2 relative">
                        <ProgressiveImage
                          src={getCurrentImage("right-interior", card.rightPage)}
                          thumbnailSrc={undefined}
                          alt="Right Interior"
                          className="w-full h-full object-contain"
                        />
                        {editingSection === "right-interior" && (
                          <div className="absolute inset-0 border-4 border-blue-500 bg-blue-500/10"></div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <ProgressiveImage
                      src={slides.find(s => s.id === editingSection)?.image || ""}
                      thumbnailSrc={undefined}
                      alt="Current section"
                      className="w-full h-64 object-contain"
                    />
                  )}
                </div>
                {(editingSection === "left-interior" || editingSection === "right-interior") && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    The highlighted area shows which side you're editing. Both sides are shown for context.
                  </p>
                )}
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
                Be specific about what you want to change. Only the areas you describe will be modified while keeping the rest intact.
              </p>
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