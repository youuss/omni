package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	}

	log.Printf("Omni Fabric Daemon starting")
	log.Printf("API URL: %s", apiURL)

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigCh
	log.Printf("Received signal %v, shutting down...", sig)
}
