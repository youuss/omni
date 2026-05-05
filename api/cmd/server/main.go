package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/user/omni-fabric-api/internal/config"
	"github.com/user/omni-fabric-api/internal/db"
	"github.com/user/omni-fabric-api/internal/router"
)

func main() {
	cfg := config.Load()

	// Connect to database
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := db.RunMigrations(database, "internal/db/migrations"); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}
	log.Println("database migrations applied")

	r := router.New(database, cfg.JWTSecret)

	log.Printf("API server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", cfg.Port), r); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
