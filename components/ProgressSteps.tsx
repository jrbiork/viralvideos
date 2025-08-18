interface ProgressStepsProps {
  currentStep: number;
}

export default function ProgressSteps({ currentStep }: ProgressStepsProps) {
  const steps = [
    { id: 1, label: 'Write your idea' },
    { id: 2, label: 'Preview your video' },
    { id: 3, label: 'Export your viral short' },
  ];

  return (
    <div className="mb-6 lg:mb-8">
      <div className="flex items-center justify-center">
        <div className="flex items-center bg-slate-900 rounded-lg px-6 py-4 border border-slate-800">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              {/* Step dot and label */}
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full transition-colors duration-200 ${
                    step.id <= currentStep ? 'bg-purple-600' : 'bg-gray-600'
                  }`}
                ></div>
                <span
                  className={`text-sm transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'text-purple-600 font-medium'
                      : step.id < currentStep
                      ? 'text-gray-400'
                      : 'text-gray-500'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="w-8 h-px bg-gray-700 mx-4"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
