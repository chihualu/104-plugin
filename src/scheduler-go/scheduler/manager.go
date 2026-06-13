package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"backend-scheduler/db"
	"backend-scheduler/models"
)

type TaskManager struct {
	timers sync.Map // map[int]*time.Timer
	// To store metadata for listing, since Timer doesn't hold task info
	tasks sync.Map // map[int]models.ScheduledTask
}

var GlobalManager = &TaskManager{}

func (m *TaskManager) AddOrUpdateTask(task models.ScheduledTask) {
	// Cancel existing timer if any
	m.RemoveTask(task.ID)

	now := time.Now()
	duration := task.ScheduledAt.Sub(now)

	if duration <= 0 {
		fmt.Printf("Task %d is in the past, skipping registration\n", task.ID)
		return
	}

	timer := time.AfterFunc(duration, func() {
		m.ExecuteTask(task)
	})

	m.timers.Store(task.ID, timer)
	m.tasks.Store(task.ID, task)
	fmt.Printf("Registered task %d for %v (in %v)\n", task.ID, task.ScheduledAt, duration)
}

func (m *TaskManager) RemoveTask(id int) {
	if val, ok := m.timers.Load(id); ok {
		timer := val.(*time.Timer)
		timer.Stop()
		m.timers.Delete(id)
		m.tasks.Delete(id)
		fmt.Printf("Cancelled task %d\n", id)
	}
}

func (m *TaskManager) ExecuteTask(task models.ScheduledTask) {
	m.timers.Delete(task.ID)
	m.tasks.Delete(task.ID)
	fmt.Printf(">>> EXECUTING TASK %d (UserID: %d, Time: %v)\n", task.ID, task.UserID, task.ScheduledAt)
	
	nodeURL := os.Getenv("NODE_SERVER_URL")
	if nodeURL == "" {
		nodeURL = "http://localhost:3000"
	}

	apiURL := fmt.Sprintf("%s/api/internal/execute-task", nodeURL)
	payload, _ := json.Marshal(map[string]int{"taskId": task.ID})
	secret := os.Getenv("INTERNAL_API_SECRET")

	// Simple Retry Mechanism
	maxRetries := 3
	for i := 0; i < maxRetries; i++ {
		req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(payload))
		if err != nil {
			fmt.Printf("Attempt %d: Failed to build request for task %d: %v\n", i+1, task.ID, err)
			time.Sleep(2 * time.Second)
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		if secret != "" {
			req.Header.Set("X-Internal-Secret", secret)
		}

		resp, err := http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			fmt.Printf("Successfully triggered task %d on Node.js\n", task.ID)
			resp.Body.Close()
			return
		}

		if err != nil {
			fmt.Printf("Attempt %d: Failed to trigger task %d: %v\n", i+1, task.ID, err)
		} else {
			fmt.Printf("Attempt %d: Node.js returned status %d for task %d\n", i+1, resp.StatusCode, task.ID)
			resp.Body.Close()
		}

		time.Sleep(2 * time.Second)
	}

	fmt.Printf("CRITICAL: Failed to trigger task %d after %d retries\n", task.ID, maxRetries)
}

func (m *TaskManager) SyncTaskFromDB(id int) error {
	var t models.ScheduledTask
	err := db.Pool.QueryRow(context.Background(),
		`SELECT id, "userId", "scheduledAt", lat, lng, status, result, "createdAt", "updatedAt" 
		 FROM "ScheduledTask" 
		 WHERE id = $1`, id).Scan(
		&t.ID, &t.UserID, &t.ScheduledAt, &t.Lat, &t.Lng, 
		&t.Status, &t.Result, &t.CreatedAt, &t.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to fetch task %d: %v", id, err)
	}

	if t.Status == "PENDING" {
		// Strict Month Check: Only register if task is in CURRENT MONTH
		now := time.Now()
		startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		startOfNextMonth := startOfMonth.AddDate(0, 1, 0)

		if t.ScheduledAt.Before(startOfMonth) || t.ScheduledAt.After(startOfNextMonth) || t.ScheduledAt.Equal(startOfNextMonth) {
			// Task is not for this month. 
			// If we previously had it (e.g. user moved it from this month to next), we must remove it.
			m.RemoveTask(t.ID)
			fmt.Printf("Sync: Task %d is scheduled for %v (Not current month), skipping/removing\n", t.ID, t.ScheduledAt)
		} else {
			m.AddOrUpdateTask(t)
		}
	} else {
		m.RemoveTask(t.ID)
	}

	return nil
}

type TaskSummary struct {
	ID          int       `json:"id"`
	UserID      int       `json:"userId"`
	ScheduledAt time.Time `json:"scheduledAt"`
	SecondsLeft float64   `json:"secondsLeft"`
}

func (m *TaskManager) ListTasks() []TaskSummary {
	var list []TaskSummary
	now := time.Now()

	m.tasks.Range(func(key, value interface{}) bool {
		task := value.(models.ScheduledTask)
		list = append(list, TaskSummary{
			ID:          task.ID,
			UserID:      task.UserID,
			ScheduledAt: task.ScheduledAt,
			SecondsLeft: task.ScheduledAt.Sub(now).Seconds(),
		})
		return true
	})

	return list
}