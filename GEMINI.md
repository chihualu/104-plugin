# Project Overview: 104-plugin

**104-plugin** is an automated attendance and HR management system designed to integrate with the **104 Enterprise HR** platform. It provides a modern mobile-friendly interface and seamless integration with **LINE Bot** for features like GPS check-in, salary slip viewing, and leave management.

## Tech Stack

### Frontend (Client)
- **Framework:** React 18 (TypeScript)
- **Build Tool:** Vite 7
- **UI Library:** Ant Design Mobile (`antd-mobile`)
- **Routing:** React Router DOM 7
- **Maps:** Leaflet / React-Leaflet (for Location Picking)
- **State/Logic:** Custom Hooks, Axios for API

### Backend (Server)
- **Runtime:** Node.js (TypeScript)
- **Framework:** Express 5
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Logging:** Pino
- **Security:** Helmet (CSP), CORS, Rate Limiting
- **Scheduling:** node-cron (for automated check-ins)

### Integrations
- **104 HR:** Custom adapter (`Hr104Adapter`) using Axios/Cheerio for API interaction and scraping.
- **LINE Platform:** LINE Front-end Framework (LIFF) & Messaging API (Webhook).

## Project Structure

```text
D:\workspace\104-plugin\
├── src\
│   ├── client\           # Frontend Application (React)
│   │   ├── pages\        # Application Routes (CheckIn, Salary, etc.)
│   │   ├── components\   # Reusable UI Components
│   │   └── ...
│   ├── server\           # Backend API (Express)
│   │   ├── controllers\  # Request Handlers
│   │   ├── services\     # Business Logic (Scheduler, LineBot, HR)
│   │   ├── adapters\     # External API Adapters (104 HR)
│   │   ├── middleware\   # Auth, Logging, Error Handling
│   │   └── ...
│   └── shared\           # Shared Types between Client and Server
├── prisma\               # Database Schema & Migrations
├── config\               # Configuration files
├── .github\workflows\    # CI/CD Pipelines
├── docker-compose.yml    # Container Orchestration
└── Dockerfile            # Application Containerization
```

## Key Features

1.  **Smart Check-in:**
    *   GPS-based clock-in/clock-out.
    *   Scheduled check-ins (set a time and location).
    *   Full-screen loading overlays and validation.

2.  **HR Management:**
    *   **Salary Slips:** Secure decryption and viewing of monthly payslips.
    *   **Leave Management:** View leave balance and history.
    *   **Audit Logs:** Track usage and check-in history.

3.  **Line Integration:**
    *   Bind 104 accounts to LINE users.
    *   Receive notifications via LINE Bot.
    *   LIFF integration for seamless mobile experience.

## Database Schema (Prisma)

*   **UserBinding:** Stores mapping between LINE User ID and 104 credentials (encrypted tokens, cookies).
*   **ScheduledTask:** Manages deferred execution of tasks (e.g., auto check-in at a specific time/location).
*   **UsageLog:** Audit trail for user actions (Check-in, Audit).

## Development Setup

### Prerequisites
*   Node.js (v18+)
*   PostgreSQL

### Installation
```bash
npm install
```

### Database Migration
```bash
npx prisma migrate dev
```

### Running Locally
To run both client and server concurrently:
```bash
npm run dev
```
*   Server runs on: `http://localhost:3001`
*   Client runs on: `http://localhost:5173` (proxies API requests to 3001)

## Recent Changes (as of Feb 2026)
*   **Backend Migration:** Completely removed the legacy Go backend (`backend-go`). The system now runs entirely on a Node.js/TypeScript stack.
*   **UI Refresh:** Implemented "Modern" UI with "Milk Tea" theme and improved typography.
*   **Feature Update:** Added Line Bot Webhook handling and Scheduler Service for automated tasks.
