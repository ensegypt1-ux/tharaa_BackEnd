import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email or phone number',
    example: 'user@example.com',
  })
  @IsString()
  identifier: string;
}
