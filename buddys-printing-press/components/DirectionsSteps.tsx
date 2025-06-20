import React from 'react';

interface Step {
  html_instructions: string;
  distance: { text: string };
  duration: { text: string };
  // Add other step properties if needed, e.g., maneuver
}

interface DirectionsStepsProps {
  steps: Step[] | undefined;
  totalDuration?: string;
  totalDistance?: string;
}

const DirectionsSteps: React.FC<DirectionsStepsProps> = ({ steps, totalDuration, totalDistance }) => {
  if (!steps || steps.length === 0) {
    return null; // Or <p>No steps available.</p>
  }

  return (
    <div className="mt-4 p-3 border rounded-lg shadow bg-muted/30 max-h-96 overflow-y-auto text-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-foreground">Directions</h3>
        {(totalDuration || totalDistance) && (
          <div className="text-xs text-primary font-medium">
            {totalDistance && <span>{totalDistance}</span>}
            {totalDistance && totalDuration && <span className="mx-1">|</span>}
            {totalDuration && <span>{totalDuration}</span>}
          </div>
        )}
      </div>
      <ol className="list-decimal list-inside space-y-2">
        {steps.map((step, index) => (
          <li key={index} className="text-muted-foreground leading-relaxed">
            <span dangerouslySetInnerHTML={{ __html: step.html_instructions }} />
            <div className="text-xs text-muted-foreground/80 mt-1">
              <span>{step.distance.text}</span> | <span>{step.duration.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default DirectionsSteps; 