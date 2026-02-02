package db

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

var Pool *pgxpool.Pool

func InitDB() error {
	// Load .env from root
	err := godotenv.Load("../../.env")
	if err != nil {
		fmt.Println("Warning: .env file not found, using system environment variables")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL not set")
	}

	// Clean up Prisma-specific query params that pgx doesn't like
	// Specifically, "schema=public" causes "unrecognized configuration parameter"
	if i := strings.Index(dbURL, "?"); i != -1 {
		base := dbURL[:i]
		params := dbURL[i+1:]
		newParams := []string{}
		for _, p := range strings.Split(params, "&") {
			if !strings.HasPrefix(p, "schema=") {
				newParams = append(newParams, p)
			}
		}
		if len(newParams) > 0 {
			dbURL = base + "?" + strings.Join(newParams, "&")
		} else {
			dbURL = base
		}
	}

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return fmt.Errorf("unable to parse DATABASE_URL: %v", err)
	}

	Pool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("unable to connect to database: %v", err)
	}

	err = Pool.Ping(context.Background())
	if err != nil {
		return fmt.Errorf("unable to ping database: %v", err)
	}

	fmt.Println("Successfully connected to database")
	return nil
}

func CloseDB() {
	if Pool != nil {
		Pool.Close()
	}
}
