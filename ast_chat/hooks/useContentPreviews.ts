import { useState, useCallback } from 'react';

export interface PreviewInstance {
  id: string;
  type: 'web_app' | 'code' | 'diff';
  data: any;
  toolCall?: {
    name: string;
    call_id: string;
    status?: string;
  };
  messageId: string; // Which message this preview belongs to
  createdAt: number;
  updatedAt: number;
}

export const useContentPreviews = () => {
  const [previews, setPreviews] = useState<Map<string, PreviewInstance>>(new Map());

  // Create or update a preview
  const upsertPreview = useCallback((
    id: string,
    type: 'web_app' | 'code' | 'diff',
    data: any,
    messageId: string,
    toolCall?: { name: string; call_id: string; status?: string }
  ) => {
    setPreviews(prev => {
      const newPreviews = new Map(prev);
      const existing = newPreviews.get(id);
      const now = Date.now();
      
      const preview: PreviewInstance = {
        id,
        type,
        data,
        toolCall,
        messageId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      
      newPreviews.set(id, preview);
      return newPreviews;
    });
  }, []);

  // Update existing preview data
  const updatePreview = useCallback((id: string, newData: any) => {
    setPreviews(prev => {
      const newPreviews = new Map(prev);
      const existing = newPreviews.get(id);
      
      if (existing) {
        newPreviews.set(id, {
          ...existing,
          data: { ...existing.data, ...newData },
          updatedAt: Date.now(),
        });
      }
      
      return newPreviews;
    });
  }, []);

  // Get preview by ID
  const getPreview = useCallback((id: string): PreviewInstance | undefined => {
    return previews.get(id);
  }, [previews]);

  // Get all previews for a message
  const getPreviewsForMessage = useCallback((messageId: string): PreviewInstance[] => {
    return Array.from(previews.values()).filter(preview => preview.messageId === messageId);
  }, [previews]);

  // Remove preview
  const removePreview = useCallback((id: string) => {
    setPreviews(prev => {
      const newPreviews = new Map(prev);
      newPreviews.delete(id);
      return newPreviews;
    });
  }, []);

  // Clear all previews
  const clearPreviews = useCallback(() => {
    setPreviews(new Map());
  }, []);

  return {
    previews: Array.from(previews.values()),
    upsertPreview,
    updatePreview,
    getPreview,
    getPreviewsForMessage,
    removePreview,
    clearPreviews,
  };
}; 