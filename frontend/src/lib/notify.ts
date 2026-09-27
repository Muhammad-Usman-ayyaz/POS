import { toast } from 'sonner';

/** Single app-wide success toast (rendered by the mounted <Toaster />). */
export const notify = (message: string, durationMs = 3500) =>
  toast.success(message, { duration: durationMs });

export const notifyError = (message: string) => toast.error(message);
