"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Sparkles, Filter, LayoutGrid, LayoutList, TrendingUp, Calendar, Hash } from "lucide-react";
import Link from "next/link";
import EnhancedGallery from "@/components/EnhancedGallery";
import { ModeToggle } from "@/components/mode-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function GalleryPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'masonry'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular'>('newest');
  const [filterCardType, setFilterCardType] = useState<string>('all');
  const [filterTone, setFilterTone] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Card types for filtering
  const cardTypes = [
    { id: "all", label: "All Types" },
    { id: "birthday", label: "Birthday" },
    { id: "thank-you", label: "Thank You" },
    { id: "anniversary", label: "Anniversary" },
    { id: "congratulations", label: "Congratulations" },
    { id: "holiday", label: "Holiday" },
    { id: "get-well", label: "Get Well" },
    { id: "sympathy", label: "Sympathy" },
    { id: "love", label: "Love & Romance" },
    { id: "custom", label: "Custom" },
  ];

  // Tones for filtering
  const cardTones = [
    { id: "all", label: "All Tones" },
    { id: "funny", label: "😄 Funny" },
    { id: "romantic", label: "💕 Romantic" },
    { id: "professional", label: "👔 Professional" },
    { id: "heartfelt", label: "❤️ Heartfelt" },
    { id: "playful", label: "🎉 Playful" },
    { id: "elegant", label: "✨ Elegant" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-slate-900 dark:via-blue-900/20 dark:to-cyan-900/20">
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
                  <p className="text-xs text-gray-500 dark:text-gray-400">Gallery</p>
                </div>
              </Link>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* View Mode Toggle - Desktop Only */}
              <div className="hidden md:flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8 px-3"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'masonry' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('masonry')}
                  className="h-8 px-3"
                >
                  <Hash className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 px-3"
                >
                  <LayoutList className="w-4 h-4" />
                </Button>
              </div>

              {/* Filter Button */}
              <Sheet open={showFilters} onOpenChange={setShowFilters}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Filters</span>
                    {(filterCardType !== 'all' || filterTone !== 'all') && (
                      <Badge variant="secondary" className="ml-2 h-5 px-1">
                        {[filterCardType !== 'all', filterTone !== 'all'].filter(Boolean).length}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filter Gallery</SheetTitle>
                    <SheetDescription>
                      Narrow down cards by type and tone
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    {/* Card Type Filter */}
                    <div className="space-y-3">
                      <Label>Card Type</Label>
                      <Select value={filterCardType} onValueChange={setFilterCardType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select card type" />
                        </SelectTrigger>
                        <SelectContent>
                          {cardTypes.map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tone Filter */}
                    <div className="space-y-3">
                      <Label>Card Tone</Label>
                      <Select value={filterTone} onValueChange={setFilterTone}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {cardTones.map(tone => (
                            <SelectItem key={tone.id} value={tone.id}>
                              {tone.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sort By */}
                    <div className="space-y-3">
                      <Label>Sort By</Label>
                      <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2" />
                              Newest First
                            </div>
                          </SelectItem>
                          <SelectItem value="oldest">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 mr-2" />
                              Oldest First
                            </div>
                          </SelectItem>
                          <SelectItem value="popular">
                            <div className="flex items-center">
                              <TrendingUp className="w-4 h-4 mr-2" />
                              Most Popular
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Clear Filters */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setFilterCardType('all');
                        setFilterTone('all');
                        setSortBy('newest');
                      }}
                    >
                      Clear All Filters
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              
              {/* Create New Card Button */}
              <Button asChild className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
                <Link href="/wizard">
                  <Plus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Create</span>
                </Link>
              </Button>
              
              {/* Dark Mode Toggle */}
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Page Header with Stats */}
        <div className="mb-6 sm:mb-8">
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Card Gallery
                </h2>
                <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base">
                  Explore all the amazing cards created by our community
                </p>
              </div>
              
              {/* Quick Stats */}
              <div className="flex items-center gap-4 sm:gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    <span className="animate-pulse">∞</span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">Cards</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    <span className="animate-pulse">●</span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">Live</div>
                </div>
              </div>
            </div>

            {/* Mobile View Mode Toggle */}
            <div className="mt-4 flex md:hidden items-center justify-center">
              <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="grid">
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Grid
                  </TabsTrigger>
                  <TabsTrigger value="masonry">
                    <Hash className="w-4 h-4 mr-2" />
                    Masonry
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <LayoutList className="w-4 h-4 mr-2" />
                    List
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        {/* Gallery Component */}
        <EnhancedGallery 
          viewMode={viewMode}
          sortBy={sortBy}
          filterCardType={filterCardType}
          filterTone={filterTone}
          showSearch={true}
          itemsPerPage={24}
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
              Create beautiful, personalized greeting cards with AI
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
              <Link href="/wizard" className="hover:text-blue-500 transition-colors">
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