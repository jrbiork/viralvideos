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
        <div className="flex items-center bg-slate-900 rounded-lg px-8 py-4 border border-slate-800 w-full max-w-4xl">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center flex-1 justify-center"
            >
              {/* Step dot and label */}
              <div className="flex items-center space-x-3">
                <div
                  className={`w-5 h-5 rounded-full transition-colors duration-200 ${
                    step.id <= currentStep ? 'bg-[#7552F2]' : 'bg-gray-600'
                  }`}
                ></div>
                <span
                  className={`text-base font-medium transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'text-[#7552F2] font-semibold'
                      : 'text-white'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="w-16 h-0.5 bg-gray-700 mx-6 flex-1"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
