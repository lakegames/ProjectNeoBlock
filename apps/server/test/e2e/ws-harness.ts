import crypto from 'node:crypto';

import { validateServerMessage, type Command, type MatchSnapshot, type ProtocolError, type ServerMessage } from '@neoblock/shared';
import { WebSocket } from 'ws';

type Waiter<T> = {
  predicate: (value: T) => boolean;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
  timeoutId: NodeJS.Timeout;
};

export type ClientMode = 'player' | 'spectator';

export class WsHarnessClient {
  readonly url: string;
  readonly userId: string;
  readonly displayName: string;
  readonly mode: ClientMode;
  readonly roomCode: string;

  private ws: WebSocket | null = null;
  private nextClientSeq: number;
  private waiters: Waiter<ServerMessage>[] = [];

  lastSnapshot: MatchSnapshot | null = null;
  lastError: ProtocolError | null = null;
  lastEventSeq: number = 0;
  receivedEvents: ServerMessage[] = [];

  constructor(input: {
    url: string;
    roomCode: string;
    userId: string;
    displayName: string;
    mode: ClientMode;
    nextClientSeq?: number;
  }) {
    this.url = input.url;
    this.roomCode = input.roomCode;
    this.userId = input.userId;
    this.displayName = input.displayName;
    this.mode = input.mode;
    this.nextClientSeq = input.nextClientSeq ?? 0;
  }

  get playerId() {
    const id = this.lastSnapshot?.room.members.find((m) => m.userId === this.userId || m.playerId === this.userId)?.playerId;
    return id ?? (this.userId as unknown as string);
  }

  get clientSeq() {
    return this.nextClientSeq;
  }

  async connect(input?: { resumeFromSeqExclusive?: number }) {
    if (this.ws) throw new Error('ALREADY_CONNECTED');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const parsed = JSON.parse(raw) as unknown;
      const validated = validateServerMessage(parsed);
      if (!validated.ok) throw new Error(`INVALID_SERVER_MESSAGE:${validated.issues.map((i) => `${i.path}:${i.message}`).join(',')}`);
      const msg = validated.value;
      this.receivedEvents.push(msg);
      if (msg.kind === 'snapshot') {
        this.lastSnapshot = msg.snapshot;
        this.lastEventSeq = msg.snapshot.cursor.lastEventSeq;
      }
      if (msg.kind === 'error') this.lastError = msg.error;
      this.dispatchWaiters(msg);
    });

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err) => reject(err));
    });

    const joinCommand: Extract<Command, { type: 'room/join' }> = {
      type: 'room/join',
      commandId: crypto.randomUUID(),
      clientSeq: 0,
      roomCode: this.roomCode,
      userId: this.userId,
      displayName: this.displayName,
      mode: this.mode,
      ...(input?.resumeFromSeqExclusive !== undefined ? { resumeFromSeqExclusive: input.resumeFromSeqExclusive as any } : {}),
    };

    this.sendRaw({ kind: 'command', command: joinCommand });
    await this.waitForSnapshot({ timeoutMs: 5_000 });
  }

  disconnect() {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.close();
    for (const w of this.waiters) clearTimeout(w.timeoutId);
    this.waiters = [];
  }

  async waitForMessage(predicate: (msg: ServerMessage) => boolean, timeoutMs: number) {
    return new Promise<ServerMessage>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      const waiter: Waiter<ServerMessage> = {
        predicate,
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          reject(err);
        },
        timeoutId,
      };
      this.waiters.push(waiter);
    });
  }

  async waitForSnapshot(input?: { predicate?: (s: MatchSnapshot) => boolean; timeoutMs?: number }) {
    const timeoutMs = input?.timeoutMs ?? 5_000;
    const predicate = input?.predicate ?? (() => true);
    if (this.lastSnapshot && predicate(this.lastSnapshot)) return this.lastSnapshot;
    const msg = await this.waitForMessage((m) => m.kind === 'snapshot' && predicate(m.snapshot), timeoutMs);
    return (msg as Extract<ServerMessage, { kind: 'snapshot' }>).snapshot;
  }

  async waitForError(input?: { predicate?: (e: ProtocolError) => boolean; timeoutMs?: number }) {
    const timeoutMs = input?.timeoutMs ?? 5_000;
    const predicate = input?.predicate ?? (() => true);
    if (this.lastError && predicate(this.lastError)) return this.lastError;
    const msg = await this.waitForMessage((m) => m.kind === 'error' && predicate(m.error), timeoutMs);
    return (msg as Extract<ServerMessage, { kind: 'error' }>).error;
  }

  sendCommand<T extends Command>(command: Omit<T, 'commandId' | 'clientSeq'> & Partial<Pick<T, 'commandId' | 'clientSeq'>>) {
    if (!this.ws) throw new Error('NOT_CONNECTED');
    const cmd: Command = {
      ...(command as any),
      commandId: command.commandId ?? crypto.randomUUID(),
      clientSeq: command.clientSeq ?? this.nextClientSeq,
    };
    this.sendRaw({ kind: 'command', command: cmd });
    if (command.clientSeq === undefined) this.nextClientSeq += 1;
    return cmd;
  }

  private sendRaw(msg: unknown) {
    if (!this.ws) throw new Error('NOT_CONNECTED');
    this.ws.send(JSON.stringify(msg));
  }

  private dispatchWaiters(msg: ServerMessage) {
    const remaining: Waiter<ServerMessage>[] = [];
    for (const waiter of this.waiters) {
      if (!waiter.predicate(msg)) {
        remaining.push(waiter);
        continue;
      }
      waiter.resolve(msg);
    }
    this.waiters = remaining;
  }
}
