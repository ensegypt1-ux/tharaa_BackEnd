import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Home' })
  label: string;

  @ApiProperty({ example: 'Ahmed Ali' })
  recipientName: string;

  @ApiProperty({ example: '+966500000000' })
  phone: string;

  @ApiProperty({ example: 'Al Khafji' })
  city: string;

  @ApiProperty({ example: 'Al Nakheel' })
  district: string;

  @ApiProperty({ example: 'King Fahd Road' })
  street: string;

  @ApiPropertyOptional({ nullable: true })
  building: string | null;

  @ApiPropertyOptional({ nullable: true })
  floor: string | null;

  @ApiPropertyOptional({ nullable: true })
  apartment: string | null;

  @ApiPropertyOptional({ nullable: true })
  directions: string | null;

  @ApiPropertyOptional({
    description: 'Google Places formatted address from the map picker',
    nullable: true,
  })
  formattedAddress: string | null;

  @ApiPropertyOptional({
    description: 'Google Place ID from the map picker',
    nullable: true,
  })
  googlePlaceId: string | null;

  @ApiPropertyOptional({ example: 28.4391, nullable: true })
  latitude: number | null;

  @ApiPropertyOptional({ example: 48.4913, nullable: true })
  longitude: number | null;

  @ApiProperty({ example: false })
  isDefault: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
