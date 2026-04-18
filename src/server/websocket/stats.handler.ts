import { FastifyInstance } from 'fastify';
import type { WebSocket as WsWebSocket } from '@fastify/websocket';

interface WsClient {
  socket: WsWebSocket;
  subscriptions: Set<string>;
}

export function setupWebSocket(app: FastifyInstance) {
  const clients = new Set<WsClient>();

  app.get('/ws', { websocket: true }, (socket, _request) => {
    const client: WsClient = { socket, subscriptions: new Set() };
    clients.add(client);

    socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribe' && message.projectId) {
          client.subscriptions.add(message.projectId);
        } else if (message.type === 'unsubscribe' && message.projectId) {
          client.subscriptions.delete(message.projectId);
        }
      } catch {
        // Ignore invalid messages
      }
    });

    socket.on('close', () => {
      clients.delete(client);
    });
  });

  /** Broadcast a message to all clients subscribed to a project */
  function broadcast(projectId: string, message: any) {
    const data = JSON.stringify(message);
    for (const client of clients) {
      // WebSocket.OPEN === 1
      if (client.subscriptions.has(projectId) && client.socket.readyState === 1) {
        client.socket.send(data);
      }
    }
  }

  return { broadcast, clients };
}
