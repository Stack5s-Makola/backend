import { setDefaultAutoSelectFamilyAttemptTimeout } from 'net';

/**
 * Widens Node's happy-eyeballs budget before anything opens a socket.
 *
 * The Neon pooler resolves to three IPv6 and three IPv4 addresses. On a host
 * with no IPv6 route the v6 attempts fail instantly with ENETUNREACH, and the
 * v4 attempts need roughly 300ms from here - more than the 250ms Node allows
 * each attempt by default, so every one of them is cancelled and the whole
 * connect surfaces as ETIMEDOUT even though the database is reachable.
 */
export function widenConnectTimeout() {
  const ms = Number(process.env.SOCKET_CONNECT_ATTEMPT_TIMEOUT ?? 5000);

  setDefaultAutoSelectFamilyAttemptTimeout(Number.isFinite(ms) ? ms : 5000);
}
