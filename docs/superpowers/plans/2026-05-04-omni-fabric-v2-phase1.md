# Omni Fabric v2 — Phase 1: Core Loop Web App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based agent orchestration platform with DAG editor, execution engine, and real-time monitoring — replacing the current Tauri desktop app.

**Architecture:** Cloud (Next.js frontend + Go API + PostgreSQL) communicates with a Local Daemon (Go binary) via WebSocket. The daemon runs agent CLIs on the user's machine and streams execution state back to the cloud.

**Tech Stack:** Go (Chi router), Next.js 16 (App Router), PostgreSQL 17, ReactFlow, Zustand, shadcn/ui, WebSocket

**Spec:** `docs/superpowers/specs/2026-05-04-omni-fabric-v2-design.md`

---

## File Structure

### Go API (`api/`)

| File | Responsibility |
|------|---------------|
| `api/cmd/server/main.go` | API server entry point |
| `api/internal/config/config.go` | Configuration loading (env vars) |
| `api/internal/db/db.go` | Database connection pool |
| `api/internal/db/migrations/001_init.sql` | Initial schema |
| `api/internal/handler/auth.go` | Register, login, JWT |
| `api/internal/handler/project.go` | Project CRUD handlers |
| `api/internal/handler/agent.go` | Agent CRUD handlers |
| `api/internal/handler/harness.go` | Harness CRUD handlers |
| `api/internal/handler/run.go` | Run creation, status, abort, gate approve/reject |
| `api/internal/handler/ws.go` | WebSocket hub and connection handler |
| `api/internal/middleware/auth.go` | JWT auth middleware |
| `api/internal/model/model.go` | Shared types (User, Project, Agent, Harness, Run) |
| `api/internal/repo/user.go` | User SQL queries |
| `api/internal/repo/project.go` | Project SQL queries |
| `api/internal/repo/agent.go` | Agent SQL queries |
| `api/internal/repo/harness.go` | Harness SQL queries |
| `api/internal/repo/run.go` | Run + execution log SQL queries |
| `api/internal/router/router.go` | Chi router setup with all routes |
| `api/go.mod` | Go module definition |

### Local Daemon (`daemon/`)

| File | Responsibility |
|------|---------------|
| `daemon/cmd/daemon/main.go` | Daemon entry point |
| `daemon/internal/config/config.go` | Daemon configuration |
| `daemon/internal/sync/ws.go` | WebSocket client to cloud API |
| `daemon/internal/executor/statemachine.go` | State machine (ported from TS) |
| `daemon/internal/executor/constraint.go` | Constraint checker (ported from TS) |
| `daemon/internal/executor/context.go` | Context resolver |
| `daemon/internal/executor/prompt.go` | Prompt assembler |
| `daemon/internal/executor/logger.go` | JSONL logger |
| `daemon/internal/adapter/adapter.go` | AgentExecutor interface |
| `daemon/internal/adapter/claude.go` | Claude Code CLI adapter |
| `daemon/go.mod` | Go module definition |

### Next.js Frontend (`web/`)

| File | Responsibility |
|------|---------------|
| `web/package.json` | Dependencies |
| `web/next.config.ts` | Next.js configuration |
| `web/tailwind.config.ts` | Tailwind CSS v4 config with OKLCH design tokens |
| `web/app/layout.tsx` | Root layout (fonts, global styles, providers) |
| `web/app/(auth)/login/page.tsx` | Login page |
| `web/app/(auth)/register/page.tsx` | Register page |
| `web/app/projects/page.tsx` | Project list |
| `web/app/projects/new/page.tsx` | Create project |
| `web/app/projects/[projectId]/layout.tsx` | Project layout (sidebar) |
| `web/app/projects/[projectId]/page.tsx` | Project overview |
| `web/app/projects/[projectId]/agents/page.tsx` | Agent list |
| `web/app/projects/[projectId]/harnesses/page.tsx` | Harness list |
| `web/app/projects/[projectId]/harnesses/[harnessId]/page.tsx` | Harness editor (ReactFlow) |
| `web/app/projects/[projectId]/runs/page.tsx` | Run list |
| `web/app/projects/[projectId]/runs/[runId]/page.tsx` | Run detail (DAG status + output) |
| `web/components/ui/` | shadcn/ui components |
| `web/components/harness/HarnessCanvas.tsx` | ReactFlow canvas |
| `web/components/harness/AgentNode.tsx` | Agent node component |
| `web/components/harness/ConditionNode.tsx` | Condition node component |
| `web/components/harness/GateNode.tsx` | Gate node component |
| `web/components/harness/NodeConfigPanel.tsx` | Node config drawer |
| `web/components/harness/AgentPalette.tsx` | Draggable agent list |
| `web/components/run/ExecutionView.tsx` | DAG execution status overlay |
| `web/components/run/OutputPanel.tsx` | Streaming output panel |
| `web/components/run/GateApproval.tsx` | Gate checkpoint UI |
| `web/lib/api.ts` | API client (fetch wrapper) |
| `web/lib/ws.ts` | WebSocket client |
| `web/stores/auth.ts` | Auth state (JWT, user) |
| `web/stores/project.ts` | Current project state |
| `web/stores/harness.ts` | Harness editor state |
| `web/stores/run.ts` | Run execution state |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `api/go.mod`, `api/cmd/server/main.go`
- Create: `daemon/go.mod`, `daemon/cmd/daemon/main.go`
- Create: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/tailwind.config.ts`
- Create: `docker-compose.yml`

- [ ] **Step 1: Initialize Go API module**

```bash
cd /Users/eric/Desktop/projects/omni-fabric
mkdir -p api/cmd/server api/internal
cd api
go mod init github.com/user/omni-fabric-api
go get github.com/go-chi/chi/v5 github.com/go-chi/cors github.com/lib/pq github.com/golang-jwt/jwt/v5 github.com/gorilla/websocket github.com/google/uuid golang.org/x/crypto/bcrypt
```

- [ ] **Step 2: Create API server entry point**

```go
// api/cmd/server/main.go
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	log.Printf("API server starting on :%s", port)
	http.ListenAndServe(fmt.Sprintf(":%s", port), r)
}
```

- [ ] **Step 3: Initialize Local Daemon module**

```bash
cd /Users/eric/Desktop/projects/omni-fabric
mkdir -p daemon/cmd/daemon daemon/internal
cd daemon
go mod init github.com/user/omni-fabric-daemon
go get github.com/gorilla/websocket github.com/google/uuid
```

- [ ] **Step 4: Create Daemon entry point**

```go
// daemon/cmd/daemon/main.go
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
		apiURL = "ws://localhost:8080"
	}
	log.Printf("Daemon starting, connecting to %s", apiURL)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Daemon shutting down")
}
```

- [ ] **Step 5: Initialize Next.js frontend**

```bash
cd /Users/eric/Desktop/projects/omni-fabric
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
cd web
npm install @xyflow/react zustand lucide-react clsx tailwind-merge
npm install -D @types/node
```

- [ ] **Step 6: Create docker-compose.yml**

```yaml
# docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: omnifabric
      POSTGRES_PASSWORD: omnifabric
      POSTGRES_DB: omnifabric
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 7: Commit scaffolding**

```bash
git add api/ daemon/ web/ docker-compose.yml
git commit -m "feat: scaffold v2 project structure (Go API, daemon, Next.js)"
```

---

## Task 2: Database Schema

**Files:**
- Create: `api/internal/db/db.go`
- Create: `api/internal/db/migrations/001_init.sql`
- Create: `api/internal/config/config.go`

- [ ] **Step 1: Write migration SQL**

```sql
-- api/internal/db/migrations/001_init.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    system_prompt TEXT,
    tags TEXT[] DEFAULT '{}',
    is_builtin BOOLEAN DEFAULT FALSE,
    default_config JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE harnesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    is_template BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harness_id UUID REFERENCES harnesses(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    trigger_type VARCHAR(50) DEFAULT 'manual',
    input JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
    node_id VARCHAR(255) NOT NULL,
    attempt INTEGER DEFAULT 1,
    log_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_harnesses_project ON harnesses(project_id);
CREATE INDEX idx_runs_harness ON runs(harness_id);
CREATE INDEX idx_execution_logs_run ON execution_logs(run_id);
```

- [ ] **Step 2: Write config loader**

```go
// api/internal/config/config.go
package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
}

func Load() Config {
	return Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://omnifabric:omnifabric@localhost:5432/omnifabric?sslmode=disable"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-secret-change-in-production"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 3: Write database connection pool**

```go
// api/internal/db/db.go
package db

import (
	"database/sql"
	"fmt"
	"os"

	_ "github.com/lib/pq"
)

func Connect(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	return db, nil
}

func RunMigrations(db *sql.DB, migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		content, err := os.ReadFile(migrationsDir + "/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		if _, err := db.Exec(string(content)); err != nil {
			return fmt.Errorf("execute migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}
```

- [ ] **Step 4: Wire DB into server main.go**

Update `api/cmd/server/main.go` to load config, connect to DB, run migrations, then start server.

- [ ] **Step 5: Run migration against local PostgreSQL**

```bash
docker-compose up -d postgres
cd api && go run cmd/server/main.go
# Verify: server starts, connects to DB, runs migrations
```

- [ ] **Step 6: Commit**

```bash
git add api/internal/db/ api/internal/config/ api/cmd/server/main.go
git commit -m "feat: database schema and connection layer"
```

---

## Task 3: Auth (Register + Login + JWT Middleware)

**Files:**
- Create: `api/internal/model/model.go`
- Create: `api/internal/repo/user.go`
- Create: `api/internal/handler/auth.go`
- Create: `api/internal/middleware/auth.go`
- Modify: `api/internal/router/router.go`

- [ ] **Step 1: Write model types**

```go
// api/internal/model/model.go
package model

import "time"

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatar_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Agent struct {
	ID            string   `json:"id"`
	ProjectID     string   `json:"project_id"`
	Name          string   `json:"name"`
	Description   *string  `json:"description,omitempty"`
	SystemPrompt  *string  `json:"system_prompt,omitempty"`
	Tags          []string `json:"tags"`
	IsBuiltin     bool     `json:"is_builtin"`
	DefaultConfig any      `json:"default_config"`
}

type Harness struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Definition  any     `json:"definition"`
	IsTemplate  bool    `json:"is_template"`
	Tags        []string `json:"tags"`
}

type Run struct {
	ID          string     `json:"id"`
	HarnessID   string     `json:"harness_id"`
	Status      string     `json:"status"`
	TriggerType string     `json:"trigger_type"`
	Input       any        `json:"input"`
	Metrics     any        `json:"metrics"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedBy   *string    `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}
```

- [ ] **Step 2: Write user repository**

```go
// api/internal/repo/user.go
package repo

import (
	"database/sql"
	"github.com/user/omni-fabric-api/internal/model"
)

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(email, name, passwordHash string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(
		`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
		 RETURNING id, email, name, avatar_url, created_at`,
		email, name, passwordHash,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) GetByEmail(email string) (*model.User, string, error) {
	var u model.User
	var hash string
	err := r.db.QueryRow(
		`SELECT id, email, name, avatar_url, created_at, password_hash FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt, &hash)
	if err != nil {
		return nil, "", err
	}
	return &u, hash, nil
}

func (r *UserRepo) GetByID(id string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(
		`SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
```

- [ ] **Step 3: Write auth handler**

```go
// api/internal/handler/auth.go
package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"github.com/user/omni-fabric-api/internal/repo"
)

type AuthHandler struct {
	userRepo  *repo.UserRepo
	jwtSecret string
}

func NewAuthHandler(ur *repo.UserRepo, secret string) *AuthHandler {
	return &AuthHandler{userRepo: ur, jwtSecret: secret}
}

type registerRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  interface{} `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, 400)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error":"internal"}`, 500)
		return
	}
	user, err := h.userRepo.Create(req.Email, req.Name, string(hash))
	if err != nil {
		http.Error(w, `{"error":"email already exists"}`, 409)
		return
	}
	token, err := h.generateToken(user.ID)
	if err != nil {
		http.Error(w, `{"error":"internal"}`, 500)
		return
	}
	json.NewEncoder(w).Encode(authResponse{Token: token, User: user})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, 400)
		return
	}
	user, hash, err := h.userRepo.GetByEmail(req.Email)
	if err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, 401)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		http.Error(w, `{"error":"invalid credentials"}`, 401)
		return
	}
	token, err := h.generateToken(user.ID)
	if err != nil {
		http.Error(w, `{"error":"internal"}`, 500)
		return
	}
	json.NewEncoder(w).Encode(authResponse{Token: token, User: user})
}

func (h *AuthHandler) generateToken(userID string) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
```

- [ ] **Step 4: Write JWT middleware**

```go
// api/internal/middleware/auth.go
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserIDKey contextKey = "userID"

func Auth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			if !strings.HasPrefix(auth, "Bearer ") {
				http.Error(w, `{"error":"unauthorized"}`, 401)
				return
			}
			tokenStr := strings.TrimPrefix(auth, "Bearer ")
			claims := &jwt.RegisteredClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"error":"unauthorized"}`, 401)
				return
			}
			ctx := context.WithValue(r.Context(), UserIDKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(r *http.Request) string {
	if v, ok := r.Context().Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}
```

- [ ] **Step 5: Write router and wire everything**

```go
// api/internal/router/router.go
package router

import (
	"database/sql"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/user/omni-fabric-api/internal/handler"
	"github.com/user/omni-fabric-api/internal/middleware"
	"github.com/user/omni-fabric-api/internal/repo"
)

func New(db *sql.DB, jwtSecret string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Repos
	userRepo := repo.NewUserRepo(db)

	// Handlers
	authHandler := handler.NewAuthHandler(userRepo, jwtSecret)

	// Public routes
	r.Route("/api", func(r chi.Router) {
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/login", authHandler.Login)

		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{"status":"ok"}`))
		})

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.Auth(jwtSecret))
			// Add protected routes here in later tasks
		})
	})

	return r
}
```

Update `api/cmd/server/main.go` to use the router:

```go
// api/cmd/server/main.go
package main

import (
	"log"
	"net/http"

	"github.com/user/omni-fabric-api/internal/config"
	"github.com/user/omni-fabric-api/internal/db"
	"github.com/user/omni-fabric-api/internal/router"
)

func main() {
	cfg := config.Load()

	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	if err := db.RunMigrations(database, "internal/db/migrations"); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	r := router.New(database, cfg.JWTSecret)

	log.Printf("API server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
```

- [ ] **Step 6: Test auth endpoints**

```bash
# Start server
cd api && go run cmd/server/main.go

# Register
curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test","password":"pass123"}'

# Login
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123"}'
```

- [ ] **Step 7: Commit**

```bash
git add api/
git commit -m "feat: auth system with JWT (register, login, middleware)"
```

---

## Task 4: Projects CRUD

**Files:**
- Create: `api/internal/repo/project.go`
- Create: `api/internal/handler/project.go`
- Modify: `api/internal/router/router.go`

- [ ] **Step 1: Write project repository**

```go
// api/internal/repo/project.go
package repo

import (
	"database/sql"
	"github.com/user/omni-fabric-api/internal/model"
)

type ProjectRepo struct {
	db *sql.DB
}

func NewProjectRepo(db *sql.DB) *ProjectRepo {
	return &ProjectRepo{db: db}
}

func (r *ProjectRepo) Create(name, description, ownerID string) (*model.Project, error) {
	var p model.Project
	err := r.db.QueryRow(
		`INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3)
		 RETURNING id, name, description, owner_id, created_at, updated_at`,
		name, description, ownerID,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProjectRepo) ListByOwner(ownerID string) ([]model.Project, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, owner_id, created_at, updated_at
		 FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []model.Project
	for rows.Next() {
		var p model.Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func (r *ProjectRepo) GetByID(id string) (*model.Project, error) {
	var p model.Project
	err := r.db.QueryRow(
		`SELECT id, name, description, owner_id, created_at, updated_at
		 FROM projects WHERE id = $1`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProjectRepo) Update(id, name, description string) (*model.Project, error) {
	var p model.Project
	err := r.db.QueryRow(
		`UPDATE projects SET name = $2, description = $3, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, name, description, owner_id, created_at, updated_at`,
		id, name, description,
	).Scan(&p.ID, &p.Name, &p.Description, &p.OwnerID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *ProjectRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM projects WHERE id = $1`, id)
	return err
}
```

- [ ] **Step 2: Write project handler**

```go
// api/internal/handler/project.go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/user/omni-fabric-api/internal/middleware"
	"github.com/user/omni-fabric-api/internal/repo"
)

type ProjectHandler struct {
	repo *repo.ProjectRepo
}

func NewProjectHandler(r *repo.ProjectRepo) *ProjectHandler {
	return &ProjectHandler{repo: r}
}

type createProjectReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createProjectReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, 400)
		return
	}
	userID := middleware.GetUserID(r)
	project, err := h.repo.Create(req.Name, req.Description, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to create project"}`, 500)
		return
	}
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(project)
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projects, err := h.repo.ListByOwner(userID)
	if err != nil {
		http.Error(w, `{"error":"failed to list projects"}`, 500)
		return
	}
	if projects == nil {
		projects = []model.Project{}
	}
	json.NewEncoder(w).Encode(projects)
}

func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	project, err := h.repo.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	json.NewEncoder(w).Encode(project)
}

func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req createProjectReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid body"}`, 400)
		return
	}
	project, err := h.repo.Update(id, req.Name, req.Description)
	if err != nil {
		http.Error(w, `{"error":"failed to update"}`, 500)
		return
	}
	json.NewEncoder(w).Encode(project)
}

func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.repo.Delete(id); err != nil {
		http.Error(w, `{"error":"failed to delete"}`, 500)
		return
	}
	w.WriteHeader(204)
}
```

- [ ] **Step 3: Register project routes in router**

Add to the protected routes group in `api/internal/router/router.go`:

```go
projectRepo := repo.NewProjectRepo(db)
projectHandler := handler.NewProjectHandler(projectRepo)

r.Route("/projects", func(r chi.Router) {
    r.Get("/", projectHandler.List)
    r.Post("/", projectHandler.Create)
    r.Get("/{id}", projectHandler.Get)
    r.Put("/{id}", projectHandler.Update)
    r.Delete("/{id}", projectHandler.Delete)
})
```

- [ ] **Step 4: Test projects CRUD**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"pass123"}' | jq -r .token)

curl -s http://localhost:8080/api/projects -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:8080/api/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Test project"}'
```

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "feat: projects CRUD API"
```

---

## Task 5: Agents & Harnesses CRUD

**Files:**
- Create: `api/internal/repo/agent.go`
- Create: `api/internal/repo/harness.go`
- Create: `api/internal/handler/agent.go`
- Create: `api/internal/handler/harness.go`
- Modify: `api/internal/router/router.go`

- [ ] **Step 1: Write agent repository**

```go
// api/internal/repo/agent.go
package repo

import (
	"database/sql"
	"encoding/json"
	"github.com/user/omni-fabric-api/internal/model"
)

type AgentRepo struct {
	db *sql.DB
}

func NewAgentRepo(db *sql.DB) *AgentRepo {
	return &AgentRepo{db: db}
}

func (r *AgentRepo) Create(a *model.Agent) error {
	configJSON, _ := json.Marshal(a.DefaultConfig)
	return r.db.QueryRow(
		`INSERT INTO agents (project_id, name, description, system_prompt, tags, is_builtin, default_config, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		a.ProjectID, a.Name, a.Description, a.SystemPrompt, a.Tags, a.IsBuiltin, configJSON, nil,
	).Scan(&a.ID)
}

func (r *AgentRepo) ListByProject(projectID string) ([]model.Agent, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, name, description, system_prompt, tags, is_builtin, default_config
		 FROM agents WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []model.Agent
	for rows.Next() {
		var a model.Agent
		var configJSON []byte
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Name, &a.Description, &a.SystemPrompt, &a.Tags, &a.IsBuiltin, &configJSON); err != nil {
			return nil, err
		}
		json.Unmarshal(configJSON, &a.DefaultConfig)
		agents = append(agents, a)
	}
	return agents, nil
}

func (r *AgentRepo) GetByID(id string) (*model.Agent, error) {
	var a model.Agent
	var configJSON []byte
	err := r.db.QueryRow(
		`SELECT id, project_id, name, description, system_prompt, tags, is_builtin, default_config
		 FROM agents WHERE id = $1`, id,
	).Scan(&a.ID, &a.ProjectID, &a.Name, &a.Description, &a.SystemPrompt, &a.Tags, &a.IsBuiltin, &configJSON)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(configJSON, &a.DefaultConfig)
	return &a, nil
}

func (r *AgentRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM agents WHERE id = $1`, id)
	return err
}
```

- [ ] **Step 2: Write harness repository**

```go
// api/internal/repo/harness.go
package repo

import (
	"database/sql"
	"encoding/json"
	"github.com/user/omni-fabric-api/internal/model"
)

type HarnessRepo struct {
	db *sql.DB
}

func NewHarnessRepo(db *sql.DB) *HarnessRepo {
	return &HarnessRepo{db: db}
}

func (r *HarnessRepo) Create(h *model.Harness) error {
	defJSON, _ := json.Marshal(h.Definition)
	return r.db.QueryRow(
		`INSERT INTO harnesses (project_id, name, description, definition, is_template, tags, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		h.ProjectID, h.Name, h.Description, defJSON, h.IsTemplate, h.Tags, nil,
	).Scan(&h.ID)
}

func (r *HarnessRepo) ListByProject(projectID string) ([]model.Harness, error) {
	rows, err := r.db.Query(
		`SELECT id, project_id, name, description, definition, is_template, tags
		 FROM harnesses WHERE project_id = $1 ORDER BY updated_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var harnesses []model.Harness
	for rows.Next() {
		var h model.Harness
		var defJSON []byte
		if err := rows.Scan(&h.ID, &h.ProjectID, &h.Name, &h.Description, &defJSON, &h.IsTemplate, &h.Tags); err != nil {
			return nil, err
		}
		json.Unmarshal(defJSON, &h.Definition)
		harnesses = append(harnesses, h)
	}
	return harnesses, nil
}

func (r *HarnessRepo) GetByID(id string) (*model.Harness, error) {
	var h model.Harness
	var defJSON []byte
	err := r.db.QueryRow(
		`SELECT id, project_id, name, description, definition, is_template, tags
		 FROM harnesses WHERE id = $1`, id,
	).Scan(&h.ID, &h.ProjectID, &h.Name, &h.Description, &defJSON, &h.IsTemplate, &h.Tags)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(defJSON, &h.Definition)
	return &h, nil
}

func (r *HarnessRepo) UpdateDefinition(id string, definition any) error {
	defJSON, _ := json.Marshal(definition)
	_, err := r.db.Exec(`UPDATE harnesses SET definition = $2, updated_at = NOW() WHERE id = $1`, id, defJSON)
	return err
}

func (r *HarnessRepo) Delete(id string) error {
	_, err := r.db.Exec(`DELETE FROM harnesses WHERE id = $1`, id)
	return err
}
```

- [ ] **Step 3: Write agent and harness handlers**

Write `api/internal/handler/agent.go` and `api/internal/handler/harness.go` following the same pattern as project handler (CRUD with JSON encoding, chi URL params, middleware.GetUserID).

- [ ] **Step 4: Register routes in router**

Add agent and harness routes under the protected group:

```go
r.Route("/projects/{projectId}/agents", func(r chi.Router) {
    r.Get("/", agentHandler.List)
    r.Post("/", agentHandler.Create)
    r.Get("/{id}", agentHandler.Get)
    r.Delete("/{id}", agentHandler.Delete)
})

r.Route("/projects/{projectId}/harnesses", func(r chi.Router) {
    r.Get("/", harnessHandler.List)
    r.Post("/", harnessHandler.Create)
    r.Get("/{id}", harnessHandler.Get)
    r.Put("/{id}", harnessHandler.UpdateDefinition)
    r.Delete("/{id}", harnessHandler.Delete)
})
```

- [ ] **Step 5: Test CRUD endpoints**

```bash
# Create agent
curl -s -X POST http://localhost:8080/api/projects/$PID/agents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Planner","description":"Plans development tasks","system_prompt":"You are a planner...","tags":["planning"]}'

# Create harness
curl -s -X POST http://localhost:8080/api/projects/$PID/harnesses \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Plan-Implement-Verify","definition":{"nodes":[],"edges":[]}}'
```

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "feat: agents and harnesses CRUD API"
```

---

## Task 6: Runs API + WebSocket Hub

**Files:**
- Create: `api/internal/repo/run.go`
- Create: `api/internal/handler/run.go`
- Create: `api/internal/handler/ws.go`
- Modify: `api/internal/router/router.go`

- [ ] **Step 1: Write run repository**

```go
// api/internal/repo/run.go
package repo

import (
	"database/sql"
	"encoding/json"
	"time"
	"github.com/user/omni-fabric-api/internal/model"
)

type RunRepo struct {
	db *sql.DB
}

func NewRunRepo(db *sql.DB) *RunRepo {
	return &RunRepo{db: db}
}

func (r *RunRepo) Create(harnessID, triggerType string, input any) (*model.Run, error) {
	inputJSON, _ := json.Marshal(input)
	var run model.Run
	err := r.db.QueryRow(
		`INSERT INTO runs (harness_id, trigger_type, input, status)
		 VALUES ($1, $2, $3, 'pending') RETURNING id, harness_id, status, trigger_type, created_at`,
		harnessID, triggerType, inputJSON,
	).Scan(&run.ID, &run.HarnessID, &run.Status, &run.TriggerType, &run.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &run, nil
}

func (r *RunRepo) GetByID(id string) (*model.Run, error) {
	var run model.Run
	err := r.db.QueryRow(
		`SELECT id, harness_id, status, trigger_type, input, metrics, started_at, completed_at, created_by, created_at
		 FROM runs WHERE id = $1`, id,
	).Scan(&run.ID, &run.HarnessID, &run.Status, &run.TriggerType, &run.Input, &run.Metrics,
		&run.StartedAt, &run.CompletedAt, &run.CreatedBy, &run.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &run, nil
}

func (r *RunRepo) ListByHarness(harnessID string) ([]model.Run, error) {
	rows, err := r.db.Query(
		`SELECT id, harness_id, status, trigger_type, created_at
		 FROM runs WHERE harness_id = $1 ORDER BY created_at DESC`, harnessID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var runs []model.Run
	for rows.Next() {
		var run model.Run
		if err := rows.Scan(&run.ID, &run.HarnessID, &run.Status, &run.TriggerType, &run.CreatedAt); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, nil
}

func (r *RunRepo) UpdateStatus(id, status string) error {
	var err error
	if status == "running" {
		_, err = r.db.Exec(`UPDATE runs SET status = $2, started_at = NOW() WHERE id = $1`, id, status)
	} else if status == "completed" || status == "failed" || status == "aborted" {
		_, err = r.db.Exec(`UPDATE runs SET status = $2, completed_at = NOW() WHERE id = $1`, id, status)
	} else {
		_, err = r.db.Exec(`UPDATE runs SET status = $2 WHERE id = $1`, id, status)
	}
	return err
}

func (r *RunRepo) AppendLog(runID, nodeID string, attempt int, logType, content string) error {
	_, err := r.db.Exec(
		`INSERT INTO execution_logs (run_id, node_id, attempt, log_type, content) VALUES ($1, $2, $3, $4, $5)`,
		runID, nodeID, attempt, logType, content)
	return err
}

func (r *RunRepo) GetLogs(runID string) ([]ExecutionLog, error) {
	rows, err := r.db.Query(
		`SELECT id, run_id, node_id, attempt, log_type, content, created_at
		 FROM execution_logs WHERE run_id = $1 ORDER BY created_at`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []ExecutionLog
	for rows.Next() {
		var l ExecutionLog
		if err := rows.Scan(&l.ID, &l.RunID, &l.NodeID, &l.Attempt, &l.LogType, &l.Content, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

type ExecutionLog struct {
	ID        string    `json:"id"`
	RunID     string    `json:"run_id"`
	NodeID    string    `json:"node_id"`
	Attempt   int       `json:"attempt"`
	LogType   string    `json:"log_type"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}
```

- [ ] **Step 2: Write WebSocket hub**

```go
// api/internal/handler/ws.go
package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHub struct {
	mu    sync.RWMutex
	conns map[string]map[*websocket.Conn]bool // runID -> connections
}

func NewWSHub() *WSHub {
	return &WSHub{conns: make(map[string]map[*websocket.Conn]bool)}
}

func (h *WSHub) Subscribe(runID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[runID] == nil {
		h.conns[runID] = make(map[*websocket.Conn]bool)
	}
	h.conns[runID][conn] = true
}

func (h *WSHub) Unsubscribe(runID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[runID], conn)
	conn.Close()
}

func (h *WSHub) Broadcast(runID string, msg any) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	data, _ := json.Marshal(msg)
	for conn := range h.conns[runID] {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			go h.Unsubscribe(runID, conn)
		}
	}
}

func (h *WSHub) HandleWS(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	h.Subscribe(runID, conn)

	// Keep connection alive, handle close
	go func() {
		defer h.Unsubscribe(runID, conn)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()
}
```

- [ ] **Step 3: Write run handler**

```go
// api/internal/handler/run.go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/user/omni-fabric-api/internal/repo"
)

type RunHandler struct {
	repo   *repo.RunRepo
	wsHub  *WSHub
}

func NewRunHandler(r *repo.RunRepo, hub *WSHub) *RunHandler {
	return &RunHandler{repo: r, wsHub: hub}
}

type createRunReq struct {
	Input any `json:"input"`
}

func (h *RunHandler) Create(w http.ResponseWriter, r *http.Request) {
	harnessID := chi.URLParam(r, "harnessId")
	var req createRunReq
	json.NewDecoder(r.Body).Decode(&req)
	run, err := h.repo.Create(harnessID, "manual", req.Input)
	if err != nil {
		http.Error(w, `{"error":"failed to create run"}`, 500)
		return
	}
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(run)
}

func (h *RunHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	run, err := h.repo.GetByID(id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	json.NewEncoder(w).Encode(run)
}

func (h *RunHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	logs, err := h.repo.GetLogs(id)
	if err != nil {
		http.Error(w, `{"error":"failed to get logs"}`, 500)
		return
	}
	if logs == nil {
		logs = []repo.ExecutionLog{}
	}
	json.NewEncoder(w).Encode(logs)
}

func (h *RunHandler) Abort(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "runId")
	h.repo.UpdateStatus(id, "aborted")
	h.wsHub.Broadcast(id, map[string]string{"type": "status", "status": "aborted"})
	w.Write([]byte(`{"status":"aborted"}`))
}

func (h *RunHandler) GateApprove(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	nodeID := chi.URLParam(r, "nodeId")
	h.wsHub.Broadcast(runID, map[string]string{"type": "gate", "nodeId": nodeID, "action": "approve"})
	w.Write([]byte(`{"status":"approved"}`))
}

func (h *RunHandler) GateReject(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runId")
	nodeID := chi.URLParam(r, "nodeId")
	h.wsHub.Broadcast(runID, map[string]string{"type": "gate", "nodeId": nodeID, "action": "reject"})
	w.Write([]byte(`{"status":"rejected"}`))
}
```

- [ ] **Step 4: Register run and WS routes**

```go
runRepo := repo.NewRunRepo(db)
wsHub := handler.NewWSHub()
runHandler := handler.NewRunHandler(runRepo, wsHub)

r.Route("/harnesses/{harnessId}/runs", func(r chi.Router) {
    r.Post("/", runHandler.Create)
})

r.Route("/runs", func(r chi.Router) {
    r.Get("/{runId}", runHandler.Get)
    r.Get("/{runId}/logs", runHandler.GetLogs)
    r.Post("/{runId}/abort", runHandler.Abort)
    r.Post("/{runId}/gate/{nodeId}/approve", runHandler.GateApprove)
    r.Post("/{runId}/gate/{nodeId}/reject", runHandler.GateReject)
})

r.Get("/ws/runs/{runId}", wsHub.HandleWS)
```

- [ ] **Step 5: Commit**

```bash
git add api/
git commit -m "feat: runs API and WebSocket hub"
```

---

## Task 7: Local Daemon — Core + Sync Client

**Files:**
- Create: `daemon/internal/config/config.go`
- Create: `daemon/internal/sync/ws.go`
- Modify: `daemon/cmd/daemon/main.go`

- [ ] **Step 1: Write daemon config**

```go
// daemon/internal/config/config.go
package config

import "os"

type Config struct {
	APIURL    string
	AuthToken string
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
```

- [ ] **Step 2: Write WebSocket sync client**

```go
// daemon/internal/sync/ws.go
package sync

import (
	"encoding/json"
	"log"
	"sync"
	"time"

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

func (c *WSClient) Connect(runID string) error {
	url := c.apiURL + "/api/ws/runs/" + runID
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

func (c *WSClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
```

- [ ] **Step 3: Update daemon main.go**

```go
// daemon/cmd/daemon/main.go
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
```

- [ ] **Step 4: Commit**

```bash
git add daemon/
git commit -m "feat: local daemon core with WebSocket sync client"
```

---

## Task 8: Local Daemon — Agent Executor Interface + Claude Adapter

**Files:**
- Create: `daemon/internal/adapter/adapter.go`
- Create: `daemon/internal/adapter/claude.go`

- [ ] **Step 1: Write adapter interface**

```go
// daemon/internal/adapter/adapter.go
package adapter

import "context"

type CLIType string

const (
	CLIClaudeCode CLIType = "claude-code"
)

type ExecuteRequest struct {
	ExecutionID  string
	AgentName    string
	Prompt       string
	SystemPrompt string
	WorkingDir   string
	AllowedTools []string
	MaxTurns     int
	MaxBudgetUSD float64
	SessionID    string
}

type EventType string

const (
	EventText       EventType = "text"
	EventToolUse    EventType = "tool_use"
	EventToolResult EventType = "tool_result"
	EventError      EventType = "error"
	EventDone       EventType = "done"
)

type AgentEvent struct {
	Type      EventType
	Content   string
	ToolName  string
	ToolInput string
}

type AgentExecutor interface {
	Execute(ctx context.Context, req ExecuteRequest) (<-chan AgentEvent, error)
	Abort(executionID string) error
	SupportsCLI() CLIType
}
```

- [ ] **Step 2: Write Claude Code CLI adapter**

```go
// daemon/internal/adapter/claude.go
package adapter

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"sync"
)

type ClaudeAdapter struct {
	mu       sync.Mutex
	procs    map[string]*exec.Cmd
}

func NewClaudeAdapter() *ClaudeAdapter {
	return &ClaudeAdapter{procs: make(map[string]*exec.Cmd)}
}

func (a *ClaudeAdapter) SupportsCLI() CLIType {
	return CLIClaudeCode
}

func (a *ClaudeAdapter) Execute(ctx context.Context, req ExecuteRequest) (<-chan AgentEvent, error) {
	args := []string{
		"--print",
		"--output-format", "stream-json",
		"--max-turns", fmt.Sprintf("%d", req.MaxTurns),
	}

	if req.SystemPrompt != "" {
		args = append(args, "--system-prompt", req.SystemPrompt)
	}

	if len(req.AllowedTools) > 0 {
		args = append(args, "--allowedTools", strings.Join(req.AllowedTools, ","))
	}

	args = append(args, "--", req.Prompt)

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Dir = req.WorkingDir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}

	a.mu.Lock()
	a.procs[req.ExecutionID] = cmd
	a.mu.Unlock()

	events := make(chan AgentEvent, 100)

	go func() {
		defer close(events)
		defer func() {
			a.mu.Lock()
			delete(a.procs, req.ExecutionID)
			a.mu.Unlock()
		}()

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			var raw map[string]any
			if err := json.Unmarshal([]byte(line), &raw); err != nil {
				events <- AgentEvent{Type: EventText, Content: line}
				continue
			}

			msgType, _ := raw["type"].(string)
			switch msgType {
			case "assistant":
				if content, ok := raw["message"].(map[string]any); ok {
					if blocks, ok := content["content"].([]any); ok {
						for _, block := range blocks {
							if b, ok := block.(map[string]any); ok {
								switch b["type"] {
								case "text":
									events <- AgentEvent{Type: EventText, Content: b["text"].(string)}
								case "tool_use":
									input, _ := json.Marshal(b["input"])
									events <- AgentEvent{Type: EventToolUse, ToolName: b["name"].(string), ToolInput: string(input)}
								}
							}
						}
					}
				}
			case "result":
				events <- AgentEvent{Type: EventDone, Content: "completed"}
			}
		}

		// Read stderr
		errScanner := bufio.NewScanner(stderr)
		for errScanner.Scan() {
			events <- AgentEvent{Type: EventError, Content: errScanner.Text()}
		}

		cmd.Wait()
	}()

	return events, nil
}

func (a *ClaudeAdapter) Abort(executionID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if cmd, ok := a.procs[executionID]; ok {
		return cmd.Process.Kill()
	}
	return nil
}
```

- [ ] **Step 3: Commit**

```bash
git add daemon/internal/adapter/
git commit -m "feat: agent executor interface and Claude Code CLI adapter"
```

---

## Task 9: Local Daemon — State Machine (Port from TypeScript)

**Files:**
- Create: `daemon/internal/executor/statemachine.go`
- Create: `daemon/internal/executor/constraint.go`
- Create: `daemon/internal/executor/context.go`
- Create: `daemon/internal/executor/prompt.go`
- Create: `daemon/internal/executor/logger.go`

- [ ] **Step 1: Write Go types for harness structures**

```go
// daemon/internal/executor/context.go
package executor

type NodeContext struct {
	NodeID   string            `json:"nodeId"`
	Outputs  map[string]string `json:"outputs"`
	ExitCode int               `json:"exitCode,omitempty"`
	Metadata map[string]any    `json:"metadata,omitempty"`
}

type ConstraintFailure struct {
	ConstraintName  string       `json:"constraintName"`
	CheckType       string       `json:"checkType"`
	Command         string       `json:"command,omitempty"`
	ExitCode        int          `json:"exitCode,omitempty"`
	Stdout          string       `json:"stdout,omitempty"`
	Stderr          string       `json:"stderr,omitempty"`
	Attempt         int          `json:"attempt"`
	SourceNodeID    string       `json:"sourceNodeId"`
	SourceNodeCtx   *NodeContext `json:"sourceNodeContext,omitempty"`
}
```

- [ ] **Step 2: Write constraint checker**

```go
// daemon/internal/executor/constraint.go
package executor

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
)

type ConstraintCheckType string

const (
	CheckShell        ConstraintCheckType = "shell"
	CheckFileContains ConstraintCheckType = "file_contains"
	CheckExpression   ConstraintCheckType = "expression"
)

type Constraint struct {
	Name      string              `json:"name"`
	Check     ConstraintCheck     `json:"check"`
	OnFail    OnFailAction        `json:"onFail"`
	MaxRetries int               `json:"maxRetries,omitempty"`
}

type ConstraintCheck struct {
	Type    ConstraintCheckType `json:"type"`
	Command string              `json:"command,omitempty"`
	Path    string              `json:"path,omitempty"`
	Pattern string              `json:"pattern,omitempty"`
	Expr    string              `json:"expr,omitempty"`
}

type OnFailAction struct {
	Type         string `json:"type"`
	TargetNodeID string `json:"targetNodeId,omitempty"`
}

type ConstraintResult struct {
	Name    string `json:"name"`
	Passed  bool   `json:"passed"`
	ExitCode int   `json:"exitCode,omitempty"`
	Stdout  string `json:"stdout,omitempty"`
	Stderr  string `json:"stderr,omitempty"`
	Error   string `json:"error,omitempty"`
}

func CheckConstraint(c Constraint, ctx *NodeContext, allCtx map[string]*NodeContext, projectDir string) ConstraintResult {
	switch c.Check.Type {
	case CheckShell:
		return runShellCheck(c.Name, c.Check.Command, projectDir)
	case CheckFileContains:
		return runFileContainsCheck(c.Name, c.Check.Path, c.Check.Pattern, projectDir)
	case CheckExpression:
		return runExpressionCheck(c.Name, c.Check.Expr, ctx, allCtx)
	default:
		return ConstraintResult{Name: c.Name, Passed: false, Error: "unknown check type"}
	}
}

func runShellCheck(name, command, cwd string) ConstraintResult {
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = cwd
	out, err := cmd.CombinedOutput()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return ConstraintResult{Name: name, Passed: false, Error: err.Error()}
		}
	}
	return ConstraintResult{Name: name, Passed: exitCode == 0, ExitCode: exitCode, Stdout: string(out)}
}

func runFileContainsCheck(name, filePath, pattern, projectDir string) ConstraintResult {
	fullPath := filePath
	if !os.IsAbs(filePath) {
		fullPath = projectDir + "/" + filePath
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return ConstraintResult{Name: name, Passed: false, Error: err.Error()}
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return ConstraintResult{Name: name, Passed: false, Error: "invalid regex: " + err.Error()}
	}
	matched := re.Match(content)
	msg := "Pattern not found"
	if matched {
		msg = "Pattern matched"
	}
	return ConstraintResult{Name: name, Passed: matched, Stdout: msg}
}

func runExpressionCheck(name, expr string, ctx *NodeContext, allCtx map[string]*NodeContext) ConstraintResult {
	// Expression evaluation using Go's eval-like approach
	// For safety, we limit to simple boolean expressions
	// In production, use a proper expression evaluator (e.g., expr-lang/expr)
	return ConstraintResult{Name: name, Passed: false, Error: "expression check not yet implemented"}
}

func CheckAllConstraints(constraints []Constraint, ctx *NodeContext, allCtx map[string]*NodeContext, projectDir string) (bool, []ConstraintResult, *Constraint, *ConstraintResult) {
	var results []ConstraintResult
	for _, c := range constraints {
		result := CheckConstraint(c, ctx, allCtx, projectDir)
		results = append(results, result)
		if !result.Passed {
			return false, results, &c, &result
		}
	}
	return true, results, nil, nil
}
```

- [ ] **Step 3: Write prompt assembler**

```go
// daemon/internal/executor/prompt.go
package executor

import (
	"fmt"
	"strings"
)

type HarnessNode struct {
	ID       string          `json:"id"`
	Type     string          `json:"type"`
	Agent    *AgentConfig    `json:"agent,omitempty"`
	Position map[string]int  `json:"position"`
}

type AgentConfig struct {
	AgentID        string            `json:"agentId"`
	Constraints    []Constraint      `json:"constraints,omitempty"`
	ContextFilter []string          `json:"contextFilter,omitempty"`
	Overrides      map[string]any    `json:"overrides,omitempty"`
	Routing        *RoutingConfig    `json:"routing,omitempty"`
}

type RoutingConfig struct {
	OutputKey     string            `json:"outputKey"`
	Branches      map[string]string `json:"branches"`
	DefaultBranch string            `json:"defaultBranch,omitempty"`
}

type Connection struct {
	ID           string `json:"id"`
	SourceNodeID string `json:"sourceNodeId"`
	TargetNodeID string `json:"targetNodeId"`
}

func AssemblePrompt(node *HarnessNode, allNodes []HarnessNode, connections []Connection, allContexts map[string]*NodeContext, failure *ConstraintFailure) string {
	var parts []string

	// Add upstream context
	upstreamIDs := getUpstreamNodeIDs(node.ID, connections)
	for _, upID := range upstreamIDs {
		if ctx, ok := allContexts[upID]; ok {
			if len(ctx.Outputs) > 0 {
				parts = append(parts, fmt.Sprintf("## Context from %s\n", upID))
				for k, v := range ctx.Outputs {
					parts = append(parts, fmt.Sprintf("%s: %s", k, v))
				}
			}
		}
	}

	// Add constraint failure context (for retries)
	if failure != nil {
		parts = append(parts, fmt.Sprintf("\n## Previous Attempt Failed\nConstraint '%s' failed (attempt %d):\n%s\n%s",
			failure.ConstraintName, failure.Attempt, failure.Stdout, failure.Stderr))
	}

	// Add promptExtra from overrides
	if node.Agent != nil {
		if extra, ok := node.Agent.Overrides["promptExtra"].(string); ok && extra != "" {
			parts = append(parts, "\n## Additional Instructions\n"+extra)
		}
	}

	if len(parts) == 0 {
		return "Execute the task as instructed by your system prompt."
	}
	return strings.Join(parts, "\n")
}

func getUpstreamNodeIDs(nodeID string, connections []Connection) []string {
	var ids []string
	for _, c := range connections {
		if c.TargetNodeID == nodeID {
			ids = append(ids, c.SourceNodeID)
		}
	}
	return ids
}
```

- [ ] **Step 4: Write JSONL logger**

```go
// daemon/internal/executor/logger.go
package executor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type Logger struct {
	projectDir string
	runID      string
}

func NewLogger(projectDir, runID string) *Logger {
	return &Logger{projectDir: projectDir, runID: runID}
}

func (l *Logger) logDir() string {
	return filepath.Join(l.projectDir, ".harness", "runs", l.runID, "logs")
}

func (l *Logger) AppendNodeLog(nodeID string, attempt int, event map[string]any) error {
	dir := l.logDir()
	os.MkdirAll(dir, 0755)

	filename := filepath.Join(dir, fmt.Sprintf("%s.%d.jsonl", nodeID, attempt))
	f, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	event["ts"] = time.Now().UnixMilli()
	data, _ := json.Marshal(event)
	_, err = f.Write(append(data, '\n'))
	return err
}

func (l *Logger) AppendExecutionLog(event map[string]any) error {
	dir := l.logDir()
	os.MkdirAll(dir, 0755)

	filename := filepath.Join(dir, "execution.jsonl")
	f, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	event["ts"] = time.Now().UnixMilli()
	data, _ := json.Marshal(event)
	_, err = f.Write(append(data, '\n'))
	return err
}
```

- [ ] **Step 5: Write state machine**

```go
// daemon/internal/executor/statemachine.go
package executor

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/user/omni-fabric-daemon/internal/adapter"
)

const DefaultMaxRetries = 3

type NodeStatus string

const (
	StatusPending   NodeStatus = "pending"
	StatusReady     NodeStatus = "ready"
	StatusRunning   NodeStatus = "running"
	StatusChecking  NodeStatus = "checking"
	StatusCompleted NodeStatus = "completed"
	StatusFailed    NodeStatus = "failed"
	StatusSkipped   NodeStatus = "skipped"
	StatusWaiting   NodeStatus = "waiting"
)

type HarnessDefinition struct {
	ID          string       `json:"id"`
	Nodes       []HarnessNode `json:"nodes"`
	Connections []Connection `json:"edges"`
}

type NodeRuntime struct {
	Status           NodeStatus
	Attempt          int
	Error            string
	ConstraintFailure *ConstraintFailure
}

type Callbacks struct {
	OnNodeStatusChange func(nodeID string, status NodeStatus, attempt int, err string)
	OnStreamEvent      func(nodeID string, event adapter.AgentEvent)
	OnDone             func(success bool)
	OnGateWait         func(nodeID string, message string) bool
}

type StateMachine struct {
	def           HarnessDefinition
	projectDir    string
	runID         string
	executor      adapter.AgentExecutor
	callbacks     Callbacks
	logger        *Logger

	mu            sync.Mutex
	nodeStates    map[string]*NodeRuntime
	contexts      map[string]*NodeContext
	activeHandles map[string]context.CancelFunc
	aborted       bool
	startedAt     time.Time
}

func NewStateMachine(def HarnessDefinition, projectDir, runID string, exec adapter.AgentExecutor, cb Callbacks) *StateMachine {
	return &StateMachine{
		def:           def,
		projectDir:    projectDir,
		runID:         runID,
		executor:      exec,
		callbacks:     cb,
		logger:        NewLogger(projectDir, runID),
		nodeStates:    make(map[string]*NodeRuntime),
		contexts:      make(map[string]*NodeContext),
		activeHandles: make(map[string]context.CancelFunc),
		startedAt:     time.Now(),
	}
}

func (sm *StateMachine) Execute() {
	// Initialize
	for _, node := range sm.def.Nodes {
		sm.nodeStates[node.ID] = &NodeRuntime{Status: StatusPending}
	}

	// Mark entry nodes as ready
	hasIncoming := make(map[string]bool)
	for _, c := range sm.def.Connections {
		hasIncoming[c.TargetNodeID] = true
	}
	for _, node := range sm.def.Nodes {
		if !hasIncoming[node.ID] {
			sm.setNodeStatus(node.ID, StatusReady, "")
		}
	}

	sm.logger.AppendExecutionLog(map[string]any{
		"type":   "harness_start",
		"nodeIds": nodeIDs(sm.def.Nodes),
	})

	// Event loop
	for !sm.aborted {
		readyNodes := sm.getNodesByStatus(StatusReady)
		if len(readyNodes) == 0 {
			if len(sm.getNodesByStatus(StatusRunning)) == 0 &&
				len(sm.getNodesByStatus(StatusChecking)) == 0 &&
				len(sm.getNodesByStatus(StatusWaiting)) == 0 {
				break
			}
			time.Sleep(100 * time.Millisecond)
			continue
		}

		var wg sync.WaitGroup
		for _, nodeID := range readyNodes {
			wg.Add(1)
			go func(nid string) {
				defer wg.Done()
				sm.dispatchNode(nid)
			}(nodeID)
		}
		wg.Wait()
	}

	allDone := true
	for _, node := range sm.def.Nodes {
		state := sm.nodeStates[node.ID]
		if state.Status != StatusCompleted && state.Status != StatusSkipped {
			allDone = false
			break
		}
	}

	sm.logger.AppendExecutionLog(map[string]any{
		"type":       "harness_end",
		"success":    allDone,
		"durationMs": time.Since(sm.startedAt).Milliseconds(),
	})

	sm.callbacks.OnDone(allDone)
}

func (sm *StateMachine) dispatchNode(nodeID string) {
	node := sm.findNode(nodeID)
	if node == nil {
		return
	}

	runtime := sm.nodeStates[nodeID]
	sm.setNodeStatus(nodeID, StatusRunning, "")

	sm.logger.AppendExecutionLog(map[string]any{
		"type":    "node_dispatch",
		"nodeId":  nodeID,
		"attempt": runtime.Attempt,
	})

	switch node.Type {
	case "agent":
		sm.executeAgentNode(node, runtime)
	case "condition":
		sm.executeConditionNode(node)
	case "gate":
		sm.executeGateNode(node)
	}
}

func (sm *StateMachine) executeAgentNode(node *HarnessNode, runtime *NodeRuntime) {
	prompt := AssemblePrompt(node, sm.def.Nodes, sm.def.Connections, sm.contexts, runtime.ConstraintFailure)

	ctx, cancel := context.WithCancel(context.Background())
	sm.mu.Lock()
	sm.activeHandles[node.ID] = cancel
	sm.mu.Unlock()

	events, err := sm.executor.Execute(ctx, adapter.ExecuteRequest{
		ExecutionID: sm.runID + ":" + node.ID,
		AgentName:   node.Agent.AgentID,
		Prompt:      prompt,
		WorkingDir:  sm.projectDir,
		MaxTurns:    50,
	})
	if err != nil {
		sm.setNodeStatus(node.ID, StatusFailed, err.Error())
		return
	}

	startTime := time.Now()
	var lastOutput string

	for event := range events {
		sm.callbacks.OnStreamEvent(node.ID, event)
		if event.Type == adapter.EventText {
			lastOutput = event.Content
		}
		sm.logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
			"type": "stream_message",
			"data": event,
		})
	}

	sm.logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
		"type":       "node_end",
		"nodeId":     node.ID,
		"durationMs": time.Since(startTime).Milliseconds(),
	})

	// Build context
	nodeCtx := &NodeContext{
		NodeID:  node.ID,
		Outputs: map[string]string{"output": lastOutput},
	}
	sm.contexts[node.ID] = nodeCtx

	// Check constraints
	if node.Agent != nil && len(node.Agent.Constraints) > 0 {
		sm.setNodeStatus(node.ID, StatusChecking, "")
		sm.checkNodeConstraints(node, runtime, nodeCtx)
	} else {
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		sm.advanceDownstream(node.ID)
	}

	sm.mu.Lock()
	delete(sm.activeHandles, node.ID)
	sm.mu.Unlock()
}

func (sm *StateMachine) checkNodeConstraints(node *HarnessNode, runtime *NodeRuntime, ctx *NodeContext) {
	allPassed, results, failedConstraint, failedResult := CheckAllConstraints(
		node.Agent.Constraints, ctx, sm.contexts, sm.projectDir)

	for _, r := range results {
		sm.logger.AppendNodeLog(node.ID, runtime.Attempt, map[string]any{
			"type":     "constraint_check",
			"name":     r.Name,
			"passed":   r.Passed,
			"exitCode": r.ExitCode,
			"stdout":   r.Stdout,
			"stderr":   r.Stderr,
		})
	}

	if allPassed {
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		sm.advanceDownstream(node.ID)
		return
	}

	maxRetries := failedConstraint.MaxRetries
	if maxRetries == 0 {
		maxRetries = DefaultMaxRetries
	}

	if runtime.Attempt >= maxRetries {
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Constraint %q failed after %d retries", failedConstraint.Name, maxRetries))
		return
	}

	failure := &ConstraintFailure{
		ConstraintName: failedConstraint.Name,
		CheckType:      string(failedConstraint.Check.Type),
		Command:        failedConstraint.Check.Command,
		ExitCode:       failedResult.ExitCode,
		Stdout:         failedResult.Stdout,
		Stderr:         failedResult.Stderr,
		Attempt:        runtime.Attempt,
		SourceNodeID:   node.ID,
	}

	switch failedConstraint.OnFail.Type {
	case "retry":
		runtime.Attempt++
		runtime.ConstraintFailure = failure
		sm.setNodeStatus(node.ID, StatusReady, "")
	case "route":
		targetID := failedConstraint.OnFail.TargetNodeID
		if target, ok := sm.nodeStates[targetID]; ok {
			target.ConstraintFailure = failure
			sm.setNodeStatus(targetID, StatusReady, "")
		}
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Routed to %s", targetID))
	case "abort":
		sm.setNodeStatus(node.ID, StatusFailed, fmt.Sprintf("Constraint %q failed, aborting", failedConstraint.Name))
		sm.aborted = true
	}
}

func (sm *StateMachine) executeConditionNode(node *HarnessNode) {
	// Simplified condition evaluation
	sm.setNodeStatus(node.ID, StatusCompleted, "")
	sm.advanceDownstream(node.ID)
}

func (sm *StateMachine) executeGateNode(node *HarnessNode) {
	sm.setNodeStatus(node.ID, StatusWaiting, "")
	message := ""
	if node.Agent != nil {
		if msg, ok := node.Agent.Overrides["gateMessage"].(string); ok {
			message = msg
		}
	}
	approved := sm.callbacks.OnGateWait(node.ID, message)
	if approved {
		sm.contexts[node.ID] = &NodeContext{NodeID: node.ID, Outputs: map[string]string{}, Metadata: map[string]any{"approved": true}}
		sm.setNodeStatus(node.ID, StatusCompleted, "")
		sm.advanceDownstream(node.ID)
	} else {
		sm.setNodeStatus(node.ID, StatusFailed, "Gate rejected by user")
	}
}

func (sm *StateMachine) advanceDownstream(completedNodeID string) {
	downstream := []string{}
	for _, c := range sm.def.Connections {
		if c.SourceNodeID == completedNodeID {
			downstream = append(downstream, c.TargetNodeID)
		}
	}

	for _, targetID := range downstream {
		upstreamIDs := []string{}
		for _, c := range sm.def.Connections {
			if c.TargetNodeID == targetID {
				upstreamIDs = append(upstreamIDs, c.SourceNodeID)
			}
		}

		allDone := true
		for _, upID := range upstreamIDs {
			state := sm.nodeStates[upID]
			if state.Status != StatusCompleted {
				allDone = false
				break
			}
		}

		if allDone {
			if state, ok := sm.nodeStates[targetID]; ok && state.Status == StatusPending {
				sm.setNodeStatus(targetID, StatusReady, "")
			}
		}
	}
}

func (sm *StateMachine) setNodeStatus(nodeID string, status NodeStatus, errMsg string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if runtime, ok := sm.nodeStates[nodeID]; ok {
		runtime.Status = status
		if errMsg != "" {
			runtime.Error = errMsg
		}
		sm.callbacks.OnNodeStatusChange(nodeID, status, runtime.Attempt, errMsg)
	}
}

func (sm *StateMachine) getNodesByStatus(status NodeStatus) []string {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	var ids []string
	for id, state := range sm.nodeStates {
		if state.Status == status {
			ids = append(ids, id)
		}
	}
	return ids
}

func (sm *StateMachine) findNode(id string) *HarnessNode {
	for i := range sm.def.Nodes {
		if sm.def.Nodes[i].ID == id {
			return &sm.def.Nodes[i]
		}
	}
	return nil
}

func (sm *StateMachine) Abort() {
	sm.aborted = true
	sm.mu.Lock()
	defer sm.mu.Unlock()
	for _, cancel := range sm.activeHandles {
		cancel()
	}
}

func nodeIDs(nodes []HarnessNode) []string {
	ids := make([]string, len(nodes))
	for i, n := range nodes {
		ids[i] = n.ID
	}
	return ids
}
```

- [ ] **Step 6: Commit**

```bash
git add daemon/internal/executor/
git commit -m "feat: state machine executor ported from TypeScript to Go"
```

---

## Task 10: Next.js Frontend — Scaffolding + Auth

**Files:**
- Modify: `web/app/layout.tsx`
- Create: `web/app/(auth)/login/page.tsx`
- Create: `web/app/(auth)/register/page.tsx`
- Create: `web/lib/api.ts`
- Create: `web/stores/auth.ts`

- [ ] **Step 1: Set up Tailwind with design tokens**

Update `web/tailwind.config.ts` with the OKLCH design system from `DESIGN.md`.

- [ ] **Step 2: Write API client**

```typescript
// web/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}
```

- [ ] **Step 3: Write auth store**

```typescript
// web/stores/auth.ts
import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,

  login: async (email, password) => {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', res.token);
    set({ token: res.token, user: res.user });
  },

  register: async (email, name, password) => {
    const res = await api<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    });
    localStorage.setItem('token', res.token);
    set({ token: res.token, user: res.user });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('token');
    if (token) {
      set({ token });
      api<User>('/users/me').then((user) => set({ user })).catch(() => {
        localStorage.removeItem('token');
        set({ token: null });
      });
    }
  },
}));
```

- [ ] **Step 4: Write login and register pages**

Write `web/app/(auth)/login/page.tsx` and `web/app/(auth)/register/page.tsx` with form inputs, using the auth store.

- [ ] **Step 5: Write root layout**

```tsx
// web/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Omni Fabric' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-sm bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: Next.js frontend scaffolding with auth pages"
```

---

## Task 11: Next.js — Projects & Agents Pages

**Files:**
- Create: `web/app/projects/page.tsx`
- Create: `web/app/projects/new/page.tsx`
- Create: `web/app/projects/[projectId]/layout.tsx`
- Create: `web/app/projects/[projectId]/page.tsx`
- Create: `web/app/projects/[projectId]/agents/page.tsx`
- Create: `web/stores/project.ts`

- [ ] **Step 1: Write project store**

```typescript
// web/stores/project.ts
import { create } from 'zustand';
import { api } from '@/lib/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  created_at: string;
}

interface ProjectState {
  projects: Project[];
  current: Project | null;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  current: null,

  fetchProjects: async () => {
    const projects = await api<Project[]>('/projects');
    set({ projects });
  },

  fetchProject: async (id) => {
    const project = await api<Project>(`/projects/${id}`);
    set({ current: project });
  },

  createProject: async (name, description) => {
    const project = await api<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },
}));
```

- [ ] **Step 2: Write projects list page**

```tsx
// web/app/projects/page.tsx
"use client";
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/project';
import Link from 'next/link';

export default function ProjectsPage() {
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link href="/projects/new" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm">
          New Project
        </Link>
      </div>
      <div className="space-y-2">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}
            className="block glass-card rounded-xl p-4 hover:bg-white/65 transition-all">
            <h3 className="font-medium">{p.name}</h3>
            {p.description && <p className="text-muted-foreground text-xs mt-1">{p.description}</p>}
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="text-muted-foreground text-center py-12">No projects yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write create project page**

Write `web/app/projects/new/page.tsx` with a form (name + description) that calls `createProject` and redirects to the project page.

- [ ] **Step 4: Write project layout with sidebar**

```tsx
// web/app/projects/[projectId]/layout.tsx
"use client";
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProjectStore } from '@/stores/project';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams();
  const { current, fetchProject } = useProjectStore();

  useEffect(() => { if (projectId) fetchProject(projectId as string); }, [projectId]);

  const nav = [
    { href: `/projects/${projectId}`, label: 'Overview' },
    { href: `/projects/${projectId}/agents`, label: 'Agents' },
    { href: `/projects/${projectId}/harnesses`, label: 'Harnesses' },
    { href: `/projects/${projectId}/runs`, label: 'Runs' },
  ];

  return (
    <div className="flex h-screen">
      <aside className="w-52 glass-strong border-r border-border/30 p-4">
        <Link href="/projects" className="text-xs text-muted-foreground mb-4 block">&larr; Projects</Link>
        <h2 className="font-semibold mb-4 truncate">{current?.name || '...'}</h2>
        <nav className="space-y-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className="block px-3 py-1.5 rounded-lg text-xs hover:bg-white/40 transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Write project overview and agents pages**

Write `web/app/projects/[projectId]/page.tsx` (overview with quick stats) and `web/app/projects/[projectId]/agents/page.tsx` (agent list with create form).

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: project and agent management pages"
```

---

## Task 12: Next.js — Harness Editor (ReactFlow)

**Files:**
- Create: `web/app/projects/[projectId]/harnesses/page.tsx`
- Create: `web/app/projects/[projectId]/harnesses/[harnessId]/page.tsx`
- Create: `web/components/harness/HarnessCanvas.tsx`
- Create: `web/components/harness/AgentNode.tsx`
- Create: `web/components/harness/ConditionNode.tsx`
- Create: `web/components/harness/GateNode.tsx`
- Create: `web/components/harness/AgentPalette.tsx`
- Create: `web/components/harness/NodeConfigPanel.tsx`
- Create: `web/stores/harness.ts`

- [ ] **Step 1: Write harness store**

```typescript
// web/stores/harness.ts
import { create } from 'zustand';
import { api } from '@/lib/api';
import type { Node, Edge } from '@xyflow/react';

interface Harness {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  definition: { nodes: Node[]; edges: Edge[] };
  is_template: boolean;
  tags: string[];
}

interface HarnessState {
  harnesses: Harness[];
  current: Harness | null;
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;

  fetchHarnesses: (projectId: string) => Promise<void>;
  fetchHarness: (id: string) => Promise<void>;
  createHarness: (projectId: string, name: string) => Promise<Harness>;
  saveDefinition: (id: string) => Promise<void>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (id: string | null) => void;
  addNode: (type: string, agentId?: string, position?: { x: number; y: number }) => void;
}

export const useHarnessStore = create<HarnessState>((set, get) => ({
  harnesses: [],
  current: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,

  fetchHarnesses: async (projectId) => {
    const harnesses = await api<Harness[]>(`/projects/${projectId}/harnesses`);
    set({ harnesses });
  },

  fetchHarness: async (id) => {
    const harness = await api<Harness>(`/harnesses/${id}`);
    set({
      current: harness,
      nodes: harness.definition?.nodes || [],
      edges: harness.definition?.edges || [],
    });
  },

  createHarness: async (projectId, name) => {
    const harness = await api<Harness>(`/projects/${projectId}/harnesses`, {
      method: 'POST',
      body: JSON.stringify({ name, definition: { nodes: [], edges: [] } }),
    });
    set((s) => ({ harnesses: [harness, ...s.harnesses] }));
    return harness;
  },

  saveDefinition: async (id) => {
    const { nodes, edges } = get();
    await api(`/harnesses/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ definition: { nodes, edges } }),
    });
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  addNode: (type, agentId, position) => {
    const { nodes } = get();
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: position || { x: 250, y: 150 + nodes.length * 100 },
      data: { agentId, label: type },
    };
    set({ nodes: [...nodes, newNode] });
  },
}));
```

- [ ] **Step 2: Write custom node components**

Write `AgentNode.tsx`, `ConditionNode.tsx`, `GateNode.tsx` as ReactFlow custom nodes with status indicators (color-coded based on execution state).

```tsx
// web/components/harness/AgentNode.tsx
"use client";
import { Handle, Position, type NodeProps } from '@xyflow/react';

export function AgentNode({ data, selected }: NodeProps) {
  const statusColor = {
    pending: 'bg-muted-foreground/30',
    ready: 'bg-blue-400',
    running: 'bg-blue-400 animate-pulse',
    checking: 'bg-amber-400 animate-pulse',
    completed: 'bg-emerald-500',
    failed: 'bg-destructive',
    skipped: 'bg-muted-foreground/50',
  }[data.status as string] || 'bg-muted-foreground/30';

  return (
    <div className={`glass-card rounded-xl p-3 min-w-[160px] ${selected ? 'ring-2 ring-primary/30' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-xs font-medium">{(data.agentId as string) || 'Agent'}</span>
      </div>
      {data.label && <p className="text-[10px] text-muted-foreground mt-1">{data.label as string}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

Write `ConditionNode.tsx` and `GateNode.tsx` similarly.

- [ ] **Step 3: Write agent palette**

```tsx
// web/components/harness/AgentPalette.tsx
"use client";
import { useHarnessStore } from '@/stores/harness';

export function AgentPalette({ agents }: { agents: { id: string; name: string }[] }) {
  const addNode = useHarnessStore((s) => s.addNode);

  return (
    <div className="glass-strong rounded-xl p-3 space-y-1.5">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">Agents</h3>
      {agents.map((agent) => (
        <button key={agent.id}
          onClick={() => addNode('agent', agent.id)}
          className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 transition-colors cursor-pointer">
          {agent.name}
        </button>
      ))}
      <hr className="border-border/20 my-2" />
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">Flow</h3>
      <button onClick={() => addNode('condition')} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 cursor-pointer">Condition</button>
      <button onClick={() => addNode('gate')} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/40 cursor-pointer">Gate</button>
    </div>
  );
}
```

- [ ] **Step 4: Write harness canvas**

```tsx
// web/components/harness/HarnessCanvas.tsx
"use client";
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useHarnessStore } from '@/stores/harness';
import { AgentNode } from './AgentNode';
import { ConditionNode } from './ConditionNode';
import { GateNode } from './GateNode';

export function HarnessCanvas() {
  const { nodes, edges, setNodes, setEdges, setSelectedNode } = useHarnessStore();

  const nodeTypes: NodeTypes = useMemo(() => ({
    agent: AgentNode,
    condition: ConditionNode,
    gate: GateNode,
  }), []);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes, setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges(addEdge(params, edges)),
    [edges, setEdges]
  );

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 5: Write harness editor page**

```tsx
// web/app/projects/[projectId]/harnesses/[harnessId]/page.tsx
"use client";
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import { useHarnessStore } from '@/stores/harness';
import { HarnessCanvas } from '@/components/harness/HarnessCanvas';
import { AgentPalette } from '@/components/harness/AgentPalette';
import { NodeConfigPanel } from '@/components/harness/NodeConfigPanel';

export default function HarnessEditorPage() {
  const { harnessId } = useParams();
  const { fetchHarness, current, saveDefinition, selectedNodeId } = useHarnessStore();

  useEffect(() => { if (harnessId) fetchHarness(harnessId as string); }, [harnessId]);

  const handleSave = () => {
    if (harnessId) saveDefinition(harnessId as string);
  };

  return (
    <ReactFlowProvider>
      <div className="flex h-screen">
        <aside className="w-48 glass-strong border-r border-border/30 p-3 overflow-auto">
          <AgentPalette agents={[]} />
        </aside>
        <main className="flex-1 relative">
          <div className="absolute top-3 right-3 z-10">
            <button onClick={handleSave}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs">
              Save
            </button>
          </div>
          <HarnessCanvas />
        </main>
        {selectedNodeId && (
          <aside className="w-72 glass-strong border-l border-border/30 p-4 overflow-auto">
            <NodeConfigPanel />
          </aside>
        )}
      </div>
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 6: Write harness list page**

Write `web/app/projects/[projectId]/harnesses/page.tsx` with list + create button.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: harness visual editor with ReactFlow"
```

---

## Task 13: Next.js — Run Execution View

**Files:**
- Create: `web/app/projects/[projectId]/runs/page.tsx`
- Create: `web/app/projects/[projectId]/runs/[runId]/page.tsx`
- Create: `web/components/run/ExecutionView.tsx`
- Create: `web/components/run/OutputPanel.tsx`
- Create: `web/components/run/GateApproval.tsx`
- Create: `web/stores/run.ts`
- Create: `web/lib/ws.ts`

- [ ] **Step 1: Write WebSocket client**

```typescript
// web/lib/ws.ts
export function connectRunWS(runId: string, onMessage: (msg: any) => void): WebSocket {
  const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080') + `/api/ws/runs/${runId}`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    } catch {}
  };

  ws.onerror = (err) => console.error('WebSocket error:', err);
  return ws;
}
```

- [ ] **Step 2: Write run store**

```typescript
// web/stores/run.ts
import { create } from 'zustand';
import { api } from '@/lib/api';
import { connectRunWS } from '@/lib/ws';

interface Run {
  id: string;
  harness_id: string;
  status: string;
  trigger_type: string;
  metrics: any;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

interface NodeState {
  status: string;
  attempt: number;
  error?: string;
}

interface RunState {
  runs: Run[];
  current: Run | null;
  nodeStates: Record<string, NodeState>;
  streamEvents: Record<string, any[]>;  // nodeId -> events
  ws: WebSocket | null;

  fetchRuns: (harnessId: string) => Promise<void>;
  fetchRun: (id: string) => Promise<void>;
  startRun: (harnessId: string) => Promise<string>;
  connectWS: (runId: string) => void;
  disconnectWS: () => void;
  abortRun: (runId: string) => Promise<void>;
  approveGate: (runId: string, nodeId: string) => Promise<void>;
  rejectGate: (runId: string, nodeId: string) => Promise<void>;
}

export const useRunStore = create<RunState>((set, get) => ({
  runs: [],
  current: null,
  nodeStates: {},
  streamEvents: {},
  ws: null,

  fetchRuns: async (harnessId) => {
    const runs = await api<Run[]>(`/harnesses/${harnessId}/runs`);
    set({ runs: runs || [] });
  },

  fetchRun: async (id) => {
    const run = await api<Run>(`/runs/${id}`);
    set({ current: run });
  },

  startRun: async (harnessId) => {
    const run = await api<Run>(`/harnesses/${harnessId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ input: {} }),
    });
    set((s) => ({ runs: [run, ...s.runs], current: run }));
    return run.id;
  },

  connectWS: (runId) => {
    const ws = connectRunWS(runId, (msg) => {
      if (msg.type === 'node_status') {
        set((s) => ({
          nodeStates: {
            ...s.nodeStates,
            [msg.nodeId]: { status: msg.status, attempt: msg.attempt || 0, error: msg.error },
          },
        }));
      } else if (msg.type === 'stream_event') {
        set((s) => ({
          streamEvents: {
            ...s.streamEvents,
            [msg.nodeId]: [...(s.streamEvents[msg.nodeId] || []), msg.event],
          },
        }));
      } else if (msg.type === 'status') {
        set((s) => s.current ? { current: { ...s.current, status: msg.status } } : {});
      }
    });
    set({ ws });
  },

  disconnectWS: () => {
    const { ws } = get();
    if (ws) ws.close();
    set({ ws: null });
  },

  abortRun: async (runId) => {
    await api(`/runs/${runId}/abort`, { method: 'POST' });
  },

  approveGate: async (runId, nodeId) => {
    await api(`/runs/${runId}/gate/${nodeId}/approve`, { method: 'POST' });
  },

  rejectGate: async (runId, nodeId) => {
    await api(`/runs/${runId}/gate/${nodeId}/reject`, { method: 'POST' });
  },
}));
```

- [ ] **Step 3: Write execution view component**

```tsx
// web/components/run/ExecutionView.tsx
"use client";
import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useRunStore } from '@/stores/run';
import { AgentNode } from '@/components/harness/AgentNode';
import { ConditionNode } from '@/components/harness/ConditionNode';
import { GateNode } from '@/components/harness/GateNode';

export function ExecutionView({ harnessId, runId }: { harnessId: string; runId: string }) {
  const { nodeStates, connectWS, disconnectWS } = useRunStore();

  useEffect(() => {
    connectWS(runId);
    return () => disconnectWS();
  }, [runId]);

  // Merge node execution states into flow nodes
  // (Would load harness definition and overlay states)

  const nodeTypes: NodeTypes = {
    agent: AgentNode,
    condition: ConditionNode,
    gate: GateNode,
  };

  return (
    <div className="w-full h-full">
      <ReactFlow nodes={[]} edges={[]} nodeTypes={nodeTypes} fitView>
        <Background />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 4: Write output panel**

```tsx
// web/components/run/OutputPanel.tsx
"use client";
import { useRunStore } from '@/stores/run';

export function OutputPanel() {
  const { streamEvents, nodeStates } = useRunStore();

  return (
    <div className="glass-subtle rounded-xl p-4 font-mono text-[11px] leading-[18px] max-h-[400px] overflow-auto">
      {Object.entries(streamEvents).map(([nodeId, events]) => (
        <div key={nodeId} className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">
            {nodeId} {nodeStates[nodeId] && `(${nodeStates[nodeId].status})`}
          </div>
          {events.map((event, i) => (
            <div key={i} className="text-foreground/80">
              {event.type === 'text' && <span>{event.content}</span>}
              {event.type === 'tool_use' && <span className="text-indigo-600">[{event.toolName}]</span>}
              {event.type === 'error' && <span className="text-destructive">{event.content}</span>}
            </div>
          ))}
        </div>
      ))}
      {Object.keys(streamEvents).length === 0 && (
        <p className="text-muted-foreground text-center py-8">No output yet. Start a run to see agent output.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write gate approval component**

```tsx
// web/components/run/GateApproval.tsx
"use client";
import { useRunStore } from '@/stores/run';

export function GateApproval({ runId, nodeId }: { runId: string; nodeId: string }) {
  const { approveGate, rejectGate } = useRunStore();

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-medium">Gate Checkpoint</h3>
      <p className="text-xs text-muted-foreground">Review the output above and decide.</p>
      <div className="flex gap-2">
        <button onClick={() => approveGate(runId, nodeId)}
          className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs">
          Approve
        </button>
        <button onClick={() => rejectGate(runId, nodeId)}
          className="bg-destructive text-white px-3 py-1.5 rounded-lg text-xs">
          Reject
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write run list and run detail pages**

Write `web/app/projects/[projectId]/runs/page.tsx` (list of runs with status badges) and `web/app/projects/[projectId]/runs/[runId]/page.tsx` (execution view + output panel).

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: run execution view with real-time WebSocket updates"
```

---

## Task 14: Integration — Wire Daemon to API

**Files:**
- Modify: `daemon/cmd/daemon/main.go`
- Modify: `daemon/internal/sync/ws.go`

- [ ] **Step 1: Add run execution flow to daemon**

Update the daemon to:
1. Connect to API via WebSocket
2. Listen for `execute_run` messages
3. Fetch harness definition from API
4. Create StateMachine and execute
5. Stream node status changes back via WebSocket

- [ ] **Step 2: Add API endpoint for daemon to fetch harness**

Add `GET /api/internal/harnesses/{id}` (no auth, for daemon use) to the Go API.

- [ ] **Step 3: Test end-to-end flow**

```bash
# 1. Start PostgreSQL
docker-compose up -d

# 2. Start API
cd api && go run cmd/server/main.go

# 3. Start daemon
cd daemon && AUTH_TOKEN=test go run cmd/daemon/main.go

# 4. Start frontend
cd web && npm run dev

# 5. Open http://localhost:3000
# 6. Register, create project, create harness, add nodes, save, run
```

- [ ] **Step 4: Commit**

```bash
git add api/ daemon/
git commit -m "feat: wire daemon to API for end-to-end execution"
```

---

## Task 15: Polish — Design System + Empty States + Loading

**Files:**
- Modify: `web/app/globals.css`
- Create: `web/components/ui/` (shadcn/ui components)

- [ ] **Step 1: Set up shadcn/ui**

```bash
cd web
npx shadcn@latest init
npx shadcn@latest add button badge card dialog input label
```

- [ ] **Step 2: Add glassmorphism CSS classes to globals.css**

```css
.glass-subtle {
  background: oklch(1 0 0 / 0.4);
  backdrop-filter: blur(14px) saturate(1.3);
}
.glass {
  background: oklch(1 0 0 / 0.55);
  backdrop-filter: blur(20px) saturate(1.4);
}
.glass-strong {
  background: oklch(1 0 0 / 0.72);
  backdrop-filter: blur(28px) saturate(1.5);
}
.glass-card {
  background: oklch(1 0 0 / 0.55);
  backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid oklch(0.86 0 0 / 0.6);
}
```

- [ ] **Step 3: Add empty states to all list pages**

Ensure every list page (projects, agents, harnesses, runs) has a meaningful empty state with icon + text + CTA.

- [ ] **Step 4: Add loading states**

Add skeleton loaders or spinner for async operations.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: design system polish, empty states, loading states"
```

---

## Verification

After completing all tasks, verify the full loop:

1. `docker-compose up -d` — PostgreSQL running
2. `cd api && go run cmd/server/main.go` — API on :8080
3. `cd daemon && go run cmd/daemon/main.go` — Daemon connected
4. `cd web && npm run dev` — Frontend on :3000
5. Register user, create project
6. Create agents (Planner, Implementer, Verifier)
7. Create harness with 3 agent nodes connected in sequence
8. Click "Run" — observe execution in real-time
9. Verify gate node pauses for approval
10. Verify constraint check triggers retry on failure
