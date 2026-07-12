interface ProgressStepsProps {
  currentStep: number;
}

export default function ProgressSteps({ currentStep }: ProgressStepsProps) {
  const steps = [
    { id: 1, label: 'Write your idea', shortLabel: 'Write' },
    { id: 2, label: 'Preview your video', shortLabel: 'Preview' },
    { id: 3, label: 'Export your story video', shortLabel: 'Export' },
  ];

  return (
    <div className="mt-4 w-full px-4 sm:px-10 sm:pr-24 pt-4 pb-4 sm:mr-16">
      <div
        className="flex items-center justify-center w-full"
        style={{ backgroundColor: '#090526' }}
      >
        <div
          className="flex items-center bg-slate-900 rounded-lg border border-slate-800 w-full h-auto sm:h-[3.5rem] py-3 px-3 sm:py-[1.0625rem] sm:px-8 flex-shrink-0"
          style={{
            justifyContent: 'space-evenly',
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
              <div className="flex items-center space-x-1.5 sm:space-x-3">
                <div
                  className={`w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full flex-shrink-0 transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'bg-[#7552F2]'
                      : step.id < currentStep
                      ? 'bg-gray-600'
                      : 'bg-gray-600'
                  }`}
                ></div>
                <span
                  className={`text-[11px] sm:text-base font-medium leading-tight transition-colors duration-200 ${
                    step.id === currentStep
                      ? 'text-[#7552F2] font-semibold'
                      : step.id < currentStep
                      ? 'text-gray-400'
                      : 'text-white'
                  }`}
                >
                  <span className="sm:hidden">{step.shortLabel}</span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </div>

              {/* Connector line after each step (except the last one) */}
              {index < steps.length - 1 && (
                <div
                  className="hidden sm:block flex-1 bg-gray-500 mx-6"
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
