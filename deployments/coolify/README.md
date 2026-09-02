# DragonFruit production topology on Coolify

The public DragonFruit service must not run the API, every worker pool, the Coolify control plane, and stateful data
services on one machine. That layout has a single failure domain and lets one memory spike kill the entire product.

## Minimum production layout

- Two or more API replicas on different hosts behind a load balancer.
- Two or more replicas for each latency-sensitive worker pool (`emails`, `logs`, and `celery`).
- Independently scalable `agents` and `exports` pools, starting with concurrency `1`.
- Exactly one Celery Beat replica.
- PostgreSQL, Redis, RabbitMQ, and object storage outside the application hosts, with backups and provider-level high
  availability appropriate to the launch.
- At least 25% host memory left unallocated for Linux, Docker, the Coolify agent, and short-lived spikes.

The exact replica count is established by load testing. Do not use worker concurrency as a substitute for replicas:
prefork concurrency duplicates the Django/SDK process memory inside one failure domain.

## Coolify services

The production host must never compile the API image. The
[`build-production-api.yml`](../../.github/workflows/build-production-api.yml) workflow builds the Docker image once on
GitHub-hosted infrastructure and publishes two GHCR tags:

- `ghcr.io/<owner>/<repository>-api:<commit-sha>` for immutable releases;
- `ghcr.io/<owner>/<repository>-api:main` as the moving deployment candidate.

Configure the API, Beat, and every worker pool as **Docker Image** resources that pull the same immutable SHA tag. Do
not create separate Git-build resources for each process: that compiles the same Python dependencies concurrently and
can exhaust the production host during every push.

Create a one-shot **migrator** resource from the same immutable image with
`./bin/docker-entrypoint-migrator.sh` as its start command. After that resource is verified, set `RUN_MIGRATIONS=0` on
every API replica using [`service-profiles/api.env`](./service-profiles/api.env). Legacy single-API deployments may
leave `RUN_MIGRATIONS=1`, but multiple API replicas must never race to apply schema changes.

Create each worker pool from the published image and use `./bin/docker-entrypoint-worker.sh` as the start command.
Apply the matching non-secret variables from [`service-profiles`](./service-profiles). All services also need the same
database, Redis, RabbitMQ, storage, Django, and email secrets as the API.

| Service | Initial replicas | Container memory | Health/scaling signal |
| --- | ---: | ---: | --- |
| API | 2+ across hosts | 2 GiB | `/health/ready/`, latency, CPU |
| General worker | 2+ across hosts | 2 GiB | `celery` depth/oldest age |
| Email worker | 2+ across hosts | 1.5 GiB | `emails` depth/oldest age |
| Logging worker | 2+ across hosts | 1.5 GiB | `logs` depth/oldest age |
| Agent worker | 2+ across hosts | 1.5 GiB | `agents` depth/oldest age |
| Export worker | 2+ across hosts | 2 GiB | `exports` depth/oldest age |
| Beat | exactly 1 | 512 MiB | process heartbeat |

These are initial isolation budgets, not promised user capacity. Raise them only from observed peak RSS and load-test
results. Set a hard container limit and a lower monitoring alert for every service. A container OOM should restart one
replica; it must never trigger a host-wide OOM.

## Load balancer

Use:

- liveness: `GET /`
- readiness: `GET /health/ready/`

Readiness returns HTTP 503 when that replica cannot query PostgreSQL, allowing the load balancer to remove it without
serving database-backed requests from a broken process.

## Host guardrails

Application hosts need a small encrypted or permission-protected swap file as a last-resort buffer, host-level memory
alerts, and enough unallocated RAM for the operating system. Swap is not capacity and sustained swap usage is a paging
incident that requires scaling or leak investigation.

Do not place PostgreSQL, Redis, or RabbitMQ on the same hosts as horizontally scaled workers. Their memory must remain
available even when an export or agent pool is saturated.

## Database recovery

Until PostgreSQL is moved to a managed or dedicated database host, install
[`backup-postgres.sh`](./backup-postgres.sh) with the accompanying
[`systemd`](./systemd) units. The timer creates a verified custom-format dump every day, keeps seven days locally, and
runs at low CPU and I/O priority. Test the timer after installation with:

```bash
sudo systemctl start dragonfruit-postgres-backup.service
sudo systemctl status dragonfruit-postgres-backup.service --no-pager
sudo systemctl list-timers dragonfruit-postgres-backup.timer --no-pager
```

Local dumps are only a short-term recovery layer. Replicate encrypted backups to a different provider/account and
regularly perform a restore drill. Before launch, use PostgreSQL continuous archiving or a managed service with
point-in-time recovery; a dump on the same host cannot recover from host or disk loss.

## Rollout

1. Publish the image and record its commit-SHA tag.
2. Run the one-shot migrator and stop the rollout if it fails.
3. Update and verify the default worker first; it consumes all queues during migration.
4. Update the dedicated worker pools.
5. Update Beat, keeping exactly one replica.
6. Update API replicas one at a time behind the load balancer.
7. Restrict each pool to its service profile after all queues have healthy consumers.

Follow the queue details in [`docs/celery-queues.md`](../../docs/celery-queues.md). After rollout, load-test both
synchronous API traffic and asynchronous queue production, then set autoscaling thresholds from queue age rather than
queue depth alone.

## Configuration invariants

Coolify must reject or alert on these states:

- any API/worker/Beat resource missing `DATABASE_URL`, `REDIS_URL`, or `AMQP_URL`;
- more than one Beat replica;
- duplicate worker resources for the same pool without an intentional replica plan;
- a worker in a restart loop;
- any production-host Docker build.

The current image startup validates Celery numeric limits. Coolify still owns secret presence and container memory
limits, so verify the environment summary before every first deployment.
