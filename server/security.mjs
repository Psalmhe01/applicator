import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

// Reject private, loopback and reserved ranges before the server reads a job page.
export function publicIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}

// Only ordinary public HTTPS job links are allowed: no credentials, IP literals or custom ports.
export function validatePublicUrl(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    net.isIP(url.hostname.replace(/[\[\]]/g, '')) ||
    !url.hostname.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
  )
    throw new Error(
      'Use a public HTTPS job link. Local addresses and custom ports are not supported.',
    );
  return url;
}

// Pin each connection to a vetted IPv4 address; validate every redirect separately.
export async function fetchPublicPage(raw, redirects = 0) {
  const url = validatePublicUrl(raw);
  const addresses = await dns.resolve4(url.hostname);
  if (!addresses.length || addresses.some((a) => !publicIPv4(a)))
    throw new Error('This link resolves to a restricted address.');
  const result = await new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: 4,
        lookup: (_host, options, cb) =>
          options.all
            ? cb(null, [{ address: addresses[0], family: 4 }])
            : cb(null, addresses[0], 4),
        headers: {
          'User-Agent': 'Applicator/0.1 (personal job reader)',
          Accept: 'text/html,application/json',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          resolve({ redirect: res.headers.location });
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              'This site did not allow reading the advertisement. Paste its description instead.',
            ),
          );
          return;
        }
        if (
          !/(text\/html|application\/json|text\/plain)/i.test(res.headers['content-type'] || '')
        ) {
          res.resume();
          reject(new Error('This link is not a readable job page.'));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2_000_000) {
            req.destroy(new Error('This page is too large. Paste the job description instead.'));
          } else chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            html: Buffer.concat(chunks).toString('utf8'),
            url: url.href,
          }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(12000, () =>
      req.destroy(new Error('The site took too long. Paste the description instead.')),
    );
    req.on('error', reject);
  });
  if (result.redirect) {
    if (redirects >= 3) throw new Error('Too many redirects. Paste the description instead.');
    return fetchPublicPage(new URL(result.redirect, url).href, redirects + 1);
  }
  return result;
}
