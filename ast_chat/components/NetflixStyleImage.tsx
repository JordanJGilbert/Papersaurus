import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useNetworkAware } from '../hooks/useNetworkAware';

interface NetflixStyleImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onLoad?: () => void;
}

const NetflixStyleImage: React.FC<NetflixStyleImageProps> = ({
  src,
  alt,
  className = '',
  priority = false,
  onLoad
}) => {
  const [imageState, setImageState] = useState<'placeholder' | 'thumbnail' | 'lowQuality' | 'highQuality' | 'error'>('placeholder');
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isSlowConnection, isFastConnection } = useNetworkAware();

  // Generate progressive URLs (Netflix-style)
  const generateProgressiveUrls = (originalUrl: string) => {
    if (!originalUrl || !originalUrl.includes('vibecarding.com')) {
      return {
        thumbnail: originalUrl,
        lowQuality: originalUrl,
        highQuality: originalUrl
      };
    }

    try {
      // Tiny thumbnail (like Netflix's blur-up technique)
      const thumbnailUrl = new URL(originalUrl);
      thumbnailUrl.searchParams.set('w', '40');
      thumbnailUrl.searchParams.set('h', '60');
      thumbnailUrl.searchParams.set('q', '30');
      thumbnailUrl.searchParams.set('blur', '3');

      // Low quality version
      const lowQualityUrl = new URL(originalUrl);
      lowQualityUrl.searchParams.set('w', isSlowConnection ? '200' : '300');
      lowQualityUrl.searchParams.set('h', isSlowConnection ? '300' : '450');
      lowQualityUrl.searchParams.set('q', isSlowConnection ? '50' : '70');

      // High quality version
      const highQualityUrl = new URL(originalUrl);
      if (!isFastConnection) {
        highQualityUrl.searchParams.set('w', '400');
        highQualityUrl.searchParams.set('h', '600');
        highQualityUrl.searchParams.set('q', '80');
      }

      return {
        thumbnail: thumbnailUrl.toString(),
        lowQuality: lowQualityUrl.toString(),
        highQuality: isFastConnection ? originalUrl : highQualityUrl.toString()
      };
    } catch {
      return {
        thumbnail: originalUrl,
        lowQuality: originalUrl,
        highQuality: originalUrl
      };
    }
  };

  const { thumbnail, lowQuality, highQuality } = generateProgressiveUrls(src);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px', // Start loading 50px before visible (Netflix buffer)
        threshold: 0.1
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  // Progressive loading (Netflix-style)
  useEffect(() => {
    if (!isInView) return;

    const loadProgressively = async () => {
      try {
        // Step 1: Load tiny thumbnail first (instant blur-up)
        if (thumbnail !== src) {
          const thumbImg = new Image();
          thumbImg.onload = () => {
            setCurrentSrc(thumbnail);
            setImageState('thumbnail');
          };
          thumbImg.src = thumbnail;
        }

        // Step 2: Load low quality version
        await new Promise<void>((resolve) => {
          const lowImg = new Image();
          lowImg.onload = () => {
            setCurrentSrc(lowQuality);
            setImageState('lowQuality');
            resolve();
          };
          lowImg.onerror = () => resolve(); // Continue even if fails
          lowImg.src = lowQuality;
        });

        // Step 3: Load high quality version (if good connection)
        if (isFastConnection || !isSlowConnection) {
          await new Promise<void>((resolve) => {
            const highImg = new Image();
            highImg.onload = () => {
              setCurrentSrc(highQuality);
              setImageState('highQuality');
              onLoad?.();
              resolve();
            };
            highImg.onerror = () => {
              setImageState('error');
              resolve();
            };
            highImg.src = highQuality;
          });
        } else {
          // On slow connections, low quality is the final version
          setImageState('highQuality');
          onLoad?.();
        }

      } catch (error) {
        setImageState('error');
      }
    };

    loadProgressively();
  }, [isInView, thumbnail, lowQuality, highQuality, isFastConnection, isSlowConnection, onLoad]);

  if (imageState === 'error') {
    return (
      <div ref={containerRef} className={`bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-500">
          <ImageIcon className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No preview</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Placeholder background */}
      {imageState === 'placeholder' && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      
      {/* Progressive image */}
      {currentSrc && (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-all duration-300 ${
            imageState === 'thumbnail' ? 'blur-sm scale-110' : 
            imageState === 'lowQuality' ? 'blur-[1px] scale-105' : 
            'blur-0 scale-100'
          } ${imageState === 'highQuality' ? 'opacity-100' : 'opacity-90'}`}
          style={{
            filter: imageState === 'thumbnail' ? 'blur(3px)' : 
                   imageState === 'lowQuality' ? 'blur(1px)' : 'none'
          }}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}

      {/* Loading indicator */}
      {imageState === 'placeholder' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default NetflixStyleImage;