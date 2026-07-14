import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { STORAGE_SERVICE, StorageService } from '../uploads/storage.service';
import { DeviceTokenDto, RemoveDeviceTokenDto } from './dto/device-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved',
    type: ApiSuccessDto,
  })
  getMe(@CurrentUser() user: User) {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('me/device-tokens')
  @ApiOperation({ summary: 'Register or refresh a push device token' })
  @ApiResponse({
    status: 201,
    description: 'Device token registered',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  registerDeviceToken(@CurrentUser() user: User, @Body() dto: DeviceTokenDto) {
    return this.usersService.registerDeviceToken(user.id, dto);
  }

  @Delete('me/device-tokens')
  @ApiOperation({ summary: 'Remove a push device token' })
  @ApiResponse({
    status: 200,
    description: 'Device token removed',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  removeDeviceToken(
    @CurrentUser() user: User,
    @Body() dto: RemoveDeviceTokenDto,
  ) {
    return this.usersService.removeDeviceToken(user.id, dto.token);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload current user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const saved = await this.storage.save(file.buffer, 'users', file.mimetype);

    return this.usersService.setAvatar(user.id, saved.path);
  }
}
