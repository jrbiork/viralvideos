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
    <div className="mt-4 w-full px-10 pr-24 pt-4 pb-4 mr-16">
      <div
        className="flex items-center justify-center h-full w-full"
        style={{ backgroundColor: '#090526' }}
      >
        <div
          className="flex items-center bg-slate-900 rounded-lg border border-slate-800"
          style={{
            display: 'flex',
            width: '100%',
            height: '3.5rem',
            padding: '1.0625rem 2rem',
            alignItems: 'center',
            justifyContent: 'space-evenly',
            flexShrink: 0,
          }}
        >
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center ${
                index === steps.length - 1 ? 'justify-end' : 'flex-1'
              }`}
            >
              {/* Step dot and label */}
              <div className="flex items-center space-x-3">
                <div
                  className={`w-5 h-5 rounded-full transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'bg-[#7552F2]'
                      : step.id < currentStep
                      ? 'bg-gray-600'
                      : 'bg-gray-600'
                  }`}
                ></div>
                <span
                  className={`text-base font-medium transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'text-[#7552F2] font-semibold'
                      : step.id < currentStep
                      ? 'text-gray-400'
                      : 'text-white'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line after each step (except the last one) */}
              {index < steps.length - 1 && (
                <div
                  className="flex-1 bg-gray-500 mx-6"
                  style={{ height: '0.0625rem' }}
                ></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
