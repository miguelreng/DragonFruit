# Celery queue isolation

DragonFruit separates background work into three RabbitMQ queues:

- `emails`: transactional email such as workspace invitations, magic links, and password resets.
- `logs`: asynchronous API request persistence.
- `celery`: all remaining work and the legacy backlog from deployments created before queue isolation.

The worker entrypoint consumes all three queues by default for backward compatibility. Production should run dedicated workers so email delivery is independent of logging and general background work.

## Recommended Coolify workers

All workers use the API image and the same database, Redis, RabbitMQ, and email environment variables as the API.

### General worker

```bash
celery -A plane worker -l info -Q celery --hostname=general@%h
```

Keep this worker running until the legacy `celery` queue is empty. Never purge that queue while it contains user work.

### Email worker

```bash
celery -A plane worker -l info -Q emails --hostname=email@%h --concurrency=2
```

Run at least one replica. This worker handles invitations and other transactional email without waiting behind general work.

### Logging worker

```bash
celery -A plane worker -l info -Q logs --hostname=logs@%h --concurrency=2
```

Request logging is isolated here. `plane.bgtasks.logger_task.process_logs` is explicitly imported so the worker does not discard it as an unregistered task.

## Safe rollout order

1. Deploy the worker image first. With no `-Q` option it consumes `celery`, `emails`, and `logs`.
2. Deploy the API so new tasks begin routing to the dedicated queues.
3. Create the dedicated email and logging workers using the commands above.
4. Restrict the original worker to `-Q celery` after the dedicated workers are healthy.
5. Deploy the beat worker so every service runs the same code revision.

Useful read-only queue check from any API container:

```bash
python -c "from plane.celery import app; c=app.connection(); c.connect(); ch=c.channel(); [print(q, ch.queue_declare(queue=q, passive=True).message_count) for q in ('celery', 'emails', 'logs')]; c.release()"
```
