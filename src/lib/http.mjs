export async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText}: ${text.slice(0, 200)}`
      );
    }

    return {
      data,
      headers: response.headers,
      status: response.status
    };
  } finally {
    clearTimeout(timer);
  }
}

export function ttlCache(defaultTtl = 300000) {
  const cache = new Map();

  return async function (key, fn, ttl = defaultTtl) {
    const hit = cache.get(key);

    if (hit && Date.now() - hit.at < ttl) {
      return hit.value;
    }

    const value = await fn();

    cache.set(key, {
      at: Date.now(),
      value
    });

    return value;
  };
}
