"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function ClearStorageButton() {
  const [isClearing, setIsClearing] = useState(false);
  const router = useRouter();

  const clearAllStorage = async () => {
    setIsClearing(true);
    
    try {
      // Clear all localStorage
      if (typeof window !== 'undefined') {
        console.log('🧹 Clearing all localStorage...');
        
        // Get all keys before clearing
        const keysCount = localStorage.length;
        
        // Clear everything
        localStorage.clear();
        
        // Clear sessionStorage too
        sessionStorage.clear();
        
        // Clear all cookies (client-side accessible ones)
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        console.log(`✅ Cleared ${keysCount} items from localStorage`);
        toast.success(`Cleared all data! Removed ${keysCount} stored items.`);
        
        // Give a moment for the toast to show
        setTimeout(() => {
          // Force reload to ensure clean state
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Error clearing storage:', error);
      toast.error('Failed to clear storage. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
          title="Clear all storage"
        >
          <Trash2 className="h-5 w-5" />
          <span className="sr-only">Clear all storage</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear All Storage?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>This will completely clear all stored data including:</p>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>All form data and drafts</li>
              <li>Card generation history</li>
              <li>Saved preferences and settings</li>
              <li>All cached images and data</li>
              <li>WebSocket connections and job tracking</li>
            </ul>
            <p className="font-semibold text-red-600 dark:text-red-400 mt-3">
              This action cannot be undone!
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={clearAllStorage}
            disabled={isClearing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isClearing ? "Clearing..." : "Clear Everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}