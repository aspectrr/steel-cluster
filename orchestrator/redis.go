package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(host string, port int) (*RedisStore, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         fmt.Sprintf("%s:%d", host, port),
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	return &RedisStore{client: client}, nil
}

func (r *RedisStore) SaveSession(ctx context.Context, session SessionData) error {
	key := fmt.Sprintf("session:%s", session.ID)
	data, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}
	if err := r.client.Set(ctx, key, data, time.Duration(session.TimeoutSeconds)*time.Second).Err(); err != nil {
		return fmt.Errorf("redis set: %w", err)
	}
	// Maintain index
	r.client.SAdd(ctx, "sessions:index", session.ID)
	return nil
}

func (r *RedisStore) GetSession(ctx context.Context, sessionID string) (SessionData, error) {
	key := fmt.Sprintf("session:%s", sessionID)
	data, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		return SessionData{}, fmt.Errorf("session not found: %w", err)
	}
	var session SessionData
	if err := json.Unmarshal(data, &session); err != nil {
		return SessionData{}, fmt.Errorf("unmarshal session: %w", err)
	}
	return session, nil
}

func (r *RedisStore) DeleteSession(ctx context.Context, sessionID string) error {
	key := fmt.Sprintf("session:%s", sessionID)
	r.client.Del(ctx, key)
	r.client.SRem(ctx, "sessions:index", sessionID)
	return nil
}

func (r *RedisStore) ListSessions(ctx context.Context) ([]SessionData, error) {
	ids, err := r.client.SMembers(ctx, "sessions:index").Result()
	if err != nil {
		return nil, err
	}

	var sessions []SessionData
	for _, id := range ids {
		key := fmt.Sprintf("session:%s", id)
		data, err := r.client.Get(ctx, key).Bytes()
		if err != nil {
			continue // expired
		}
		var session SessionData
		if err := json.Unmarshal(data, &session); err != nil {
			continue
		}
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func (r *RedisStore) SessionExists(ctx context.Context, sessionID string) (bool, error) {
	key := fmt.Sprintf("session:%s", sessionID)
	n, err := r.client.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
