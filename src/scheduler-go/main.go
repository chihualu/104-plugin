package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"backend-scheduler/api"
	"backend-scheduler/db"
	"backend-scheduler/models"
	"backend-scheduler/scheduler"
)

func main() {
	err := db.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.CloseDB()

	tasks, err := fetchPendingTasks()
	if err != nil {
		log.Fatalf("Failed to fetch pending tasks: %v", err)
	}

	fmt.Printf("Initializing scheduler with %d pending tasks...\n", len(tasks))
	for _, task := range tasks {
		scheduler.GlobalManager.AddOrUpdateTask(task)
	}

	// Start Daily Cleaner
	go startDailyCleaner()

	// Start Monthly Task Loader
	go startMonthlyLoader()

	// Start Monthly Attendance Check Trigger (Every 25th at 10:00)
	go startMonthlyAttendanceCheckCron()

	port := os.Getenv("SCHEDULER_PORT")
	if port == "" {
		port = "4000"
	}

	fmt.Printf("Starting API server on port %s...\n", port)
	if err := api.StartServer(port); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}
}

func startMonthlyLoader() {
	// Calculate duration until next 1st of month 01:00
	now := time.Now()
	nextMonth := time.Date(now.Year(), now.Month()+1, 1, 1, 0, 0, 0, now.Location())
	duration := nextMonth.Sub(now)

	fmt.Printf("Monthly Loader: Next load scheduled in %v (%v)\n", duration, nextMonth)

	// Timer for the first run
	time.AfterFunc(duration, func() {
		loadCurrentMonthTasks()
		// After first run, switch to periodic ticker (approx 30 days, but logic needs to be exact)
		// Simpler: Just recursively schedule next month
		startMonthlyLoader()
	})
}

func loadCurrentMonthTasks() {
	fmt.Println("--- Loading Current Month Tasks ---")
	tasks, err := fetchPendingTasks()
	if err != nil {
		fmt.Printf("Failed to load monthly tasks: %v\n", err)
		return
	}
	
	count := 0
	for _, task := range tasks {
		scheduler.GlobalManager.AddOrUpdateTask(task)
		count++
	}
	fmt.Printf("Monthly Loader: Loaded %d tasks for this month\n", count)
}

func startDailyCleaner() {
	// Execute immediately on startup to clean old mess
	cleanExpiredTasks()

	// Ticker for every 24 hours
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		cleanExpiredTasks()
	}
}

func startMonthlyAttendanceCheckCron() {
	for {
		now := time.Now()
		// Target: 25th of current or next month at 10:00
		target := time.Date(now.Year(), now.Month(), 25, 10, 0, 0, 0, now.Location())

		if now.After(target) {
			// Already passed 25th this month, target next month
			target = target.AddDate(0, 1, 0)
		}

		duration := target.Sub(now)
		fmt.Printf("Monthly Attendance Check: Next trigger in %v (%v)\n", duration, target)

		time.Sleep(duration)
		triggerMonthlyCheckAPI()

		// Small buffer to avoid immediate re-trigger if execution was instant
		time.Sleep(1 * time.Minute)
	}
}

func triggerMonthlyCheckAPI() {
	fmt.Println(">>> TRIGGERING MONTHLY ATTENDANCE CHECK <<<")
	nodeURL := os.Getenv("NODE_SERVER_URL")
	if nodeURL == "" {
		nodeURL = "http://localhost:3000"
	}

	apiURL := fmt.Sprintf("%s/api/internal/monthly-check", nodeURL)

	resp, err := http.Post(apiURL, "application/json", nil)
	if err != nil {
		fmt.Printf("Failed to trigger monthly check: %v\n", err)
		return
	}
	defer resp.Body.Close()

	fmt.Printf("Monthly check triggered, Node.js returned status %d\n", resp.StatusCode)
}

func cleanExpiredTasks() {
	// ... (content unchanged)
	fmt.Println("--- Running Daily Cleaner ---")
	
	// 1. Expire past PENDING tasks
	tag, err := db.Pool.Exec(context.Background(),
		`UPDATE "ScheduledTask" 
		 SET status = 'EXPIRED', result = 'System Auto-Expire' 
		 WHERE status = 'PENDING' AND "scheduledAt" < NOW()`)
	
	if err != nil {
		fmt.Printf("Cleaner Update Error: %v\n", err)
	} else if count := tag.RowsAffected(); count > 0 {
		fmt.Printf("Cleaner: Expired %d old tasks\n", count)
	}

	// 2. Delete CANCELLED tasks
	tagDel, err := db.Pool.Exec(context.Background(),
		`DELETE FROM "ScheduledTask" WHERE status = 'CANCELLED'`)
	
	if err != nil {
		fmt.Printf("Cleaner Delete Error: %v\n", err)
	} else if count := tagDel.RowsAffected(); count > 0 {
		fmt.Printf("Cleaner: Deleted %d cancelled tasks\n", count)
	}

	fmt.Println("--- Daily Cleaner Finished ---")
}

func fetchPendingTasks() ([]models.ScheduledTask, error) {
	// Load tasks for CURRENT MONTH only
	// Logic: FROM 1st of current month 00:00 TO last of current month 23:59 (or simply < 1st of next month)
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	startOfNextMonth := startOfMonth.AddDate(0, 1, 0)

	rows, err := db.Pool.Query(context.Background(), 
		`SELECT id, "userId", "scheduledAt", lat, lng, status, result, "createdAt", "updatedAt" 
		 FROM "ScheduledTask" 
		 WHERE status = 'PENDING' 
		 AND "scheduledAt" >= $1 AND "scheduledAt" < $2`, 
		 startOfMonth, startOfNextMonth)
		 
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []models.ScheduledTask
	for rows.Next() {
		var t models.ScheduledTask
		err := rows.Scan(
			&t.ID, &t.UserID, &t.ScheduledAt, &t.Lat, &t.Lng, 
			&t.Status, &t.Result, &t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}

	if rows.Err() != nil {
		return nil, rows.Err()
	}

	return tasks, nil
}
