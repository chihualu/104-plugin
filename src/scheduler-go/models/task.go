package models

import (
	"time"
)

type ScheduledTask struct {
	ID          int       `db:"id"`
	UserID      int       `db:"userId"`
	ScheduledAt time.Time `db:"scheduledAt"`
	Lat         float64   `db:"lat"`
	Lng         float64   `db:"lng"`
	Status      string    `db:"status"`
	Result      *string   `db:"result"`
	CreatedAt   time.Time `db:"createdAt"`
	UpdatedAt   time.Time `db:"updatedAt"`
}
