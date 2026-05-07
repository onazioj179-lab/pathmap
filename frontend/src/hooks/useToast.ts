import { useCallback, useEffect, useState } from 'react';
import type { ToastKind, ToastMessage } from '../components/Toast';

interface ShowToastOptions {
  kind?: ToastKind;
  title: string;
  message?: string;
  durationMs?: number;
}

export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setMessages(current => current.filter(message => message.id !== id));
  }, []);

  const showToast = useCallback((options: ShowToastOptions) => {
    const id = crypto.randomUUID();
    const toast: ToastMessage = {
      id,
      kind: options.kind ?? 'info',
      title: options.title,
      message: options.message,
    };

    setMessages(current => [...current, toast].slice(-4));

    if (options.durationMs !== 0) {
      window.setTimeout(() => {
        setMessages(current => current.filter(message => message.id !== id));
      }, options.durationMs ?? 4200);
    }

    return id;
  }, []);

  useEffect(() => () => setMessages([]), []);

  return { messages, showToast, dismiss };
}
