import * as React from 'react';

import { Card } from './card';

export type RoomCardStatus = 'lobby' | 'playing' | 'ended';

export type RoomCardProps = {
  roomCode: string;
  status: RoomCardStatus;
  createdAtMs?: number;
  startedAtMs?: number | null;
  maxPlayers: number;
  turnTimeSec: number;
  enableAuto: boolean;
  enableAI: boolean;
  hostDisplayName: string;
  playerCount: number;
  spectatorCount: number;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

function statusLabel(status: RoomCardStatus) {
  if (status === 'lobby') return '大厅';
  if (status === 'playing') return '进行中';
  return '已结束';
}

export function RoomCard({ actions, style, ...room }: RoomCardProps) {
  const subtitle = `房主 ${room.hostDisplayName} · 玩家 ${room.playerCount}/${room.maxPlayers} · 观战 ${room.spectatorCount}`;
  const Badge = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 14,
        lineHeight: '20px',
        background: 'rgba(255,255,255,0.6)',
        color: 'var(--nb-color-primary-ink, #a02310)',
        border: '1px solid rgba(0,0,0,0.08)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );

  return (
    <Card
      className={room.className}
      radius={8}
      shadow={'0 0 1px rgba(0,0,0,0.2)'}
      border={'0'}
      style={{
        width: 395,
        maxWidth: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 100%), #ffe2cf',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 30, lineHeight: '44px', fontWeight: 700, color: 'var(--nb-color-fg, #312d2c)' }}>
              {room.roomCode}
            </div>
            <div style={{ marginTop: 4, fontSize: 18, lineHeight: '24px', color: 'var(--nb-color-muted-fg, #5a5756)' }}>
              {subtitle}
            </div>
          </div>
          {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge>{statusLabel(room.status)}</Badge>
          <Badge>回合 {room.turnTimeSec}s</Badge>
          <Badge>托管 {room.enableAuto ? '开' : '关'}</Badge>
          <Badge>AI {room.enableAI ? '开' : '关'}</Badge>
        </div>
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 10, rowGap: 6 }}>
          <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--nb-color-muted-fg, #5a5756)' }}>
            玩家：{room.playerCount}/{room.maxPlayers}
          </div>
          <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--nb-color-muted-fg, #5a5756)' }}>观战：{room.spectatorCount}</div>
          <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--nb-color-muted-fg, #5a5756)' }}>房主：{room.hostDisplayName}</div>
          <div style={{ fontSize: 14, lineHeight: '20px', color: 'var(--nb-color-muted-fg, #5a5756)' }}>创建：{room.createdAtMs ? new Date(room.createdAtMs).toLocaleString() : '-'}</div>
        </div>
      </div>
    </Card>
  );
}
