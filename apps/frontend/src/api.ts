export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let detail = response.statusText;
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(payload.message)) {
      detail = payload.message.join("; ");
    } else if (payload.message) {
      detail = payload.message;
    } else if (payload.error) {
      detail = payload.error;
    }
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = response.statusText;
    }
  }

  throw new ApiError(
    `API request failed with status ${response.status}`,
    response.status,
    detail,
  );
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      accept: "application/json",
    },
  });
  return parseResponse<T>(response);
}

export async function postJson<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

export function encodeTextContent(value: string): string {
  return window.btoa(unescape(encodeURIComponent(value)));
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file."));
        return;
      }

      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(new Error("Unable to read file."));
    };
    reader.readAsDataURL(file);
  });
}
