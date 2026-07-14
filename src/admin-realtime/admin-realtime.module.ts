import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminRealtimeGateway } from './admin-realtime.gateway';
import { AdminRealtimeService } from './admin-realtime.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
  ],
  providers: [AdminRealtimeGateway, AdminRealtimeService],
  exports: [AdminRealtimeService],
})
export class AdminRealtimeModule {}
