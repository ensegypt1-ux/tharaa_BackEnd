import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ApiErrorDto } from '../common/swagger/api-error.dto';
import { ApiSuccessDto } from '../common/swagger/api-success.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({
    status: 200,
    description: 'Service is alive',
    type: ApiSuccessDto,
  })
  check() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (database and Redis)' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready',
    type: ApiSuccessDto,
  })
  @ApiResponse({
    status: 503,
    description: 'Service Unavailable',
    type: ApiErrorDto,
  })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const redisPing = await this.redis.ping();
      if (redisPing !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      return {
        status: 'ok',
        checks: {
          database: 'up',
          redis: 'up',
        },
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        message:
          error instanceof Error ? error.message : 'Readiness check failed',
      });
    }
  }
}
