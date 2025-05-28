
/**
 * Normalizes a given URL string.
 * - Converts to HTTPS.
 * - Removes 'www.' prefix from hostname.
 * - Removes trailing slashes from pathname (unless it's the root path).
 * - Removes query parameters.
 * - Removes hash fragments.
 * - Converts the entire URL to lowercase.
 * - Resolves relative URLs against a base URL if provided.
 *
 * @param urlString The URL string to normalize.
 * @param baseUrl Optional base URL to resolve relative URLs.
 * @returns The normalized URL string, or null if normalization fails or input is invalid.
 */
export function normalizeUrl(urlString: string, baseUrl?: string): string | null {
  if (!urlString || typeof urlString !== 'string' || urlString.trim() === '') {
    // console.warn(`normalizeUrl: Input URL string is empty or invalid: "${urlString}"`);
    return null;
  }

  try {
    let resolvedUrl: URL;

    // Check if urlString is a Data URI, if so, return as is (or handle as error)
    if (urlString.startsWith('data:')) {
        // console.warn(`normalizeUrl: Input is a Data URI, not a standard URL: "${urlString.substring(0, 50)}..."`);
        return urlString; // Or return null if data URIs are not expected/allowed
    }

    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      if (!baseUrl) {
        console.warn(`normalizeUrl: Cannot normalize relative URL "${urlString}" without a base URL.`);
        // Attempt to treat as schemeless if it looks like a domain
        if (urlString.includes('.') && !urlString.includes(' ') && !urlString.startsWith('/')) {
            resolvedUrl = new URL(`https://${urlString}`);
        } else {
            return null; 
        }
      } else {
        try {
            // Ensure baseUrl itself is valid before using it
            new URL(baseUrl); 
            resolvedUrl = new URL(urlString, baseUrl);
        } catch (baseError) {
            console.warn(`normalizeUrl: Invalid base URL "${baseUrl}" provided for relative URL "${urlString}".`);
            return null;
        }
      }
    } else {
      resolvedUrl = new URL(urlString);
    }

    // Ensure HTTPS
    if (resolvedUrl.protocol === 'http:') {
      resolvedUrl.protocol = 'https:';
    }

    // Remove www.
    let hostname = resolvedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    // Assign back to URL object to affect href (important for toLowerCase later)
    resolvedUrl.hostname = hostname;


    // Remove trailing slash from pathname (if not root and has a path)
    if (resolvedUrl.pathname.length > 1 && resolvedUrl.pathname.endsWith('/')) {
      resolvedUrl.pathname = resolvedUrl.pathname.slice(0, -1);
    }

    // Remove query parameters
    resolvedUrl.search = '';

    // Remove hash fragment
    resolvedUrl.hash = '';
    
    // Return the href, which reflects changes to protocol, hostname, pathname, search, hash
    return resolvedUrl.href.toLowerCase();
  } catch (e) {
    console.warn(`normalizeUrl: Error normalizing URL "${urlString}" (Base: ${baseUrl || 'N/A'}): ${e instanceof Error ? e.message : String(e)}`);
    return null; 
  }
}
