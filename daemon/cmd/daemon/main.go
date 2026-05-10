package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	stdsync "sync"
	"syscall"

	"github.com/user/omni-fabric-daemon/internal/adapter"
	"github.com/user/omni-fabric-daemon/internal/config"
	"github.com/user/omni-fabric-daemon/internal/executor"
	dsync "github.com/user/omni-fabric-daemon/internal/sync"
)

func main() {
	cfg := config.Load()

	apiClient := dsync.NewAPIClient(cfg.APIBaseURL, cfg.AuthToken)
	wsClient := dsync.NewWSClient(cfg.APIURL, cfg.AuthToken)

	log.Printf("Daemon starting, API: %s (HTTP: %s)", cfg.APIURL, cfg.APIBaseURL)

	var wg stdsync.WaitGroup

	// Listen for execute_run messages from the API
	if err := wsClient.ListenForRuns(func(runID, harnessID string) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			executeRun(cfg, apiClient, runID, harnessID)
		}()
	}); err != nil {
		log.Fatalf("Failed to connect to daemon channel: %v", err)
	}

	log.Println("Daemon connected, waiting for runs...")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	wsClient.Close()
	wg.Wait()
	log.Println("Daemon shut down")
}

// executeRun fetches the harness and agents from the API, creates a state
// machine, and streams execution events back via a per-run WebSocket.
func executeRun(cfg config.Config, apiClient *dsync.APIClient, runID, harnessID string) {
	log.Printf("Starting run %s (harness %s)", runID, harnessID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Update run status to "running"
	if err := apiClient.UpdateRunStatus(runID, "running"); err != nil {
		log.Printf("Failed to update run status to running: %v", err)
	}

	// Fetch harness definition (includes project ID for agent lookup)
	harnessResult, err := apiClient.FetchHarness(harnessID)
	if err != nil {
		log.Printf("Failed to fetch harness %s: %v", harnessID, err)
		apiClient.UpdateRunStatus(runID, "failed")
		return
	}

	// Fetch agents for the project this harness belongs to
	agents, err := apiClient.FetchProjectAgents(harnessResult.ProjectID)
	if err != nil {
		log.Printf("Failed to fetch agents for project %s: %v", harnessResult.ProjectID, err)
		apiClient.UpdateRunStatus(runID, "failed")
		return
	}

	// Create per-run WebSocket for streaming events back to the API
	runWS := dsync.NewWSClient(cfg.APIURL, cfg.AuthToken)
	if err := runWS.Connect(runID); err != nil {
		log.Printf("Failed to connect run WS for %s: %v", runID, err)
		// Continue without streaming — the run will still execute
	}

	// Track active gate waits so we can route gate responses to the
	// correct goroutine.
	var gateMu stdsync.Mutex
	gateWaiters := make(map[string]chan bool)

	// Listen for gate responses on the per-run WS
	runWS.OnMessage(func(msg map[string]any) {
		msgType, _ := msg["type"].(string)
		if msgType != "gate" {
			return
		}
		nodeID, _ := msg["nodeId"].(string)
		action, _ := msg["action"].(string)
		if nodeID == "" {
			return
		}

		gateMu.Lock()
		ch, ok := gateWaiters[nodeID]
		gateMu.Unlock()

		if ok {
			ch <- action == "approve"
		}
	})

	// Create the Claude adapter
	exec := adapter.NewClaudeAdapter()

	// Build state machine callbacks
	callbacks := executor.Callbacks{
		OnNodeStatusChange: func(nodeID string, status executor.NodeStatus, attempt int, errMsg string) {
			msg := map[string]any{
				"type":    "node_status",
				"nodeId":  nodeID,
				"status":  string(status),
				"attempt": attempt,
			}
			if errMsg != "" {
				msg["error"] = errMsg
			}
			runWS.Send(msg)
		},

		OnNodeContext: func(nodeID string, ctx *executor.NodeContext) {
			runWS.Send(map[string]any{
				"type":    "node_context",
				"nodeId":  nodeID,
				"context": ctx,
			})
		},

		OnStreamEvent: func(nodeID string, event adapter.AgentEvent) {
			runWS.Send(map[string]any{
				"type":      "stream_event",
				"nodeId":    nodeID,
				"eventType": string(event.Type),
				"content":   event.Content,
				"toolName":  event.ToolName,
				"toolInput": event.ToolInput,
			})
		},

		OnGateWait: func(nodeID string, message string) bool {
			// Send gate_wait to the API/UI
			runWS.Send(map[string]any{
				"type":    "gate_wait",
				"nodeId":  nodeID,
				"message": message,
			})

			// Block until we receive a gate response or the run is cancelled
			ch := make(chan bool, 1)
			gateMu.Lock()
			gateWaiters[nodeID] = ch
			gateMu.Unlock()

			var approved bool
			select {
			case approved = <-ch:
			case <-ctx.Done():
				approved = false
			}

			gateMu.Lock()
			delete(gateWaiters, nodeID)
			gateMu.Unlock()

			return approved
		},

		OnDone: func(success bool) {
			cancel() // Unblock any gate waiters

			status := "completed"
			if !success {
				status = "failed"
			}

			runWS.Send(map[string]any{
				"type":   "status",
				"status": status,
			})

			if err := apiClient.UpdateRunStatus(runID, status); err != nil {
				log.Printf("Failed to update run status: %v", err)
			}

			runWS.Close()
		},
	}

	// Create and execute the state machine
	sm := executor.NewStateMachine(executor.Options{
		ProjectDir: cfg.ProjectDir,
		RunID:      runID,
		Harness:    *harnessResult.Definition,
		Agents:     agents,
		Executor:   exec,
		Callbacks:  callbacks,
	})

	if err := sm.Execute(); err != nil {
		log.Printf("State machine error for run %s: %v", runID, err)
		apiClient.UpdateRunStatus(runID, "failed")
		runWS.Close()
	}
}
