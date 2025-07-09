"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Eye, Wrench } from "lucide-react";
import Link from "next/link";

import CardWizard from "@/components/wizard/CardWizard";
import { ModeToggle } from "@/components/mode-toggle";
import CriticalResourcePreloader from "@/components/CriticalResourcePreloader";
import EarlyCardPreloader from "@/components/EarlyCardPreloader";


export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-slate-800 dark:to-gray-800">
      <CriticalResourcePreloader />
      <EarlyCardPreloader />
      
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Mobile Header Layout */}
            <div className="flex items-center justify-between w-full sm:hidden">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                    VibeCarding
                  </h1>
                  <p className="text-xs text-gray-600 dark:text-gray-400">AI-powered greeting cards</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Link href="/legacy">
                  <Button variant="ghost" size="sm" className="p-2">
                    <Wrench className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/gallery">
                  <Button variant="ghost" size="sm" className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                    <Eye className="w-4 h-4" />
                  </Button>
                </Link>
                <ModeToggle />
              </div>
            </div>

            {/* Desktop Header Layout */}
            <div className="hidden sm:flex items-center justify-between w-full">
              <div className="flex items-center space-x-3">
                <Link href="/legacy">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Wrench className="w-4 h-4" />
                    Legacy Mode
                  </Button>
                </Link>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                      VibeCarding
                    </h1>
                    <p className="text-xs text-gray-600 dark:text-gray-400">AI-powered greeting cards</p>
                  </div>
                </div>
                <Link href="/gallery">
                  <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                    <Eye className="w-4 h-4" />
                    Gallery
                  </Button>
                </Link>
              </div>
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Main Wizard Component */}
        <CardWizard />
      </div>
    </div>
  );
}
