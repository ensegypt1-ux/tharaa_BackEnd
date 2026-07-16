import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus, Locale, UserRole } from '@prisma/client';

export class PublicUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: '+966500000000', nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'Ahmed Ali' })
  fullName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: AccountStatus })
  status: AccountStatus;

  @ApiProperty({ enum: Locale })
  locale: Locale;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({
    description:
      'True for customers without a saved phone number; false otherwise',
  })
  requiresPhoneCompletion: boolean;

  @ApiProperty({
    description:
      'True when the customer has a full name, phone number, and at least one default address',
  })
  profileComplete: boolean;
}
