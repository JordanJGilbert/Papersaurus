import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface ProgressiveImageProps {
  src: string;
  thumbnailSrc?: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
  // Responsive sizing options
  sizes?: string;
  srcSet?: string;
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  thumbnailSrc,
  alt,
  className = '',
  onLoad,
  onError,
  loading = 'lazy',
  priority = false,
  sizes,
  srcSet
}) => {
  const [imageState, setImageState] = useState<'loading' | 'thumbnail' | 'loaded' | 'error'>('loading');
  const [currentSrc, setCurrentSrc] = useState<string>('');

  // Preload image function
  const preloadImage = useCallback((imageSrc: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = (error) => reject(error);
      img.src = imageSrc;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadImages = async () => {
      // Check if src is valid
      if (!src || src.trim() === '') {
        setImageState('error');
        return;
      }
      
      try {
        // Start with thumbnail if available
        if (thumbnailSrc) {
          setImageState('loading');
          await preloadImage(thumbnailSrc);
          if (isMounted) {
            setCurrentSrc(thumbnailSrc);
            setImageState('thumbnail');
          }
        }

        // Then load full image
        if (priority || loading === 'eager') {
          // Load immediately for priority images
          await preloadImage(src);
          if (isMounted) {
            setCurrentSrc(src);
            setImageState('loaded');
            onLoad?.();
          }
        } else {
          // Load immediately - intersection observer was broken
          console.log('🔄 ProgressiveImage: Loading immediately (fixed lazy loading)', src);
          await preloadImage(src);
          if (isMounted) {
            setCurrentSrc(src);
            setImageState('loaded');
            onLoad?.();
          }
          
          return () => {
            observer.disconnect();
          };
        }
      } catch (error) {
        if (isMounted) {
          setImageState('error');
          onError?.();
        }
      }
    };

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [src, thumbnailSrc, priority, loading, preloadImage, onLoad, onError]);

  const renderContent = () => {
    switch (imageState) {
      case 'loading':
        return (
          <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 w-full h-full">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          </div>
        );
      
      case 'thumbnail':
        return (
          <div className="relative w-full h-full">
            <img
              src={currentSrc}
              alt={alt}
              className={`${className} filter blur-sm transition-all duration-300`}
              draggable={false}
              sizes={sizes}
              srcSet={srcSet}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/20 rounded-full p-2">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              </div>
            </div>
          </div>
        );
      
      case 'loaded':
        return (
          <img
            src={currentSrc}
            alt={alt}
            className={`${className} transition-all duration-300`}
            draggable={false}
            sizes={sizes}
            srcSet={srcSet}
          />
        );
      
      case 'error':
        return (
          <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 w-full h-full">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <span className="text-red-600 dark:text-red-400 text-xs">✕</span>
              </div>
              <span className="text-xs text-gray-500">Failed to load</span>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden">
      {renderContent()}
    </div>
  );
};

export default ProgressiveImage;