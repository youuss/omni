package sync

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type WSClient struct {
	apiURL  string
	token   string
	conn    *websocket.Conn
	mu      sync.Mutex
	handler func(msg map[string]any)
	done    chan struct{}
}

func NewWSClient(apiURL, token string) *WSClient {
	return &WSClient{apiURL: apiURL, token: token, done: make(chan struct{})}
}

// Connect opens a WebSocket connection for a specific run.
func (c *WSClient) Connect(runID string) error {
	url := c.apiURL + "/api/ws/runs/" + runID
	return c.dial(url)
}

// ConnectDaemon opens a persistent WebSocket connection on the daemon channel.
func (c *WSClient) ConnectDaemon() error {
	url := c.apiURL + "/api/ws/daemon"
	return c.dial(url)
}

func (c *WSClient) dial(url string) error {
	header := map[string][]string{
		"Authorization": {"Bearer " + c.token},
	}
	conn, _, err := websocket.DefaultDialer.Dial(url, header)
	if err != nil {
		return err
	}
	c.conn = conn
	go c.readLoop()
	return nil
}

func (c *WSClient) readLoop() {
	defer close(c.done)
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			log.Printf("WS read error: %v", err)
			return
		}
		var msg map[string]any
		json.Unmarshal(data, &msg)
		if c.handler != nil {
			c.handler(msg)
		}
	}
}

func (c *WSClient) Send(msg any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return nil
	}
	return c.conn.WriteJSON(msg)
}

func (c *WSClient) OnMessage(handler func(msg map[string]any)) {
	c.handler = handler
}

// ListenForRuns connects to the daemon channel and calls the handler
// when an execute_run message is received.
func (c *WSClient) ListenForRuns(handler func(runID, harnessID string)) error {
	if err := c.ConnectDaemon(); err != nil {
		return err
	}

	c.OnMessage(func(msg map[string]any) {
		msgType, _ := msg["type"].(string)
		if msgType != "execute_run" {
			return
		}
		runID, _ := msg["runId"].(string)
		harnessID, _ := msg["harnessId"].(string)
		if runID == "" || harnessID == "" {
			log.Printf("Malformed execute_run message: %v", msg)
			return
		}
		log.Printf("Received execute_run: runId=%s harnessId=%s", runID, harnessID)
		handler(runID, harnessID)
	})

	return nil
}

func (c *WSClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
