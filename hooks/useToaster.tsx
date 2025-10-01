import { useState } from 'react';
import Toaster from '@/components/Toaster';

export type ToasterType = 'success' | 'error' | 'info';

export function useToaster() {
  const [showToaster, setShowToaster] = useState(false);
  const [toasterMessage, setToasterMessage] = useState('');
  const [toasterType, setToasterType] = useState<ToasterType>('success');

  const showToasterMessage = (message: string, type: ToasterType) => {
    setToasterMessage(message);
    setToasterType(type);
    setShowToaster(true);

    // Auto-hide toaster after 3 seconds
    setTimeout(() => {
      setShowToaster(false);
    }, 3000);
  };

  const ToasterComponent = (
    <Toaster
      message={toasterMessage}
      type={toasterType}
      isVisible={showToaster}
      onClose={() => setShowToaster(false)}
    />
  );

  return {
    showToasterMessage,
    ToasterComponent,
    // Export state in case components need direct access
    toasterState: {
      showToaster,
      toasterMessage,
      toasterType,
      setShowToaster,
    },
  };
}
