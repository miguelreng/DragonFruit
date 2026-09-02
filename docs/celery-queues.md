# Celery queue isolation

DragonFruit separates background work into five RabbitMQ queues:

- `emails`: transactional email such as workspace invitations, magic links, and password resets.
- `logs`: asynchronous API request persistence.
- `agents`: long-running Atlas and workflow LLM/tool loops.
- `exports`: memory-intensive exports, workspace seeds, and bulk object copies.
- `celery`: all remaining work and the legacy backlog from deployments created before queue isolation.

The worker entrypoint consumes all five queues by default for backward compatibility. Production should run dedicated
worker pools so email delivery and request-adjacent jobs are independent of slow or memory-intensive work.

Every worker launched through `docker-entrypoint-worker.sh` has bounded defaults:

- concurrency `2`;
- prefetch multiplier `1`;
- recycle after `100` tasks;
- recycle after a child exceeds `400000` KiB RSS.

These are safety defaults, not capacity targets. Production scales by adding replicas to a queue-specific pool. Do not
raise concurrency until a load test demonstrates that the container has enough memory for that many child processes.

## Recommended Coolify workers

All workers use the API image and the same database, Redis, RabbitMQ, and email environment variables as the API.
Copy the non-secret settings from
[`deployments/coolify/service-profiles`](../deployments/coolify/service-profiles) into the matching Coolify services.

### General worker

```bash
./bin/docker-entrypoint-worker.sh
```

Set `CELERY_QUEUES=celery`. Keep this pool running permanently because `celery` remains the default queue.

### Email worker

```bash
CELERY_QUEUES=emails ./bin/docker-entrypoint-worker.sh
```

Run at least two replicas on different worker hosts. This pool handles invitations and other transactional email without
waiting behind general work.

### Logging worker

```bash
CELERY_QUEUES=logs ./bin/docker-entrypoint-worker.sh
```

Request logging is isolated here. `plane.bgtasks.logger_task.process_logs` is explicitly imported so the worker does not discard it as an unregistered task.

### Agent worker

```bash
CELERY_QUEUES=agents ./bin/docker-entrypoint-worker.sh
```

Use concurrency `1` initially because one child may hold an LLM conversation and multiple tool responses for a long
time. Scale this queue horizontally from queue depth and oldest-message age.

### Export worker

```bash
CELERY_QUEUES=exports ./bin/docker-entrypoint-worker.sh
```

Use concurrency `1`. Export tasks may materialize querysets, CSV/XLSX data, and archives in memory. Give this pool a
larger per-container memory limit than email or logging.

## Safe rollout order

1. Deploy the new worker image first. Its default queue list consumes all five queues.
2. Create and verify the dedicated `agents` and `exports` pools.
3. Deploy the API so new tasks begin routing to the new queues.
4. Create or update the dedicated email and logging pools.
5. Restrict the original worker to `CELERY_QUEUES=celery` after every dedicated pool is healthy.
6. Deploy the beat worker so every service runs the same code revision.

Never purge a queue during rollout. Old workers may finish already-reserved tasks while new workers begin consuming.

Useful read-only queue check from any API container:

```bash
python -c "from plane.celery import app; c=app.connection(); c.connect(); ch=c.channel(); [print(q, ch.queue_declare(queue=q, passive=True).message_count) for q in ('celery', 'emails', 'logs', 'agents', 'exports')]; c.release()"
```

## Required monitoring

Alert before the host is in danger:

- host memory above 80% for 10 minutes;
- swap usage above 25%;
- any container OOM or unexpected restart;
- worker RSS approaching its container limit;
- queue depth and oldest-message age rising for 10 minutes;
- no healthy worker consuming a declared queue.

Swap is an emergency buffer only. API and worker replicas must run on multiple hosts so losing one machine does not
take down the service.
