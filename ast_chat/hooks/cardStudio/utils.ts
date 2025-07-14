"use client";

import { toast } from "sonner";
import { BACKEND_API_BASE_URL } from './constants';

// Email Helper Function
export async function sendThankYouEmail(toEmail: string, cardType: string, cardUrl: string) {
  console.log('📧 sendThankYouEmail called with:', { toEmail, cardType, cardUrl });
  
  // Type validation
  if (typeof toEmail !== 'string') {
    console.error('📧 sendThankYouEmail - toEmail is not a string:', typeof toEmail, toEmail);
    return;
  }
  
  if (!toEmail.trim()) {
    console.log('📧 sendThankYouEmail - toEmail is empty, returning');
    return;
  }
  
  try {
    // Create HTML email body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin-bottom: 10px;">🎉 Your Card is Ready!</h1>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi there!</p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Thank you for using VibeCarding to create your beautiful <strong>${cardType}</strong> card!
        </p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          We hope you love how it turned out. Your card has been generated and is ready for printing or sharing.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${cardUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Your Card
          </a>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          If you have any questions or feedback, feel free to reach out to us.
        </p>
        
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Happy card making!
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280;">
          <p style="margin-bottom: 5px;"><strong>Best regards,</strong></p>
          <p style="margin-bottom: 5px;">The VibeCarding Team</p>
          <p style="margin: 0;">
            <a href="mailto:vibecarding@ast.engineer" style="color: #2563eb; text-decoration: none;">vibecarding@ast.engineer</a>
          </p>
        </div>
      </div>
    `;

    // Plain text fallback
    const textBody = `Hi there!

Thank you for using VibeCarding to create your beautiful ${cardType} card!

We hope you love how it turned out. Your card has been generated and is ready for printing or sharing.

View your card: ${cardUrl}

If you have any questions or feedback, feel free to reach out to us.

Happy card making!

Best regards,
The VibeCarding Team
vibecarding@ast.engineer`;

    // Send to user
    console.log('📧 Attempting to send email to user:', toEmail);
    const userResponse = await fetch(`${BACKEND_API_BASE_URL}/send_email_nodejs_style`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({
        to: toEmail,
        from: 'vibecarding@ast.engineer',
        subject: `Your ${cardType} card is ready!`,
        body: htmlBody,
        text: textBody,
        html: htmlBody
      })
    });
    
    console.log('📧 User email response status:', userResponse.status);
    if (userResponse.ok) {
      const userResponseData = await userResponse.json();
      console.log('📧 User email response data:', userResponseData);
    }

    // Send copy to jordan@ast.engineer
    const adminResponse = await fetch(`${BACKEND_API_BASE_URL}/send_email_nodejs_style`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'jordan@ast.engineer',
        from: 'vibecarding@ast.engineer',
        subject: `Card Created - ${cardType} for ${toEmail}`,
        body: `<div style="font-family: Arial, sans-serif; padding: 20px;">
          <h3 style="color: #2563eb;">New Card Created on VibeCarding</h3>
          <p><strong>User:</strong> ${toEmail}</p>
          <p><strong>Card Type:</strong> ${cardType}</p>
          <p><strong>Card URL:</strong> <a href="${cardUrl}">${cardUrl}</a></p>
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
            This is an automated notification of card creation activity.
          </p>
        </div>`,
        text: `New card created on VibeCarding:

User: ${toEmail}
Card Type: ${cardType}
Card URL: ${cardUrl}

This is an automated notification of card creation activity.`
      })
    });

    if (userResponse.ok) {
      toast.success("✉️ Thank you email sent!");
    }
  } catch (error) {
    console.error('Failed to send thank you email:', error);
    // Don't show error toast - this is a nice-to-have feature
  }
}

// Chat Helper Function
export async function chatWithAI(userMessage: string, options: {
  systemPrompt?: string | null;
  model?: string;
  includeThoughts?: boolean;
  jsonSchema?: any;
  attachments?: string[];  // Add support for image attachments
} = {}) {
  const {
    systemPrompt = null,
    model = 'gemini-2.5-pro',
    includeThoughts = false,  // Default to false to avoid thinking content in responses
    jsonSchema = null,
    attachments = []  // Default to empty array
  } = options;
  
  console.log("🤖 chatWithAI called with:", {
    messageLength: userMessage.length,
    model,
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    hasJsonSchema: !!jsonSchema
  });
  
  try {
    const response = await fetch('/internal/call_mcp_tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'ai_chat',
        arguments: {
          messages: userMessage,
          system_prompt: systemPrompt,
          model: model,
          include_thoughts: includeThoughts,
          json_schema: jsonSchema,
          ...(attachments.length > 0 && { attachments })  // Only include if there are attachments
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("chatWithAI error response:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log("🤖 chatWithAI response data:", data);
    
    if (data.error && data.error !== "None" && data.error !== null) {
      throw new Error(data.error);
    }
    
    let result;
    if (typeof data.result === 'string') {
      try {
        result = JSON.parse(data.result);
      } catch {
        result = { status: 'error', message: 'Invalid JSON response' };
      }
    } else {
      result = data.result;
    }
    
    if (result.status === 'error') {
      throw new Error(result.message);
    }
    
    return result.response;
    
  } catch (error) {
    console.error('AI chat failed:', error);
    throw error;
  }
}

// Helper function to scroll to card preview
export const scrollToCardPreview = () => {
  setTimeout(() => {
    const cardPreviewElement = document.querySelector('[data-card-preview]');
    if (cardPreviewElement) {
      cardPreviewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 500);
};