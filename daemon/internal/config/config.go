package config

import "os"

type Config struct {
	APIURL     string
	AuthToken  string
	ProjectDir string
}

func Load() Config {
	return Config{
		APIURL:     getEnv("API_URL", "ws://localhost:8080"),
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
