package router

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/user/omni-fabric-api/internal/handler"
	"github.com/user/omni-fabric-api/internal/middleware"
	"github.com/user/omni-fabric-api/internal/repo"
)

func New(db *sql.DB, jwtSecret string) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Repos
	userRepo := repo.NewUserRepo(db)

	// Handlers
	authHandler := handler.NewAuthHandler(userRepo, jwtSecret)

	// Public routes
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	r.Post("/api/auth/register", authHandler.Register)
	r.Post("/api/auth/login", authHandler.Login)

	// Repos (protected)
	projectRepo := repo.NewProjectRepo(db)
	agentRepo := repo.NewAgentRepo(db)
	harnessRepo := repo.NewHarnessRepo(db)
	runRepo := repo.NewRunRepo(db)

	// Handlers (protected)
	projectHandler := handler.NewProjectHandler(projectRepo)
	agentHandler := handler.NewAgentHandler(agentRepo)
	harnessHandler := handler.NewHarnessHandler(harnessRepo)
	wsHub := handler.NewWSHub()
	runHandler := handler.NewRunHandler(runRepo, wsHub)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtSecret))

		r.Route("/api/projects", func(r chi.Router) {
			r.Get("/", projectHandler.List)
			r.Post("/", projectHandler.Create)
			r.Get("/{id}", projectHandler.Get)
			r.Put("/{id}", projectHandler.Update)
			r.Delete("/{id}", projectHandler.Delete)
		})

		r.Route("/api/projects/{projectId}/agents", func(r chi.Router) {
			r.Get("/", agentHandler.List)
			r.Post("/", agentHandler.Create)
			r.Get("/{id}", agentHandler.Get)
			r.Delete("/{id}", agentHandler.Delete)
		})

		r.Route("/api/projects/{projectId}/harnesses", func(r chi.Router) {
			r.Get("/", harnessHandler.List)
			r.Post("/", harnessHandler.Create)
			r.Get("/{id}", harnessHandler.Get)
			r.Put("/{id}", harnessHandler.UpdateDefinition)
			r.Delete("/{id}", harnessHandler.Delete)
		})

		r.Route("/api/harnesses/{harnessId}/runs", func(r chi.Router) {
			r.Post("/", runHandler.Create)
		})

		r.Route("/api/runs", func(r chi.Router) {
			r.Get("/{runId}", runHandler.Get)
			r.Get("/{runId}/logs", runHandler.GetLogs)
			r.Post("/{runId}/abort", runHandler.Abort)
			r.Post("/{runId}/gate/{nodeId}/approve", runHandler.GateApprove)
			r.Post("/{runId}/gate/{nodeId}/reject", runHandler.GateReject)
		})

		r.Get("/api/ws/runs/{runId}", wsHub.HandleWS)
	})

	return r
}
