import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard API success envelope produced by ResponseInterceptor.
 */
export class ApiSuccessDto {
  @ApiProperty({ example: true, description: 'Always true for success' })
  success: true;

  @ApiProperty({
    description: 'Payload returned by the endpoint',
  })
  data: unknown;

  @ApiPropertyOptional({
    description: 'Optional pagination or extra metadata',
    type: 'object',
    additionalProperties: true,
  })
  meta?: Record<string, unknown>;
}
