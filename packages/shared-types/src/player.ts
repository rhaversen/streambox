export interface StreamInfo {
  loading: boolean
  duration: number
  title: string
  streamUrl?: string | null
  episode?: string
  errorMessage?: string
}
