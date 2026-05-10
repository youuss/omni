package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for development; tighten in production.
		return true
	},
}

// WSHub manages WebSocket subscriptions per run ID.
type WSHub struct {
	mu    sync.RWMutex
	conns map[string]map[*websocket.Conn]bool
}

// NewWSHub creates a new WebSocket hub.
func NewWSHub() *WSHub {
	return &WSHub{
		conns: make(map[string]map[*websocket.Conn]bool),
	}
}

// Subscribe registers a connection for a given run ID.
func (h *WSHub) Subscribe(runID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[runID] == nil {
		h.conns[runID] = make(map[*websocket.Conn]bool)
	}
	h.conns[runID][conn] = true
}

// Unsubscribe removes a connection from a run ID.
func (h *WSHub) Unsubscribe(runID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.conns[runID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.conns, runID)
		}
	}
}

// Broadcast sends a JSON message to all connections subscribed to a run ID.
func (h *WSHub) Broadcast(runID string, msg any) {
	h.mu.RLock()
	conns := h.conns[runID]
	h.mu.RUnlock()

	if len(conns) == 0 {
		return
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("ws broadcast marshal error: %v", err)
		return
	}

	for conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("ws broadcast write error: %v", err)
			conn.Close()
			h.Unsubscribe(runID, conn)
		}
	}
}

// HandleWS upgrades an HTTP request to a WebSocket connection and subscribes
// it to the run ID from the URL. The connection is kept alive with a read loop.
func (h *WSHub) HandleWS(w http.ResponseWriter, r *http.Request) {
	// Extract runID from URL path: /api/ws/runs/{runId}
	runID := r.PathValue("runId")
	if runID == "" {
		http.Error(w, `{"error":"runId is required"}`, http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	h.Subscribe(runID, conn)
	defer func() {
		h.Unsubscribe(runID, conn)
		conn.Close()
	}()

	// Read loop to keep the connection alive. We discard all incoming messages.
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

// HandleDaemonWS upgrades an HTTP request to a persistent daemon WebSocket
// connection. The daemon subscribes to the special "daemon" channel and
// receives execute_run messages when new runs are created.
func (h *WSHub) HandleDaemonWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("daemon ws upgrade error: %v", err)
		return
	}

	h.Subscribe("daemon", conn)
	defer func() {
		h.Unsubscribe("daemon", conn)
		conn.Close()
	}()

	// Read loop to keep the connection alive. Read incoming messages from
	// the daemon (e.g. node status updates, stream events) and re-broadcast
	// them to the appropriate run channel.
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]any
		if json.Unmarshal(data, &msg) != nil {
			continue
		}

		// If the daemon sends a message with a runId, re-broadcast it
		// to that run's subscribers (the web UI).
		if runID, ok := msg["runId"].(string); ok && runID != "" {
			h.Broadcast(runID, msg)
		}
	}
}
