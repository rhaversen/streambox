function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

export function log(...args: unknown[]): void {
  console.log(`[${ts()}]`, ...args)
}

export function warn(...args: unknown[]): void {
  console.warn(`[${ts()}]`, ...args)
}

export function error(...args: unknown[]): void {
  console.error(`[${ts()}]`, ...args)
}
