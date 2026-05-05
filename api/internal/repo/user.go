package repo

import (
	"database/sql"
	"fmt"

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
		`INSERT INTO users (email, name, password_hash)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, name, avatar_url, created_at`,
		email, name, passwordHash,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return &u, nil
}

func (r *UserRepo) GetByEmail(email string) (*model.User, string, error) {
	var u model.User
	var passwordHash string
	err := r.db.QueryRow(
		`SELECT id, email, name, avatar_url, created_at, password_hash
		 FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt, &passwordHash)
	if err != nil {
		return nil, "", fmt.Errorf("get user by email: %w", err)
	}
	return &u, passwordHash, nil
}

func (r *UserRepo) GetByID(id string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRow(
		`SELECT id, email, name, avatar_url, created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.AvatarURL, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}
