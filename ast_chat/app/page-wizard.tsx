"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Eye } from "lucide-react";
import Link from "next/link";

import CardWizard from "@/components/wizard/CardWizard";
import { ModeToggle } from "@/components/mode-toggle";
import CriticalResourcePreloader from "@/components/CriticalResourcePreloader";
import EarlyCardPreloader from "@/components/EarlyCardPreloader";

export default function CardStudioWizardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-slate-800 dark:to-gray-800">
      <CriticalResourcePreloader />
      <EarlyCardPreloader />
      
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                    VibeCarding
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Step-by-Step Card Creator
                  </p>
                </div>
              </div>
              <Link href="/gallery">
                <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">Gallery</span>
                </Button>
              </Link>
            </div>
            
            <div className="flex items-center gap-2">
              <Link href="/studio">
                <Button variant="outline" size="sm" className="gap-2">
                  <span className="text-xs">📄</span>
                  <span className="hidden sm:inline">Single Page</span>
                </Button>
              </Link>
              <ModeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Create Your Perfect Card
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Follow the simple steps below to create a personalized greeting card
                </p>
              </div>
            </div>
          </div>

          {/* Wizard Component */}
          <CardWizard />

          {/* Footer Help */}
          <div className="mt-12 text-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Need Help?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Our step-by-step wizard makes it easy to create beautiful cards. 
                Each step guides you through the process with helpful tips and validation.
              </p>
              <div className="flex justify-center gap-4">
                <Link href="/studio">
                  <Button variant="outline" size="sm" className="gap-2">
                    <span className="text-xs">📄</span>
                    Try Single Page View
                  </Button>
                </Link>
                <Link href="/gallery">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Eye className="w-4 h-4" />
                    Browse Examples
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 