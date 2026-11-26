# Tiny image for hosts that run the sweep as a separate cron service (Render, Railway).
# Needs SWEEP_URL (https://your-app/api/cron/sweep) and CRON_SECRET.
FROM alpine:3.20
RUN apk add --no-cache curl
CMD ["sh", "-c", "curl -fsS --max-time 290 -H \"Authorization: Bearer $CRON_SECRET\" \"$SWEEP_URL\""]
