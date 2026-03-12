package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gitlab-mr-service/internal/config"
	"gitlab-mr-service/internal/gitlab"
	"gitlab-mr-service/internal/handler"
	"gitlab-mr-service/internal/middleware"
)

func main() {
	// Initialize structured logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	// Initialize GitLab client
	gitlabClient, err := gitlab.NewClient(cfg.GitLabToken, cfg.GitLabURL)
	if err != nil {
		logger.Error("failed to create GitLab client", "error", err)
		os.Exit(1)
	}

	// Initialize handler
	h := handler.NewHandler(gitlabClient, logger)

	// Setup routes
	mux := http.NewServeMux()

	// Merge Request endpoints
	mux.HandleFunc("GET /projects/{projectID}/merge_requests", h.ListMergeRequests)
	mux.HandleFunc("GET /projects/{projectID}/merge_requests/{mrIID}", h.GetMergeRequest)
	mux.HandleFunc("POST /projects/{projectID}/merge_requests", h.CreateMergeRequest)

	// Comments/Notes endpoint
	mux.HandleFunc("POST /projects/{projectID}/merge_requests/{mrIID}/notes", h.AddComment)

	// Diffs endpoint
	mux.HandleFunc("GET /projects/{projectID}/merge_requests/{mrIID}/diffs", h.GetDiffs)

	// Jobs/Pipelines endpoints
	mux.HandleFunc("GET /projects/{projectID}/merge_requests/{mrIID}/jobs", h.GetJobs)
	mux.HandleFunc("GET /projects/{projectID}/pipelines/{pipelineID}/jobs", h.GetPipelineJobs)

	// Discussions/Review comments endpoint
	mux.HandleFunc("GET /projects/{projectID}/merge_requests/{mrIID}/discussions", h.GetDiscussions)

	// Participants endpoint
	mux.HandleFunc("GET /projects/{projectID}/merge_requests/{mrIID}/participants", h.GetParticipants)

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Apply middleware
	var httpHandler http.Handler = mux
	httpHandler = middleware.Logging(logger)(httpHandler)
	httpHandler = middleware.Recovery(logger)(httpHandler)

	// Create server
	server := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      httpHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logger.Info("starting server", "port", cfg.ServerPort, "gitlab_url", cfg.GitLabURL)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
