import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AddWishlistItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;
}

export class ListWishlistDto extends PaginationDto {}
