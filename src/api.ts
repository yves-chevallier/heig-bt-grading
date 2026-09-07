export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body != null ? { 'Content-Type': 'application/json' } : {}),
      'X-Requested-With': 'evaluation-tb',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || `Erreur ${response.status}`, response.status);
  }
  return response.json();
}

export async function fetchPdf(url: string): Promise<Blob> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      if (attempt === 2)
        throw new Error(
          'Le serveur est momentanément indisponible. Réessayez dans quelques instants.',
        );
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      continue;
    }
    // This GET is safe to retry when a connection reaches an instance being stopped.
    if (response.status === 503) {
      await response.body?.cancel();
      if (attempt === 2)
        throw new Error(
          'Le serveur est momentanément indisponible. Réessayez dans quelques instants.',
        );
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Le PDF n’a pas pu être généré. Veuillez réessayer.');
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('Le serveur n’a pas renvoyé de document PDF. Veuillez réessayer.');
    }
    return response.blob();
  }
  throw new Error('Le PDF n’a pas pu être généré. Veuillez réessayer.');
}
