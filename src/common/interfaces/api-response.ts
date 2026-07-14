export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errorCode?: string;
  details?: unknown;
  timestamp: string;
  path: string;
}
