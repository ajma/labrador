import { useEffect, useRef, useCallback, useState } from 'react';

interface WebSocketMessage {
  type: string;
  projectId?: string;
  [key: string]: any;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(msg: WebSocketMessage) => void>>>(new Map());

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        const handlers = listenersRef.current.get(message.type);
        if (handlers) {
          handlers.forEach((handler) => handler(message));
        }
      } catch {
        // Ignore invalid messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const subscribe = useCallback((projectId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'subscribe', projectId }));
  }, []);

  const unsubscribe = useCallback((projectId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'unsubscribe', projectId }));
  }, []);

  const on = useCallback((type: string, handler: (msg: WebSocketMessage) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return { connected, subscribe, unsubscribe, on };
}
