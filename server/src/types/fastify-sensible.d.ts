/// <reference types="@fastify/sensible" />

import 'fastify';

declare module '@fastify/sensible' {}

declare module 'fastify' {
  interface FastifyReply {
    badRequest(message?: string): this;
    forbidden(message?: string): this;
    internalServerError(message?: string): this;
    notFound(message?: string): this;
    unauthorized(message?: string): this;
  }
}

export {};
