# Coolify Self-Hosted Infrastructure

This is the recommended setup for running DragonFruit API, worker, and beat without relying on Upstash for Redis.

## Recommended Topology

Use separate services for separate jobs:

- Postgres: primary database.
- Redis: Django cache and short-lived app state.
- RabbitMQ: Celery broker for API, worker, and beat.
- MinIO: S3-compatible file storage, optional when replacing external object storage.

For best performance, do not use Redis as the Celery broker. Keep Redis for cache and use RabbitMQ for background jobs. This reduces Redis command volume and prevents queue traffic from competing with cache traffic.

## Coolify Services

Create these services in the same Coolify project/network as API, worker, and beat:

- `dragonfruit-postgres`
- `dragonfruit-redis`
- `dragonfruit-rabbitmq`
- `dragonfruit-minio` (optional, for uploads/assets)

Enable persistent storage for:

- Postgres data directory
- Redis data directory, if persistence is enabled
- RabbitMQ data directory
- MinIO data directory

## Environment Variables

Set these on API, worker, and beat.

```env
# Database
DATABASE_URL=postgresql://<postgres_user>:<postgres_password>@dragonfruit-postgres:5432/<postgres_db>

# Cache
REDIS_URL=redis://:<redis_password>@dragonfruit-redis:6379/0

# Celery broker
AMQP_URL=amqp://<rabbitmq_user>:<rabbitmq_password>@dragonfruit-rabbitmq:5672/<rabbitmq_vhost>
```

If you do not set `AMQP_URL`, the app falls back to these RabbitMQ variables:

```env
RABBITMQ_HOST=dragonfruit-rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=<rabbitmq_user>
RABBITMQ_PASSWORD=<rabbitmq_password>
RABBITMQ_VHOST=<rabbitmq_vhost>
```

Prefer `AMQP_URL` in Coolify because it is one value to keep consistent across API, worker, and beat.

## MinIO Variables

Use these on API, worker, and any service that needs file upload/storage access.

```env
USE_MINIO=1
AWS_ACCESS_KEY_ID=<minio_access_key>
AWS_SECRET_ACCESS_KEY=<minio_secret_key>
AWS_S3_ENDPOINT_URL=http://dragonfruit-minio:9000
AWS_S3_BUCKET_NAME=uploads
MINIO_ENDPOINT_SSL=0
```

If MinIO is exposed publicly through HTTPS, keep the internal endpoint for server-to-server traffic and configure the public URL/proxy separately.

## Migration Order

1. Add RabbitMQ in Coolify.
2. Add Redis in Coolify.
3. Update API, worker, and beat with `REDIS_URL` and `AMQP_URL`.
4. Redeploy API, worker, and beat.
5. Confirm worker logs show `transport: amqp://...`, not `rediss://...upstash.io`.
6. Confirm app requests no longer consume Upstash commands.
7. Move Postgres only after Redis/RabbitMQ are stable.
8. Move MinIO only after uploads/assets behavior is confirmed.

## Expected Worker Log

After switching Celery to RabbitMQ, worker startup should include a transport like:

```text
transport: amqp://<user>:**@dragonfruit-rabbitmq:5672/<vhost>
```

If it still shows `rediss://...upstash.io`, `AMQP_URL` is missing or the worker/beat did not receive the updated environment.

## Performance Notes

- RabbitMQ is better for Celery queues than Redis under sustained task load.
- Redis remains very fast for cache/session style reads and writes.
- Keeping API, worker, beat, Redis, and RabbitMQ on the same private Docker network reduces network latency.
- Postgres performance depends mostly on disk, memory, backups, and connection pooling. Migrate it later and carefully.
- MinIO improves control and can reduce cost, but it is not the first bottleneck unless uploads/assets are slow or expensive.
