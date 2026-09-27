import { isAxiosError } from 'axios';

/**
 * Turns any thrown value into a message fit for a toast or form banner.
 * Understands DRF error bodies: {detail}, {field: [msgs]} and plain lists.
 */
export const getErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (!isAxiosError(error)) return error instanceof Error && error.message ? error.message : fallback;
  if (!error.response) return 'Cannot reach the server. Check your connection and try again.';

  const { status, data } = error.response;
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'The server ran into a problem. Please try again shortly.';

  if (typeof data === 'string' && data.length < 200) return data;
  if (Array.isArray(data)) return data.map(String).join(' ');
  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    if (typeof body.detail === 'string') return body.detail;
    const first = Object.entries(body)[0];
    if (first) {
      const [field, value] = first;
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      return field === 'non_field_errors' ? text : `${field}: ${text}`;
    }
  }
  return fallback;
};
