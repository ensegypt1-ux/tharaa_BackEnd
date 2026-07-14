import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard API error envelope produced by HttpExceptionFilter.
 */
export class ApiErrorDto {
  @ApiProperty({ example: false, description: 'Always false for errors' })
  success: false;

  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Human-readable error message',
  })
  message: string;

  @ApiPropertyOptional({
    example: 'Bad Request',
    description: 'Optional machine-readable error code',
  })
  errorCode?: string;

  @ApiPropertyOptional({
    description: 'Optional extra details (e.g. validation messages)',
  })
  details?: unknown;

  @ApiProperty({
    example: '2026-07-14T00:00:00.000Z',
    description: 'ISO-8601 timestamp when the error was produced',
  })
  timestamp: string;

  @ApiProperty({
    example: '/api/v1/products',
    description: 'Request path that produced the error',
  })
  path: string;
}
