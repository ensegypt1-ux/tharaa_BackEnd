import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkReassignProductsDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  productIds: string[];

  @ApiProperty({ description: 'Target main category or subcategory id' })
  @IsUUID()
  categoryId: string;
}
