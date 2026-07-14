import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ahmed Ali' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+966500000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ minLength: 6, example: 'secret1' })
  @IsString()
  @MinLength(6)
  password: string;
}
