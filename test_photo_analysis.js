// Test photo analysis function
const testPhotoAnalysis = async () => {
  const testImageUrl = "https://images.unsplash.com/photo-1519125323398-675f0ddb6708?w=500";
  
  const analysisPrompt = `Analyze this photo and identify all people visible. For each person:
1. Describe their position in the image (far-left, left, center-left, center, center-right, right, far-right)
2. Provide a brief description of their appearance
3. Estimate their apparent age range (e.g., "20-25", "40s", "elderly")
4. Note their hair color and style
5. Describe their clothing
6. Note any distinguishing features
7. Describe their expression/mood
8. Also note if there are any pets, the background/setting, overall mood, and lighting

Return a detailed JSON response following the schema provided.`;

  const jsonSchema = {
    type: "object",
    properties: {
      peopleCount: { type: "number", description: "Total number of people in the photo" },
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier like 'person-1'" },
            position: { 
              type: "string", 
              enum: ["far-left", "left", "center-left", "center", "center-right", "right", "far-right"],
              description: "Position in the image"
            },
            positionDescription: { type: "string", description: "Natural description like 'person on the far left wearing blue'" },
            description: { type: "string", description: "Overall appearance description" },
            apparentAge: { type: "string", description: "Age range like '20-25' or '40s'" },
            gender: { type: "string", description: "Apparent gender if identifiable" },
            hairColor: { type: "string", description: "Hair color" },
            hairStyle: { type: "string", description: "Hair style/length" },
            distinguishingFeatures: { type: "string", description: "Notable features like glasses, beard, etc." },
            clothing: { type: "string", description: "What they're wearing" },
            expression: { type: "string", description: "Facial expression/mood" }
          },
          required: ["id", "position", "positionDescription", "description", "apparentAge", "hairColor", "hairStyle", "clothing", "expression"]
        }
      },
      hasPets: { type: "boolean", description: "Whether pets are visible" },
      petDescription: { type: "string", description: "Description of pets if present" },
      backgroundDescription: { type: "string", description: "Description of the background/environment" },
      setting: { type: "string", description: "Type of setting (outdoor park, beach, indoor, etc.)" },
      overallMood: { type: "string", description: "Overall mood/atmosphere of the photo" },
      lighting: { type: "string", description: "Lighting conditions" }
    },
    required: ["peopleCount", "people", "hasPets", "backgroundDescription", "setting", "overallMood", "lighting"]
  };

  try {
    const response = await fetch('/internal/call_mcp_tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: 'ai_chat',
        arguments: {
          messages: analysisPrompt,
          system_prompt: null,
          model: 'gemini-2.5-pro',
          include_thoughts: false,
          json_schema: jsonSchema,
          attachments: [testImageUrl]
        }
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    if (data.error && data.error !== "None" && data.error !== null) {
      throw new Error(data.error);
    }
    
    return data.result;
  } catch (error) {
    console.error('Photo analysis failed:', error);
    return null;
  }
};

// Run the test
console.log('Testing photo analysis...');
testPhotoAnalysis().then(result => {
  console.log('Analysis result:', result);
});