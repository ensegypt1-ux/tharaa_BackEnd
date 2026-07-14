import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: string | undefined;
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse) {
        const body = exceptionResponse as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          message = body.message.join(', ');
          details = body.message;
        } else if (typeof body.message === 'string') {
          message = body.message;
        } else {
          message = exception.message;
        }
        if (typeof body.error === 'string') {
          errorCode = body.error;
        }
        if (typeof body.errorCode === 'string') {
          errorCode = body.errorCode;
        }
        if (body.details !== undefined) {
          details = body.details;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = 'Internal server error';
    } else {
      this.logger.error('Unknown exception', exception as object);
      message = 'Internal server error';
    }

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message,
      ...(errorCode ? { errorCode } : {}),
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }
}
