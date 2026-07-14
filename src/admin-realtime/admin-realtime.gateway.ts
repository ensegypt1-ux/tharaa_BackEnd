import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AccountStatus, UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRealtimeService } from './admin-realtime.service';
import {
  ADMIN_ORDERS_ROOM,
  ADMIN_ROLE_ROOM_PREFIX,
} from './admin-realtime.types';

const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.EMPLOYEE,
];

function resolveCorsOrigin(): boolean | string[] {
  const origins = [
    ...(process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    ...(process.env.ADMIN_DASHBOARD_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ].filter((origin, index, all) => all.indexOf(origin) === index);

  return origins.includes('*') ? true : origins;
}

@WebSocketGateway({
  namespace: '/admin',
  cors: {
    origin: resolveCorsOrigin(),
    credentials: true,
  },
})
export class AdminRealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AdminRealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: AdminRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
    this.logger.log('Admin Socket.IO namespace /admin initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractAccessToken(client);
      if (!token) {
        this.logger.warn(
          `Admin socket rejected: missing token socketId=${client.id}`,
        );
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      let payload: JwtPayload;
      try {
        payload = this.jwtService.verify<JwtPayload>(token, {
          secret: this.config.getOrThrow<string>('jwt.accessSecret'),
        });
      } catch {
        this.logger.warn(
          `Admin socket rejected: invalid/expired JWT socketId=${client.id}`,
        );
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          deletedAt: null,
          status: AccountStatus.ACTIVE,
        },
        select: {
          id: true,
          role: true,
          email: true,
          fullName: true,
          status: true,
        },
      });

      if (!user || !STAFF_ROLES.includes(user.role)) {
        this.logger.warn(
          `Admin socket rejected: non-staff or inactive userId=${payload.sub} socketId=${client.id}`,
        );
        client.emit('error', { message: 'Forbidden' });
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        role: user.role,
        email: user.email,
      };

      await client.join(ADMIN_ORDERS_ROOM);
      await client.join(`${ADMIN_ROLE_ROOM_PREFIX}${user.role}`);

      this.logger.log(
        `Admin socket connected userId=${user.id} role=${user.role} socketId=${client.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Admin socket auth error socketId=${client.id}: ${(err as Error).message}`,
      );
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user as
      | { id?: string; role?: string }
      | undefined;
    this.logger.log(
      `Admin socket disconnected userId=${user?.id ?? 'unknown'} role=${user?.role ?? 'unknown'} socketId=${client.id}`,
    );
  }

  private extractAccessToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const authHeader = client.handshake.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.trim()) {
      return authHeader.replace(/^Bearer\s+/i, '').trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.replace(/^Bearer\s+/i, '').trim();
    }
    if (Array.isArray(queryToken) && typeof queryToken[0] === 'string') {
      return queryToken[0].replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }
}
