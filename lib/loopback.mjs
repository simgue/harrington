// Whether a socket's remote address is this computer. Used to keep AI
// provider settings changeable only from the computer running Harrington
// until an access token protects /api/*. Never consult X-Forwarded-For for
// this: any client can set it.
import { isIPv4 } from 'node:net';

export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || !address) return false;
  let ip = address.toLowerCase();
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  // An IPv4 client on a dual-stack socket: ::ffff:127.0.0.1.
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  return isIPv4(ip) && ip.split('.')[0] === '127';
}
