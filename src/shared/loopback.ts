const LOOPBACK_HOST_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

export const isLoopbackHost = (hostName: string): boolean => LOOPBACK_HOST_NAMES.has(hostName)
