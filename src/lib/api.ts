// Access token held strictly in JS memory (never stored in localStorage or sessionStorage)
let memoryAccessToken: string | null = null;

export function setMemoryAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  details?: Array<{ path: string; message: string }>;

  constructor(message: string, status: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'ExamVaultSPA' },
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.accessToken) {
        setMemoryAccessToken(data.accessToken);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRefresh?: boolean } = {}
): Promise<T> {
  const { skipAuthRefresh, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);
  headers.set('X-Requested-With', 'ExamVaultSPA');

  if (!(rest.body instanceof FormData) && !headers.has('Content-Type') && rest.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }

  let res = await fetch(path, {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !skipAuthRefresh && !path.includes('/api/auth/login') && !path.includes('/api/auth/refresh')) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      if (memoryAccessToken) {
        headers.set('Authorization', `Bearer ${memoryAccessToken}`);
      }
      res = await fetch(path, {
        ...rest,
        headers,
        credentials: 'include',
      });
    }
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let errorMsg = `Request failed (${res.status})`;
    let details: Array<{ path: string; message: string }> | undefined;
    if (contentType.includes('application/json')) {
      const body = await res.json().catch(() => ({}));
      errorMsg = body.error || errorMsg;
      details = body.details;
    }
    throw new ApiError(errorMsg, res.status, details);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadCsvReport(url: string, filename: string): Promise<void> {
  const headers = new Headers({ 'X-Requested-With': 'ExamVaultSPA' });
  if (memoryAccessToken) {
    headers.set('Authorization', `Bearer ${memoryAccessToken}`);
  }
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) {
    throw new Error('Failed to export report.');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
