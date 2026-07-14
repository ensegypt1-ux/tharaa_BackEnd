import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCustomerStatusDto {
  @ApiProperty({ enum: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED] })
  @IsEnum(AccountStatus)
  status: AccountStatus;
}
