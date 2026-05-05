export function connectRunWS(
  runId: string,
  onMessage: (msg: unknown) => void,
  onClose?: () => void,
  onError?: (err: Event) => void,
): WebSocket {
  const wsUrl =
    (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080") +
    `/api/ws/runs/${runId}`;
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      onMessage(msg);
    } catch {
      // ignore non-JSON messages
    }
  };
  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    onError?.(err);
  };
  ws.onclose = () => {
    onClose?.();
  };
  return ws;
}
