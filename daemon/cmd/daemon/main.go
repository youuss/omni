package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/user/omni-fabric-daemon/internal/config"
	"github.com/user/omni-fabric-daemon/internal/sync"
)

func main() {
	cfg := config.Load()

	wsClient := sync.NewWSClient(cfg.APIURL, cfg.AuthToken)
	wsClient.OnMessage(func(msg map[string]any) {
		log.Printf("Received: %v", msg)
	})

	log.Printf("Daemon starting, API: %s", cfg.APIURL)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	wsClient.Close()
	log.Println("Daemon shut down")
}
