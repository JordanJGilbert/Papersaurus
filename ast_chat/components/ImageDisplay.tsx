import React, { useState } from 'react';
import { Download, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageDisplayProps {
  imageUrls: string[];
  className?: string;
}

const ImageDisplay: React.FC<ImageDisplayProps> = ({ imageUrls, className = "" }) => {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});
  const [errorImages, setErrorImages] = useState<Record<string, boolean>>({});

  const handleImageLoad = (url: string) => {
    setLoadingImages(prev => ({ ...prev, [url]: false }));
  };

  const handleImageError = (url: string) => {
    setLoadingImages(prev => ({ ...prev, [url]: false }));
    setErrorImages(prev => ({ ...prev, [url]: true }));
  };

  const handleImageClick = (url: string) => {
    setExpandedImage(url);
  };

  const handleDownload = async (url: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Extract filename from URL or generate one
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1] || `generated-image-${Date.now()}.png`;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  };

  const handleOpenInNewTab = (url: string, event: React.MouseEvent) => {
    event.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!imageUrls || imageUrls.length === 0) {
    return null;
  }

  return (
    <div className={`image-display ${className}`}>
      {/* Image Grid */}
      <div className={`grid gap-3 ${
        imageUrls.length === 1 
          ? 'grid-cols-1' 
          : imageUrls.length === 2 
          ? 'grid-cols-1 sm:grid-cols-2' 
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      }`}>
        {imageUrls.map((url, index) => (
          <div 
            key={`${url}-${index}`}
            className="relative group cursor-pointer rounded-lg overflow-hidden border border-border bg-muted/10 hover:shadow-lg transition-all duration-200"
            onClick={() => handleImageClick(url)}
          >
            {/* Loading State */}
            {loadingImages[url] && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
            
            {/* Error State */}
            {errorImages[url] && (
              <div className="aspect-square flex items-center justify-center bg-muted text-muted-foreground">
                <div className="text-center">
                  <div className="text-2xl mb-2">🖼️</div>
                  <div className="text-sm">Failed to load image</div>
                </div>
              </div>
            )}
            
            {/* Image */}
            {!errorImages[url] && (
              <img
                src={url}
                alt={`Generated image ${index + 1}`}
                className="w-full aspect-square object-cover transition-transform duration-200 group-hover:scale-105"
                onLoad={() => handleImageLoad(url)}
                onError={() => handleImageError(url)}
                onLoadStart={() => setLoadingImages(prev => ({ ...prev, [url]: true }))}
                loading="lazy"
              />
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => handleOpenInNewTab(url, e)}
                  className="bg-white/90 hover:bg-white text-black"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => handleDownload(url, e)}
                  className="bg-white/90 hover:bg-white text-black"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Image Number Badge */}
            {imageUrls.length > 1 && (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">
                {index + 1}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]">
            <Button
              variant="secondary"
              size="icon"
              className="absolute -top-12 right-0 bg-white/90 hover:bg-white text-black"
              onClick={() => setExpandedImage(null)}
            >
              <EyeOff className="w-4 h-4" />
            </Button>
            <img
              src={expandedImage}
              alt="Expanded view"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute -bottom-12 left-0 right-0 flex justify-center space-x-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => handleOpenInNewTab(expandedImage, e)}
                className="bg-white/90 hover:bg-white text-black"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => handleDownload(expandedImage, e)}
                className="bg-white/90 hover:bg-white text-black"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Count Info */}
      <div className="text-xs text-muted-foreground mt-2 text-center">
        {imageUrls.length === 1 
          ? "1 image generated" 
          : `${imageUrls.length} images generated`}
      </div>
    </div>
  );
};

export default ImageDisplay; 