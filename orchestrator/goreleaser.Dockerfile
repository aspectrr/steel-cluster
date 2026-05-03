FROM alpine:3.21
RUN apk --no-cache add ca-certificates
COPY orchestrator /app/orchestrator
EXPOSE 3000
CMD ["/app/orchestrator"]
