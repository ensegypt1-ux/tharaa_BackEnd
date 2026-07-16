import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request } from 'express';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { AuthService } from './auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AdminAuditService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiResponse({ status: 201, description: 'Registered', type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email or phone' })
  @ApiResponse({ status: 200, description: 'Logged in', type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    if (
      result.user.role === 'ADMIN' ||
      result.user.role === 'MANAGER' ||
      result.user.role === 'EMPLOYEE'
    ) {
      await this.audit.log({
        userId: result.user.id,
        userRole: result.user.role,
        userEmail: result.user.email,
        action: 'AUTH_LOGIN',
        entityType: 'User',
        entityId: result.user.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return result;
  }

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Sign in with Google ID token' })
  @ApiResponse({ status: 200, description: 'Signed in', type: AuthTokensResponseDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  google(@Body() dto: GoogleAuthDto) {
    return this.authService.google(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue a new pair' })
  @ApiResponse({
    status: 200,
    description: 'Tokens rotated',
    type: AuthTokensResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('password/forgot')
  @ApiOperation({
    summary: 'Request a password reset token (dev stub logs token)',
  })
  @ApiResponse({
    status: 200,
    description: 'Reset requested',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('password/reset')
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset',
    type: ApiSuccessDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the given refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out', type: ApiSuccessDto })
  @ApiResponse({ status: 400, description: 'Bad Request', type: ApiErrorDto })
  @ApiResponse({ status: 401, description: 'Unauthorized', type: ApiErrorDto })
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: RefreshDto,
  ) {
    const result = await this.authService.logout(dto.refreshToken);
    if (
      user.role === 'ADMIN' ||
      user.role === 'MANAGER' ||
      user.role === 'EMPLOYEE'
    ) {
      await this.audit.log({
        userId: user.id,
        userRole: user.role,
        userEmail: user.email,
        action: 'AUTH_LOGOUT',
        entityType: 'User',
        entityId: user.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    return result;
  }
}
