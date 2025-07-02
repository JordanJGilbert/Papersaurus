import { useEffect } from 'react';

const CriticalResourcePreloader = () => {
  useEffect(() => {
    // Preload critical resources
    const preloadResources = () => {
      // DNS prefetch for external domains
      const prefetchDomains = [
        'vibecarding.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
      ];
      
      prefetchDomains.forEach(domain => {
        const link = document.createElement('link');
        link.rel = 'dns-prefetch';
        link.href = `//${domain}`;
        document.head.appendChild(link);
      });
      
      // Preconnect to API endpoint
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = 'https://vibecarding.com';
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
      
      // Preload critical API endpoint
      const apiPreload = document.createElement('link');
      apiPreload.rel = 'prefetch';
      apiPreload.href = 'https://vibecarding.com/api/cards/list?page=1&per_page=40&template_mode=true';
      apiPreload.as = 'fetch';
      apiPreload.crossOrigin = 'anonymous';
      document.head.appendChild(apiPreload);
      
      // Enable resource hints for better performance
      if ('connection' in navigator) {
        try {
          // @ts-ignore
          navigator.connection?.addEventListener?.('change', () => {
            const connection = (navigator as any).connection;
            if (connection?.effectiveType === '4g' || connection?.downlink > 1.5) {
              // Good connection - be more aggressive with preloading
              console.log('🚀 Good connection detected, enabling aggressive preloading');
            }
          });
        } catch (error) {
          // Network API not supported
        }
      }
    };
    
    // Run immediately, but not blocking
    setTimeout(preloadResources, 0);
  }, []);
  
  return null; // This component doesn't render anything
};

export default CriticalResourcePreloader;