// Utility functions for image optimization and responsive sizing

// Configuration for the backend API endpoint
const BACKEND_API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'https://vibecarding.com';

export interface ResponsiveImageSizes {
  small: { width: number; height: number };
  medium: { width: number; height: number };
  large: { width: number; height: number };
}

export const CARD_ASPECT_RATIO = 2/3; // 2:3 aspect ratio for greeting cards

// Generate responsive sizes for card images
export const generateResponsiveCardSizes = (): ResponsiveImageSizes => ({
  small: { width: 300, height: 450 },   // Mobile
  medium: { width: 400, height: 600 },  // Tablet
  large: { width: 600, height: 900 }    // Desktop
});

// Generate srcSet string for responsive images
export const generateSrcSet = (baseUrl: string, sizes: ResponsiveImageSizes): string => {
  const srcSetParts: string[] = [];
  
  Object.entries(sizes).forEach(([size, dimensions]) => {
    // Generate thumbnail URL with specific dimensions
    const thumbnailUrl = generateThumbnailUrl(baseUrl, dimensions.width, dimensions.height);
    srcSetParts.push(`${thumbnailUrl} ${dimensions.width}w`);
  });
  
  return srcSetParts.join(', ');
};

// Generate sizes attribute for responsive images
export const generateSizesAttribute = (): string => {
  return [
    '(max-width: 640px) 300px',    // Mobile: small size
    '(max-width: 1024px) 400px',   // Tablet: medium size
    '600px'                        // Desktop: large size
  ].join(', ');
};

// Generate thumbnail URL with dimensions
export const generateThumbnailUrl = (originalUrl: string, width: number, height: number): string => {
  // For now, return the original URL - in production this would call the thumbnail API
  // In the future, this could be enhanced to generate actual thumbnail URLs
  return originalUrl;
};

// Generate multiple thumbnail sizes for an image
export const generateMultipleThumbnails = async (imageUrl: string): Promise<Record<string, string>> => {
  const sizes = generateResponsiveCardSizes();
  const thumbnails: Record<string, string> = {};
  
  try {
    // Generate thumbnails for each size
    for (const [sizeKey, dimensions] of Object.entries(sizes)) {
      const response = await fetch(`${BACKEND_API_BASE_URL}/generate_thumbnail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          width: dimensions.width,
          height: dimensions.height,
          quality: 85
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        thumbnails[sizeKey] = data.thumbnail_url;
      }
    }
    
    return thumbnails;
  } catch (error) {
    console.warn('Error generating multiple thumbnails:', error);
    return {};
  }
};

// Check if browser supports WebP format
export const supportsWebP = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      resolve(webP.height === 2);
    };
    webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
};

// Get optimal image format based on browser support
export const getOptimalImageFormat = async (): Promise<'webp' | 'jpeg'> => {
  const webpSupported = await supportsWebP();
  return webpSupported ? 'webp' : 'jpeg';
};

// Calculate optimal image dimensions based on container size
export const calculateOptimalSize = (
  containerWidth: number, 
  containerHeight: number, 
  devicePixelRatio: number = window.devicePixelRatio || 1
): { width: number; height: number } => {
  // Account for device pixel ratio for crisp images on high-DPI displays
  const targetWidth = Math.ceil(containerWidth * devicePixelRatio);
  const targetHeight = Math.ceil(containerHeight * devicePixelRatio);
  
  // Ensure the size maintains card aspect ratio
  const aspectRatio = CARD_ASPECT_RATIO;
  
  if (targetWidth / targetHeight > aspectRatio) {
    // Container is wider than card aspect ratio
    return {
      width: Math.ceil(targetHeight * aspectRatio),
      height: targetHeight
    };
  } else {
    // Container is taller than card aspect ratio
    return {
      width: targetWidth,
      height: Math.ceil(targetWidth / aspectRatio)
    };
  }
};

// Preload critical images for better performance
export const preloadCriticalImages = (imageUrls: string[]): void => {
  imageUrls.forEach(url => {
    if (url) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      document.head.appendChild(link);
    }
  });
};

// Image loading performance metrics
export interface ImageLoadMetrics {
  loadStartTime: number;
  loadEndTime?: number;
  loadDuration?: number;
  imageSize?: number;
  fromCache?: boolean;
}

export const trackImageLoadPerformance = (imageUrl: string): ImageLoadMetrics => {
  const metrics: ImageLoadMetrics = {
    loadStartTime: performance.now()
  };
  
  const img = new Image();
  img.onload = () => {
    metrics.loadEndTime = performance.now();
    metrics.loadDuration = metrics.loadEndTime - metrics.loadStartTime;
    
    // Log performance metrics for debugging
    console.log(`Image loaded: ${imageUrl}`, {
      duration: `${metrics.loadDuration?.toFixed(2)}ms`,
      fromCache: metrics.loadDuration && metrics.loadDuration < 50 // Assume cached if very fast
    });
  };
  
  img.src = imageUrl;
  return metrics;
};