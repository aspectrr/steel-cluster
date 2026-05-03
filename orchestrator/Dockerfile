FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /orchestrator .

FROM alpine:3.21
RUN apk --no-cache add ca-certificates
COPY --from=builder /orchestrator /app/orchestrator
EXPOSE 3000
CMD ["/app/orchestrator"]
