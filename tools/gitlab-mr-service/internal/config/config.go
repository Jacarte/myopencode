package config

import (
	"errors"
	"os"
)

// Config holds the application configuration.
type Config struct {
	// GitLabToken is the personal access token for GitLab API authentication.
	GitLabToken string

	// GitLabURL is the base URL for the GitLab instance.
	// Defaults to https://gitlab.com if not provided.
	GitLabURL string

	// ServerPort is the port the HTTP server listens on.
	// Defaults to 8080 if not provided.
	ServerPort string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	token := os.Getenv("GITLAB_TOKEN")
	if token == "" {
		return nil, errors.New("GITLAB_TOKEN environment variable is required")
	}

	gitlabURL := os.Getenv("GITLAB_URL")
	if gitlabURL == "" {
		gitlabURL = "https://gitlab.com"
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	return &Config{
		GitLabToken: token,
		GitLabURL:   gitlabURL,
		ServerPort:  port,
	}, nil
}
