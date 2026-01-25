import React from 'react';
import { User, BookOpen, CheckCircle } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const steps = [
    { id: 1, label: 'Identitas Sekolah', icon: User },
    { id: 2, label: 'Detail Pelajaran', icon: BookOpen },
    { id: 3, label: 'Hasil Modul Ajar', icon: CheckCircle },
  ];

  return (
    <div className="flex justify-center mb-8 no-print">
      <div className="flex items-center w-full max-w-2xl">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center relative">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-colors duration-300 ${
                    isActive || isCompleted
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-300 text-slate-400'
                  }`}
                >
                  <Icon size={20} />
                </div>
                <span
                  className={`absolute -bottom-6 text-xs font-medium w-32 text-center ${
                    isActive || isCompleted ? 'text-blue-700' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-colors duration-300 ${
                    isCompleted ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                ></div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StepIndicator;