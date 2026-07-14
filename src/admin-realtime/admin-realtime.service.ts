import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  ADMIN_ORDERS_ROOM,
  ADMIN_SOCKET_EVENTS,
  AdminOrderCreatedEvent,
  AdminOrderUpdatedEvent,
} from './admin-realtime.types';

@Injectable()
export class AdminRealtimeService {
  private readonly logger = new Logger(AdminRealtimeService.name);
  private server?: Server;

  setServer(server: Server) {
    this.server = server;
  }

  emitOrderCreated(payload: AdminOrderCreatedEvent) {
    if (!this.server) {
      this.logger.warn(
        `Skip ${ADMIN_SOCKET_EVENTS.ORDER_CREATED}: socket server not ready`,
      );
      return;
    }
    this.server
      .to(ADMIN_ORDERS_ROOM)
      .emit(ADMIN_SOCKET_EVENTS.ORDER_CREATED, payload);
    this.logger.log(
      `Emitted ${ADMIN_SOCKET_EVENTS.ORDER_CREATED} orderNumber=${payload.orderNumber}`,
    );
  }

  emitOrderUpdated(payload: AdminOrderUpdatedEvent) {
    if (!this.server) {
      this.logger.warn(
        `Skip ${ADMIN_SOCKET_EVENTS.ORDER_UPDATED}: socket server not ready`,
      );
      return;
    }
    this.server
      .to(ADMIN_ORDERS_ROOM)
      .emit(ADMIN_SOCKET_EVENTS.ORDER_UPDATED, payload);
    this.logger.log(
      `Emitted ${ADMIN_SOCKET_EVENTS.ORDER_UPDATED} orderNumber=${payload.orderNumber} status=${payload.status}`,
    );
  }
}
