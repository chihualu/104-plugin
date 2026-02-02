# Epic: Backend Refactor - Go-based Dynamic Scheduler

## Epic Goal
Replace the unreliable Node.js polling mechanism with a high-performance, event-driven Go microservice for managing scheduled check-ins, ensuring precise execution and support for dynamic schedule updates.

## Epic Description

**Existing System Context:**
- **Current Functionality:** The system currently uses `node-cron` within the Node.js backend to poll the database every minute for scheduled check-in tasks.
- **Technology Stack:** Node.js, Express, TypeScript, Prisma, PostgreSQL.
- **Pain Points:** 
    - Polling inefficiency (latency up to 59 seconds).
    - Instability of long-running Node.js processes for scheduling.
    - Lack of dynamic rescheduling capabilities without complex logic.

**Enhancement Details:**
- **New Component:** A dedicated **Go Scheduler Service**.
- **Core Logic:**
    1.  **Startup:** Load all pending tasks from PostgreSQL.
    2.  **Scheduling:** Register precise timers (using Go's efficient runtime) for each task.
    3.  **Trigger:** When a timer fires, send an HTTP POST request to the existing Node.js `/check-in` API.
    4.  **Dynamic Update:** Expose an internal RESTful API (`POST /tasks/sync`) for Node.js to notify Go when schedules change.
- **Integration:** Node.js handles UI/DB; Go handles timing/triggering.

## Stories

1.  **Story 1: Go Service Setup & Database Integration**
    - Initialize a new Go module (`backend-scheduler`).
    - Implement PostgreSQL connection (using `pgx` or `gorm`).
    - Create logic to load `ScheduledTask` data on startup.
    - **Deliverable:** A running Go process that can connect to DB and list pending tasks.

2.  **Story 2: Dynamic Scheduler Implementation & Internal API**
    - Implement the efficient timer registry (managing 200+ timers).
    - Create an HTTP server in Go (e.g., using `Gin` or `net/http`) listening on an internal port.
    - Implement `POST /tasks/sync` endpoint to receive update notifications from Node.js.
    - **Deliverable:** Go service that accepts HTTP requests to add/update/remove timers dynamically.

3.  **Story 3: Trigger Execution & Legacy Cleanup**
    - Implement the "Trigger" logic: Send HTTP POST to Node.js `/check-in` when timer fires.
    - Update Node.js code to call the Go service when schedules are modified.
    - **Remove** the old `node-cron` code from Node.js.
    - **Deliverable:** End-to-end working system where setting a time in UI results in a precise check-in, and the old polling code is gone.

## Compatibility Requirements
- **Database:** Must share the existing `ScheduledTask` table in PostgreSQL without altering schema (unless necessary for status tracking).
- **API:** Node.js existing Check-in API remains the single source of truth for the actual "check-in" logic.
- **Deployment:** Go service runs alongside Node.js (e.g., via Docker Compose).

## Risk Mitigation
- **Primary Risk:** Synchronization issues (e.g., Node.js updates DB but fails to notify Go).
- **Mitigation:** 
    - Go service should perform a "full sync" periodically (e.g., every hour) as a fallback safety net.
    - Retry mechanism for the Trigger call (Go -> Node.js) if Node.js is momentarily down.
- **Rollback Plan:** Keep the `node-cron` code commented out or behind a feature flag in Node.js initially. If Go service fails, re-enable the Node.js polling.

## Definition of Done
- [ ] Go service is containerized and running.
- [ ] Users can create/edit schedules in UI, and Go service reflects changes immediately.
- [ ] Check-ins occur at the exact scheduled second.
- [ ] Node.js no longer runs `node-cron` for check-ins.
- [ ] System handles restart gracefully (reloads tasks).
