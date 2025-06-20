import React, { useState, useEffect } from 'react';
import { ExternalLink, Globe } from 'lucide-react';

interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

interface URLPreviewProps {
  url: string;
  className?: string;
}

const URLPreview: React.FC<URLPreviewProps> = ({ url, className = "" }) => {
  const [ogData, setOgData] = useState<OpenGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchOGData = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Try multiple CORS proxy services for better reliability
        const proxies = [
          `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          `https://corsproxy.io/?${encodeURIComponent(url)}`,
          // Fallback: try direct fetch (will fail due to CORS but worth trying)
          url
        ];
        
        let htmlContent = '';
        let fetchSuccess = false;
        
        for (const proxyUrl of proxies) {
          try {
            const response = await fetch(proxyUrl, { 
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (!response.ok) continue;
            
            if (proxyUrl.includes('allorigins.win')) {
              const data = await response.json();
              htmlContent = data.contents;
            } else if (proxyUrl.includes('corsproxy.io')) {
              htmlContent = await response.text();
            } else {
              htmlContent = await response.text();
            }
            
            fetchSuccess = true;
            break;
          } catch (err) {
            console.log(`Failed to fetch via ${proxyUrl}:`, err);
            continue;
          }
        }
        
        if (!fetchSuccess) {
          throw new Error('All proxy attempts failed');
        }
        
        // Parse OG tags from HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                       doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                       doc.querySelector('title')?.textContent ||
                       '';
        
        const ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                             doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ||
                             doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                             '';
        
        let ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                     doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
                     '';
        
        // Make relative image URLs absolute
        if (ogImage && !ogImage.startsWith('http')) {
          const urlObj = new URL(url);
          if (ogImage.startsWith('/')) {
            ogImage = `${urlObj.protocol}//${urlObj.host}${ogImage}`;
          } else {
            ogImage = `${urlObj.protocol}//${urlObj.host}/${ogImage}`;
          }
        }
        
        const urlObj = new URL(url);
        const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
                          urlObj.hostname.replace('www.', '');
        
        // Only set ogData if we got meaningful content
        if (ogTitle || ogDescription) {
          setOgData({
            title: ogTitle || urlObj.hostname.replace('www.', ''),
            description: ogDescription,
            image: ogImage,
            siteName: ogSiteName,
            url: url
          });
        } else {
          throw new Error('No meaningful OG data found');
        }
      } catch (err) {
        console.log('Failed to fetch OG data for', url, err);
        setError(true);
        // Create a basic fallback
        try {
          const urlObj = new URL(url);
          setOgData({
            title: urlObj.hostname.replace('www.', ''),
            description: url,
            siteName: urlObj.hostname.replace('www.', ''),
            url: url
          });
        } catch (parseErr) {
          // If URL parsing also fails, we'll render the fallback link
          setOgData(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to avoid overwhelming with requests
    const timeoutId = setTimeout(fetchOGData, 100);
    return () => clearTimeout(timeoutId);
  }, [url]);

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className={`border border-border rounded-lg p-3 bg-muted/20 animate-pulse my-2 ${className}`}>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-muted rounded"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!ogData || error) {
    return (
      <div className={`my-2 ${className}`}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-2 text-sm bg-muted/40 hover:bg-muted/60 border border-border rounded-lg transition-colors group"
        >
          <Globe className="w-4 h-4 mr-2 text-muted-foreground" />
          <span className="text-blue-600 dark:text-blue-400 group-hover:underline truncate max-w-md">
            {url}
          </span>
          <ExternalLink className="w-4 h-4 ml-2 text-muted-foreground flex-shrink-0" />
        </a>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`border border-border rounded-lg overflow-hidden bg-background hover:bg-muted/20 transition-colors cursor-pointer group my-2 ${className}`}
    >
      <div className="flex">
        {ogData.image && (
          <div className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
            <img
              src={ogData.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm text-foreground line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {ogData.title}
              </h3>
              {ogData.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {ogData.description}
                </p>
              )}
              <div className="flex items-center mt-2 text-xs text-muted-foreground">
                <Globe className="w-3 h-3 mr-1" />
                <span className="truncate">{ogData.siteName}</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground ml-2 flex-shrink-0 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default URLPreview; 