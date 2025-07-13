'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Send, Sparkles, Download, Loader2, Bot, User, Palette, Type, Layout, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { chatWithAI } from '@/hooks/cardStudio/utils'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'assistant' | 'user'
  content: string
}

interface FlyerConfig {
  title?: string
  subtitle?: string
  description?: string
  style?: string
  colorScheme?: string
  quality?: string
  finalPrompt?: string
}

export default function FlyerPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI flyer designer. Let's create something amazing together! 🎨\n\nWhat kind of flyer would you like to create today? (e.g., event poster, business flyer, party invitation, sale announcement)"
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [config, setConfig] = useState<FlyerConfig>({
    quality: 'medium'
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedFlyer, setGeneratedFlyer] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const qualities = [
    { value: 'low', label: 'Fast', icon: '⚡' },
    { value: 'medium', label: 'Balanced', icon: '⚖️' },
    { value: 'high', label: 'Best Quality', icon: '✨' }
  ]

  // Check if user is near bottom of chat
  const checkIfNearBottom = () => {
    if (!chatContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const threshold = 100 // pixels from bottom
    setIsNearBottom(scrollHeight - scrollTop - clientHeight < threshold)
  }

  useEffect(() => {
    // Only scroll if user is near bottom and last message is from assistant
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant' && isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isNearBottom])

  const addMessage = (role: 'assistant' | 'user', content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content
    }
    setMessages(prev => [...prev, newMessage])
  }

  const processUserInput = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')
    addMessage('user', userMessage)
    setIsTyping(true)

    try {
      const conversationContext = messages.map(m => `${m.role}: ${m.content}`).join('\n')
      
      const systemPrompt = isEditMode 
        ? `You are helping the user refine their flyer design. They've already generated a flyer and want to make changes.

Current flyer prompt: ${config.finalPrompt}

Your task:
1. Understand what changes the user wants to make
2. Suggest specific modifications to the prompt
3. Be helpful and creative with suggestions
4. When ready to regenerate, create an updated prompt that incorporates their feedback

Return a JSON response with this structure:
{
  "response": "Your conversational response about the changes",
  "updatedPrompt": "The revised prompt if ready to regenerate (null otherwise)",
  "readyToRegenerate": true/false
}`
        : `You are a friendly, creative AI flyer designer having a conversation with a user to design their perfect flyer. 

Current flyer details collected so far:
Title: ${config.title || 'Not set yet'}
Subtitle: ${config.subtitle || 'Not set yet'}
Description: ${config.description || 'Not set yet'}
Style: ${config.style || 'Not set yet'}
Color Scheme: ${config.colorScheme || 'Not set yet'}

Your task:
1. Analyze the conversation and user's latest input
2. Ask clarifying questions to gather missing information
3. Make creative suggestions
4. Once you have enough information (at least title, description, and style), offer to generate the flyer
5. Keep responses conversational, friendly, and helpful
6. Use emojis occasionally to keep it fun

If the user seems ready and you have enough info, end your response with: "READY_TO_GENERATE"

Return a JSON response with this structure:
{
  "response": "Your conversational response here",
  "updatedConfig": {
    "title": "extracted title if mentioned",
    "subtitle": "extracted subtitle if mentioned",
    "description": "extracted description if mentioned",
    "style": "modern/vintage/minimalist/bold/professional/artistic if mentioned",
    "colorScheme": "extracted color preferences if mentioned"
  },
  "readyToGenerate": true/false
}`

      const aiResponse = await chatWithAI(`Conversation so far:\n${conversationContext}\n\nUser's latest message: ${userMessage}`, {
        systemPrompt,
        model: 'gemini-2.5-pro',
        jsonSchema: isEditMode ? {
          type: "object",
          properties: {
            response: { type: "string" },
            updatedPrompt: { type: "string" },
            readyToRegenerate: { type: "boolean" }
          },
          required: ["response", "readyToRegenerate"]
        } : {
          type: "object",
          properties: {
            response: { type: "string" },
            updatedConfig: {
              type: "object",
              properties: {
                title: { type: "string" },
                subtitle: { type: "string" },
                description: { type: "string" },
                style: { type: "string" },
                colorScheme: { type: "string" }
              }
            },
            readyToGenerate: { type: "boolean" }
          },
          required: ["response", "readyToGenerate"]
        }
      })

      // Handle edit mode responses
      if (isEditMode) {
        if (aiResponse.updatedPrompt) {
          setConfig(prev => ({ ...prev, finalPrompt: aiResponse.updatedPrompt }))
        }
        
        setIsTyping(false)
        addMessage('assistant', aiResponse.response)
        
        // If ready to regenerate, do it automatically
        if (aiResponse.readyToRegenerate && aiResponse.updatedPrompt) {
          setTimeout(() => regenerateFlyer(aiResponse.updatedPrompt), 500)
        }
      } else {
        // Update config with extracted information
        if (aiResponse.updatedConfig) {
          setConfig(prev => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(aiResponse.updatedConfig).filter(([_, v]) => v)
            )
          }))
        }

        setIsTyping(false)
        addMessage('assistant', aiResponse.response)

        // If ready to generate, show the preview button
        if (aiResponse.readyToGenerate) {
          setShowPreview(true)
        }
      }

    } catch (error) {
      console.error('Error in chat:', error)
      setIsTyping(false)
      addMessage('assistant', "Sorry, I had trouble understanding that. Could you please rephrase?")
    }
  }

  const generateFlyerPrompt = async () => {
    const systemPrompt = `You are an expert graphic designer creating a detailed image generation prompt for a flyer.`
    
    const userMessage = `Create a highly detailed, artistic prompt for a flyer with these specifications:
Title: ${config.title}
Subtitle: ${config.subtitle || 'None'}
Description: ${config.description}
Style: ${config.style}
Color Scheme: ${config.colorScheme}

Create a vivid, detailed prompt that will result in a stunning, professional flyer design. Include:
- Specific typography details
- Color palette with hex codes
- Layout and composition
- Visual elements and decorations
- Background design
- Overall aesthetic and mood
- Ensure it's portrait orientation (9:16)
- Make it visually striking and beautiful`

    try {
      const prompt = await chatWithAI(userMessage, {
        systemPrompt,
        model: 'gemini-2.5-pro'
      })
      return prompt
    } catch (error) {
      console.error('Failed to generate prompt:', error)
      throw error
    }
  }

  const generateFlyer = async () => {
    setIsGenerating(true)
    try {
      addMessage('assistant', '🎨 Creating your beautiful flyer now... This might take a moment.')
      
      // Generate detailed prompt with AI
      const flyerPrompt = await generateFlyerPrompt()
      setConfig(prev => ({ ...prev, finalPrompt: flyerPrompt }))
      
      // Call backend to generate image
      const response = await fetch('/api/generate-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: flyerPrompt,
          config: { ...config, quality: config.quality }
        })
      })

      if (!response.ok) throw new Error('Failed to generate flyer')
      
      const data = await response.json()
      setGeneratedFlyer(data.imageUrl)
      addMessage('assistant', '✨ Your flyer is ready! How does it look? Would you like me to adjust anything?')
      setIsEditMode(true) // Enable edit mode after generation
      toast.success('Flyer generated successfully!')
    } catch (error) {
      console.error('Error generating flyer:', error)
      addMessage('assistant', 'Sorry, there was an error creating your flyer. Please try again.')
      toast.error('Failed to generate flyer')
    } finally {
      setIsGenerating(false)
    }
  }

  const regenerateFlyer = async (newPrompt: string) => {
    setIsGenerating(true)
    try {
      addMessage('assistant', '🔄 Regenerating your flyer with the updated design...')
      
      // Call backend to generate image with new prompt
      const response = await fetch('/api/generate-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt,
          config: { ...config, quality: config.quality }
        })
      })

      if (!response.ok) throw new Error('Failed to regenerate flyer')
      
      const data = await response.json()
      setGeneratedFlyer(data.imageUrl)
      addMessage('assistant', '✨ Your updated flyer is ready! What do you think? Any other changes needed?')
      toast.success('Flyer regenerated successfully!')
    } catch (error) {
      console.error('Error regenerating flyer:', error)
      addMessage('assistant', 'Sorry, there was an error updating your flyer. Please try again.')
      toast.error('Failed to regenerate flyer')
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadFlyer = () => {
    if (!generatedFlyer) return
    
    const link = document.createElement('a')
    link.href = generatedFlyer
    link.download = `flyer-${Date.now()}.png`
    link.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            AI Flyer Designer
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Chat with AI to create your perfect flyer
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Chat Section */}
          <Card className="backdrop-blur-sm bg-white/90 dark:bg-gray-800/90 shadow-xl">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Bot className="w-6 h-6 text-purple-500" />
                  Design Chat
                </h2>
                {isEditMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('Start a new flyer? This will clear the current design.')) {
                        setMessages([{
                          id: '1',
                          role: 'assistant',
                          content: "Hi! I'm your AI flyer designer. Let's create something amazing together! 🎨\n\nWhat kind of flyer would you like to create today? (e.g., event poster, business flyer, party invitation, sale announcement)"
                        }])
                        setConfig({ quality: 'medium' })
                        setGeneratedFlyer(null)
                        setIsEditMode(false)
                        setShowPreview(false)
                      }
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Start New
                  </Button>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <div className="text-xs bg-purple-100 dark:bg-purple-900 px-3 py-1 rounded-full">
                  Quality: {qualities.find(q => q.value === config.quality)?.label}
                </div>
                <select 
                  className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full"
                  value={config.quality}
                  onChange={(e) => setConfig({...config, quality: e.target.value})}
                >
                  {qualities.map(q => (
                    <option key={q.value} value={q.value}>
                      {q.icon} {q.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Messages */}
            <div 
              ref={chatContainerRef}
              className="h-[500px] overflow-y-auto p-6 space-y-4"
              onScroll={checkIfNearBottom}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}>
                      {message.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-6 border-t">
              <div className="flex gap-2">
                <Input
                  placeholder="Describe your flyer idea..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && processUserInput()}
                  className="flex-1"
                />
                <Button onClick={processUserInput} size="icon">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {showPreview && !generatedFlyer && (
                <Button 
                  onClick={generateFlyer} 
                  className="w-full mt-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Your Flyer...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Flyer
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>

          {/* Preview Section */}
          <Card className="backdrop-blur-sm bg-white/90 dark:bg-gray-800/90 shadow-xl">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <Layout className="w-6 h-6 text-pink-500" />
                Preview
              </h2>
            </div>
            
            <div className="p-6">
              {/* Current Config Display */}
              {(config.title || config.style || config.colorScheme) && !generatedFlyer && (
                <div className="mb-6 space-y-3">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">Current Design:</h3>
                  {config.title && (
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-purple-500" />
                      <span className="text-sm"><strong>Title:</strong> {config.title}</span>
                    </div>
                  )}
                  {config.subtitle && (
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-purple-400" />
                      <span className="text-sm"><strong>Subtitle:</strong> {config.subtitle}</span>
                    </div>
                  )}
                  {config.description && (
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-purple-400" />
                      <span className="text-sm"><strong>Description:</strong> {config.description}</span>
                    </div>
                  )}
                  {config.style && (
                    <div className="flex items-center gap-2">
                      <Layout className="w-4 h-4 text-pink-500" />
                      <span className="text-sm"><strong>Style:</strong> {config.style}</span>
                    </div>
                  )}
                  {config.colorScheme && (
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-blue-500" />
                      <span className="text-sm"><strong>Colors:</strong> {config.colorScheme}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Flyer Display */}
              {generatedFlyer ? (
                <div className="space-y-4">
                  {isEditMode && (
                    <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-lg text-sm">
                      <strong>Edit Mode Active:</strong> Tell me what you'd like to change about the flyer
                    </div>
                  )}
                  <div className="relative aspect-[9/16] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg">
                    <Image
                      src={generatedFlyer}
                      alt="Generated flyer"
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={downloadFlyer} className="flex-1" variant="outline">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                    {!isEditMode && (
                      <Button 
                        onClick={() => {
                          setIsEditMode(true)
                          addMessage('assistant', 'I can help you refine this flyer! What would you like to change? You can ask for different colors, styles, text, or any other modifications.')
                        }}
                        className="flex-1"
                        variant="outline"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Edit Design
                      </Button>
                    )}
                  </div>
                  {config.finalPrompt && (
                    <details className="text-xs text-gray-500 dark:text-gray-400">
                      <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                        View generation prompt
                      </summary>
                      <p className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">{config.finalPrompt}</p>
                    </details>
                  )}
                </div>
              ) : (
                <div className="aspect-[9/16] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Sparkles className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 dark:text-gray-500">Your flyer will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}