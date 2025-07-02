"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import InfiniteScrollGallery from "@/components/InfiniteScrollGallery";
import { ModeToggle } from "@/components/mode-toggle";

export default function GalleryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-slate-900 dark:via-blue-900 dark:to-cyan-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">VibeCarding</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Card Gallery</p>
                </div>
              </Link>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Back to Create */}
              <Button variant="outline" asChild className="hidden sm:flex">
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Create
                </Link>
              </Button>
              
              {/* Create New Card Button */}
              <Button asChild className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
                <Link href="/">
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Card
                </Link>
              </Button>
              
              {/* Dark Mode Toggle */}
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Infinite Card Gallery
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Browse through all the beautiful greeting cards created with VibeCarding. 
                  Scroll infinitely to discover more amazing designs!
                </p>
              </div>
              <div className="mt-4 sm:mt-0 flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                  <Sparkles className="w-4 h-4 mr-2 text-blue-500" />
                  <span>Auto-loading</span>
                </div>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                  <span>Live updates</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Infinite Scroll Gallery */}
        <InfiniteScrollGallery 
          className="space-y-6"
          showSearch={true}
          itemsPerPage={24}
          onCardSelect={(card) => {
            // When a card is selected, you could navigate to it or open in a new tab
            window.open(card.shareUrl, '_blank');
          }}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-t border-gray-200 dark:border-slate-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">VibeCarding</span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
              Create beautiful, personalized greeting cards with AI-powered design
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/" className="hover:text-blue-500 transition-colors">
                Create Cards
              </Link>
              <Link href="/gallery" className="hover:text-blue-500 transition-colors">
                Gallery
              </Link>
              <Link href="https://ast.engineer" className="hover:text-blue-500 transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}