import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  sizes?: string;
  priority?: boolean;
}

const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  sizes,
  priority = false
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Generate optimized image URLs
  const generateOptimizedUrls = (originalUrl: string) => {
    if (!originalUrl || !originalUrl.includes('vibecarding.com')) {
      return { webp: originalUrl, fallback: originalUrl };
    }

    try {
      const url = new URL(originalUrl);
      
      // Try WebP format first (much smaller)
      const webpUrl = new URL(originalUrl);
      webpUrl.searchParams.set('format', 'webp');
      webpUrl.searchParams.set('quality', '75');
      webpUrl.searchParams.set('width', '300');
      
      // Fallback to compressed JPEG
      const fallbackUrl = new URL(originalUrl);
      fallbackUrl.searchParams.set('quality', '80');
      fallbackUrl.searchParams.set('width', '300');
      
      return {
        webp: webpUrl.toString(),
        fallback: fallbackUrl.toString()
      };
    } catch {
      return { webp: originalUrl, fallback: originalUrl };
    }
  };

  useEffect(() => {
    if (!src) {
      setHasError(true);
      setShowSkeleton(false);
      return;
    }

    const { webp, fallback } = generateOptimizedUrls(src);
    
    // Test WebP support and load appropriate format
    const loadOptimalImage = async () => {
      try {
        // First try WebP
        const webpImg = new Image();
        webpImg.onload = () => {
          setCurrentSrc(webp);
          setIsLoaded(true);
          setShowSkeleton(false);
        };
        webpImg.onerror = () => {
          // Fallback to original/compressed
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            setCurrentSrc(fallback);
            setIsLoaded(true);
            setShowSkeleton(false);
          };
          fallbackImg.onerror = () => {
            setHasError(true);
            setShowSkeleton(false);
          };
          fallbackImg.src = fallback;
        };
        webpImg.src = webp;
      } catch (error) {
        setHasError(true);
        setShowSkeleton(false);
      }
    };

    if (priority) {
      // Load immediately for priority images
      loadOptimalImage();
    } else {
      // Delay slightly for non-priority images
      const timer = setTimeout(loadOptimalImage, 50);
      return () => clearTimeout(timer);
    }
  }, [src, priority]);

  if (hasError) {
    return (
      <div className={`bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-500">
          <ImageIcon className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Skeleton loader */}
      {showSkeleton && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded" />
      )}
      
      {/* Optimized image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          loading={loading}
          sizes={sizes}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          onLoad={() => {
            setIsLoaded(true);
            setShowSkeleton(false);
          }}
          onError={() => {
            setHasError(true);
            setShowSkeleton(false);
          }}
        />
      )}
    </div>
  );
};

export default OptimizedImage;