package sync

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/user/omni-fabric-daemon/internal/executor"
)

// APIClient makes HTTP requests to the Omni Fabric API.
type APIClient struct {
	baseURL string
	token   string
	client  *http.Client
}

// NewAPIClient creates a new API client.
func NewAPIClient(baseURL, token string) *APIClient {
	return &APIClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		client:  &http.Client{},
	}
}

// apiHarness is the JSON shape returned by the API for a harness.
type apiHarness struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Definition any   `json:"definition"`
}

// apiAgent is the JSON shape returned by the API for an agent.
type apiAgent struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	SystemPrompt *string `json:"system_prompt,omitempty"`
	DefaultConfig any   `json:"default_config"`
}

// agentDefaultConfig is the expected shape of an agent's default_config.
type agentDefaultConfig struct {
	MaxTurns     int      `json:"maxTurns,omitempty"`
	AllowedTools []string `json:"allowedTools,omitempty"`
}

// FetchHarnessResult contains both the parsed harness definition and metadata.
type FetchHarnessResult struct {
	Definition *executor.HarnessDefinition
	ProjectID  string
}

// FetchHarness retrieves a harness definition from the API.
// Returns both the DAG definition and the project ID for agent resolution.
func (c *APIClient) FetchHarness(harnessID string) (*FetchHarnessResult, error) {
	url := fmt.Sprintf("%s/api/internal/harnesses/%s", c.baseURL, harnessID)

	body, err := c.get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch harness: %w", err)
	}

	var h apiHarness
	if err := json.Unmarshal(body, &h); err != nil {
		return nil, fmt.Errorf("unmarshal harness: %w", err)
	}

	// The definition field contains the full DAG definition as JSON.
	// Re-marshal and unmarshal into the executor type.
	defBytes, err := json.Marshal(h.Definition)
	if err != nil {
		return nil, fmt.Errorf("marshal definition: %w", err)
	}

	var def executor.HarnessDefinition
	if err := json.Unmarshal(defBytes, &def); err != nil {
		return nil, fmt.Errorf("unmarshal definition: %w", err)
	}

	// Ensure the ID is set from the harness record
	if def.ID == "" {
		def.ID = h.ID
	}

	return &FetchHarnessResult{
		Definition: &def,
		ProjectID:  h.ProjectID,
	}, nil
}

// FetchProjectAgents retrieves all agents for a project from the API.
func (c *APIClient) FetchProjectAgents(projectID string) ([]executor.AgentDefinition, error) {
	url := fmt.Sprintf("%s/api/internal/projects/%s/agents", c.baseURL, projectID)

	body, err := c.get(url)
	if err != nil {
		return nil, fmt.Errorf("fetch agents: %w", err)
	}

	var apiAgents []apiAgent
	if err := json.Unmarshal(body, &apiAgents); err != nil {
		return nil, fmt.Errorf("unmarshal agents: %w", err)
	}

	agents := make([]executor.AgentDefinition, 0, len(apiAgents))
	for _, a := range apiAgents {
		def := executor.AgentDefinition{
			ID:   a.ID,
			Name: a.Name,
		}

		// Parse default config for maxTurns and allowedTools
		if a.DefaultConfig != nil {
			cfgBytes, err := json.Marshal(a.DefaultConfig)
			if err == nil {
				var cfg agentDefaultConfig
				if json.Unmarshal(cfgBytes, &cfg) == nil {
					def.MaxTurns = cfg.MaxTurns
					def.AllowedTools = cfg.AllowedTools
				}
			}
		}

		agents = append(agents, def)
	}

	return agents, nil
}

// UpdateRunStatus sends a run status update to the API.
func (c *APIClient) UpdateRunStatus(runID, status string) error {
	url := fmt.Sprintf("%s/api/internal/runs/%s/status", c.baseURL, runID)
	payload := fmt.Sprintf(`{"status":"%s"}`, status)

	req, err := http.NewRequest("POST", url, strings.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("update run status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("update run status: %d %s", resp.StatusCode, string(body))
	}

	return nil
}

func (c *APIClient) get(url string) ([]byte, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
