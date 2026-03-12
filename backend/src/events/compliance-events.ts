/**
 * Compliance event bus — bridges BullMQ workers to Socket.IO.
 *
 * Workers emit here; the socket plugin subscribes and re-emits to connected
 * clients over Socket.IO. This decouples workers (no direct import of the
 * Socket.IO server) while keeping everything in-process.
 *
 * Typed against `ServerToClientEvents` from `@hospici/shared-types` so the
 * compiler catches mismatched event payloads end-to-end.
 */

import { EventEmitter } from "node:events";
import type { ServerToClientEvents } from "@hospici/shared-types";

type EventPayload<K extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[K]>[0];

class ComplianceEventBus extends EventEmitter {
  override emit<K extends keyof ServerToClientEvents>(event: K, data: EventPayload<K>): boolean {
    return super.emit(event as string, data);
  }

  override on<K extends keyof ServerToClientEvents>(
    event: K,
    listener: (data: EventPayload<K>) => void,
  ): this {
    return super.on(event as string, listener);
  }

  override off<K extends keyof ServerToClientEvents>(
    event: K,
    listener: (data: EventPayload<K>) => void,
  ): this {
    return super.off(event as string, listener);
  }
}

export const complianceEvents = new ComplianceEventBus();
