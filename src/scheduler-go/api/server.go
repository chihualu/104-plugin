package api

import (
	"net/http"

	"backend-scheduler/scheduler"
	"github.com/gin-gonic/gin"
)

type SyncRequest struct {
	TaskID int `json:"taskId" binding:"required"`
}

func StartServer(port string) error {
	r := gin.Default()

	r.POST("/tasks/sync", func(c *gin.Context) {
		var req SyncRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		err := scheduler.GlobalManager.SyncTaskFromDB(req.TaskID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Task synced successfully", "taskId": req.TaskID})
	})

	r.GET("/tasks", func(c *gin.Context) {
		tasks := scheduler.GlobalManager.ListTasks()
		c.JSON(http.StatusOK, gin.H{
			"count": len(tasks),
			"tasks": tasks,
		})
	})

	return r.Run(":" + port)
}
