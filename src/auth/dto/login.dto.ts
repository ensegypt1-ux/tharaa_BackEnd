import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email or phone number',
    example: 'user@example.com',
  })
  @IsString()
  identifier: string;

  @ApiProperty({ minLength: 6, example: 'secret1' })
  @IsString()
  @MinLength(6)
  password: string;
}
