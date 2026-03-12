package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"gitlab-mr-service/internal/gitlab"
)

// Handler holds dependencies for HTTP handlers.
type Handler struct {
	client *gitlab.Client
	logger *slog.Logger
}

// NewHandler creates a new Handler with the given GitLab client and logger.
func NewHandler(client *gitlab.Client, logger *slog.Logger) *Handler {
	return &Handler{
		client: client,
		logger: logger,
	}
}

// ErrorResponse represents an error response body.
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// respondJSON writes a JSON response with the given status code.
func (h *Handler) respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			h.logger.Error("failed to encode response", "error", err)
		}
	}
}

// respondError writes an error response with the given status code.
func (h *Handler) respondError(w http.ResponseWriter, status int, err error) {
	h.respondJSON(w, status, ErrorResponse{
		Error:   http.StatusText(status),
		Message: err.Error(),
	})
}

// decodeJSON decodes the request body into the given value.
func (h *Handler) decodeJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

// formValueOrFile returns a form field value from the request. It first checks
// r.FormValue (simple form fields), then falls back to reading from
// r.MultipartForm.File (file upload parts sent via curl -F key="<file").
func formValueOrFile(r *http.Request, key string) string {
	if v := r.FormValue(key); v != "" {
		return v
	}
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		if files, ok := r.MultipartForm.File[key]; ok && len(files) > 0 {
			f, err := files[0].Open()
			if err != nil {
				return ""
			}
			defer f.Close()
			data, err := io.ReadAll(f)
			if err != nil {
				return ""
			}
			return string(data)
		}
	}
	return ""
}
