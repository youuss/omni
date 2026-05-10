package config

import (
	"os"
	"strings"
)

type Config struct {
	APIURL     string // WebSocket URL, e.g. "ws://localhost:8080"
	APIBaseURL string // HTTP base URL, e.g. "http://localhost:8080"
	AuthToken  string
	ProjectDir string
}

func Load() Config {
	apiURL := getEnv("API_URL", "ws://localhost:8080")
	apiBaseURL := getEnv("API_BASE_URL", "")

	// Derive APIBaseURL from APIURL if not explicitly set
	if apiBaseURL == "" {
		apiBaseURL = strings.Replace(apiURL, "ws://", "http://", 1)
		apiBaseURL = strings.Replace(apiBaseURL, "wss://", "https://", 1)
	}

	return Config{
		APIURL:     apiURL,
		APIBaseURL: apiBaseURL,
		AuthToken:  getEnv("AUTH_TOKEN", ""),
		ProjectDir: getEnv("PROJECT_DIR", "."),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
