FROM golang:1.22-bookworm AS gitlab-service-builder

WORKDIR /src/gitlab-mr-service

COPY tools/gitlab-mr-service/go.mod tools/gitlab-mr-service/go.sum ./
RUN go mod download

COPY tools/gitlab-mr-service/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/gitlab-mr-service ./main.go

FROM python:3.12-slim

WORKDIR /app

COPY mcps/gitlab-mr-service-mcp-py/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY mcps/gitlab-mr-service-mcp-py/server.py ./server.py
COPY --from=gitlab-service-builder /out/gitlab-mr-service /usr/local/bin/gitlab-mr-service

CMD ["python", "/app/server.py"]
