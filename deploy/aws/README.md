# pm-recorder, pm-linker and pm-api on AWS

Replaces the two Railway services (`deploy/recorder`, `deploy/linker`) with one small AWS stack, and
hosts the markets API (`deploy/api`, with the XO and Limitless order relays switched on) on the same host behind
CloudFront:

| Piece | AWS | Why this shape |
|---|---|---|
| recorder (continuous, SQLite on a volume) | one Graviton EC2 host (`t4g.small`, Amazon Linux 2023), container managed by systemd, **EBS gp3 volume at `/data`** | SQLite needs a real block device: EFS (NFS) breaks its locking, and Fargate's ephemeral or task-scoped storage loses the 30-day series on every redeploy |
| linker (every two hours, exits) | same host, systemd **timer** `*-*-* 00/2:00:00` UTC running the container once | identical to the Railway cron service, no second host |
| markets API with the XO and Limitless relays (`pm-api`) | same host, container managed by systemd on port 8790, data in `/data/api`, `API_XO_RELAY=on`, `API_LIMITLESS_RELAY=on`, `API_TRUST_PROXY_HOPS=1`, `API_INDEXER=off` | the relays must answer the dApp's browser with CORS, which XO's order book and bundler and Limitless's API do not; one more container is cheaper than a second host |
| HTTPS for the API | a **CloudFront** distribution (default `*.cloudfront.net` certificate), HTTPS to the browser, plain HTTP to the host; caching disabled | the API speaks plain HTTP and a page on https may only call https; no domain, certificate or load balancer to run |
| stable origin | an **Elastic IP** on the host; CloudFront's origin is its public DNS name `ec2-a-b-c-d.eu-north-1.compute.amazonaws.com` | the auto-assigned public address changes on stop/start; associating the Elastic IP replaces it in place, without a restart |
| API host setup | an **SSM document and association** that writes the `pm-api` unit and new `pm-pull` / `pm-deploy` on the running host | changing the instance's first-boot script would stop and start the host (and cloud-init would not re-run it); the association runs now, and again whenever its script changes |
| images | three **ECR** repositories, built locally for `linux/arm64` by `push.sh` | the Dockerfiles are unchanged; the build context is still the repository root |
| logs | **CloudWatch Logs**, three groups, 30-day retention | `aws logs tail` replaces `railway logs` |
| shell | **SSM Session Manager** | no SSH key; the only ingress rule is the API port, open to CloudFront's origin-facing prefix list (`com.amazonaws.global.cloudfront.origin-facing`) and nothing else |
| data moves | a private **S3 transfer bucket**, objects expire after 14 days | used once by `migrate-volume.sh`, later for copying reports out |

Everything is in one CloudFormation template (`stack.yaml`) so there is nothing to install beyond the
AWS CLI. The data volume is a separate resource with `DeletionPolicy: Retain`: deleting the stack or
replacing the instance keeps the recordings.

Cost, on-demand eu-north-1 list prices read 2026-10-22, unmeasured: `t4g.small` about $12/month, the
10 GiB gp3 volume under $1, logs and egress cents. Roughly double Railway's Hobby fee; a `t4g.micro`
(1 GiB RAM, about $6) is enough for the recorder alone but tight when the linker pass overlaps.
The API adds nothing for compute (same host, capped at 640 MiB of memory); the Elastic IP costs the
same hourly public-IPv4 price as the auto-assigned address it replaces (about $3.6/month either way);
CloudFront bills per request and per GB out (cents at the relay's volumes; the always-free tier covers
1 TB and 10 million requests a month).

## One-time setup

### 1. AWS credentials (you)

The scripts need an identity that can create IAM roles, EC2, EBS, ECR, S3, CloudWatch Logs and
CloudFormation stacks. Either:

- **IAM Identity Center (recommended):** `aws configure sso`, then `export AWS_PROFILE=<name>`; or
- **an IAM user with an access key:** `aws configure` and paste the key and secret.

Check with `aws sts get-caller-identity`. Credentials stay in `~/.aws`; nothing in this folder stores
them. The scripts default to profile `insurance-markets` and region `eu-north-1` (override with `AWS_PROFILE` and `AWS_REGION`).

### 2. Create the stack

```sh
deploy/aws/up.sh                       # default VPC, first public subnet, t4g.small, 10 GiB
STACK=pm-workers INSTANCE_TYPE=t4g.small DATA_GIB=10 AWS_REGION=eu-north-1 deploy/aws/up.sh
```

Takes about five minutes and prints the outputs (instance id, repository URIs, bucket, the
`aws ssm start-session` command). The host's first boot installs Docker, formats and mounts the data
volume, writes the systemd units and helper scripts, and stops: nothing runs until an image exists.
Re-running `up.sh` is a no-op unless the template or a parameter changed.

### 3. Build, push and start

```sh
deploy/aws/push.sh            # both images; or `push.sh recorder` / `push.sh linker`
```

Builds for `linux/arm64` with Docker Desktop's buildx (native on Apple Silicon), pushes `:latest` and
`:<git sha>`, then runs `pm-deploy` on the host through SSM: it pulls, starts (or restarts, only if the
image changed) the recorder, and enables the linker timer. Every later release is the same command.

### 4. Move the Railway data across (recorder)

Needs `railway login` and `railway link` to the recorder service, with the service still running:

```sh
deploy/aws/migrate-volume.sh snapshot   # VACUUM INTO /data/snapshot.sqlite on Railway, consistent while live
deploy/aws/migrate-volume.sh fetch      # Railway -> deploy/aws/transfer/ (git-ignored), sha256 checked
deploy/aws/migrate-volume.sh restore    # -> S3 -> host; stops the recorder, swaps the database in, starts it
deploy/aws/migrate-volume.sh verify     # `verify` + `status` on the host
```

Then take Railway down yourself: `railway down` (keeps the volume), and once `status` on AWS shows
snapshots arriving, delete the Railway service and volume in the dashboard. The few minutes of overlap
are harmless (both record, within budget, into separate databases); the gap between the snapshot and
the first AWS tick shows in `gaps`.

If the linker was also deployed on Railway, copy `/data/registry.json` the same way (`railway ssh -- cat
/data/registry.json > registry.json`, upload with `aws s3 cp` and drop it into `/data/linker/` on the
host through a session). If it never ran there, nothing to move: the first timer run starts from an
empty registry, exactly as on Railway.

## Deploy the markets API and the XO relay

The relay forwards requests the visitor's browser has already signed to XO's order book; it holds no
key or credential and stores nothing about them (`api/README.md`). Steps, in order, from the
repository root with the AWS profile and region the scripts default to:

1. **Update the stack.** `deploy/aws/up.sh`. It looks up CloudFront's origin-facing prefix list, refuses
   to run if a newer Amazon Linux image would replace the host (re-run with `ALLOW_HOST_REPLACE=1` only if
   you want that), and adds: the `pm-api` ECR repository and log group, the Elastic IP on the host, the
   security-group rule for port 8790 from CloudFront only, the SSM document and association that install
   the `pm-api` unit and the new `pm-pull` / `pm-deploy` on the running host (CloudFormation waits for it
   to succeed), the relay's origin request policy and the CloudFront distribution. Nothing is stopped or
   restarted; the recorder's outbound address changes once when the Elastic IP is associated. CloudFront
   takes about 5 to 15 minutes to deploy; the whole update usually finishes within 20. The outputs now
   include `ApiCloudFrontDomain`, `ApiRepositoryUri`, `ApiLogGroup` and `ElasticIp`. To see the change
   first, create a change set in the console (or `aws cloudformation deploy ... --no-execute-changeset`).
2. **Build, push and start the API.** `deploy/aws/push.sh api`. It builds `deploy/api/Dockerfile` for
   `linux/arm64`, pushes `:latest` and `:<git sha>`, and runs `pm-deploy` on the host, which pulls the
   image and starts `pm-api` (and leaves the recorder alone unless its image changed). Later releases
   are the same command; `push.sh all` builds all three images.
3. **Check it from outside.**

   ```sh
   D="$(aws cloudformation describe-stacks --stack-name pm-workers --query "Stacks[0].Outputs[?OutputKey=='ApiCloudFrontDomain'].OutputValue" --output text)"
   curl -s "https://$D/v1/health"
   curl -i -X OPTIONS "https://$D/v1/relay/xo/clob/time" \
     -H 'Origin: https://xo-markets-explorer.vercel.app' -H 'Access-Control-Request-Method: GET'
   ```

   The first answers the API's health JSON; the second answers 204 with
   `access-control-allow-origin: https://xo-markets-explorer.vercel.app`. `curl -s "https://$D/v1/relay/xo/clob/time"`
   returns XO's server time through the relay. On the host: `sudo systemctl status pm-api` and
   `aws logs tail /pm-workers/pm-api --follow` (route, status and latency only; never a header value or body).
   The API port is not reachable directly from the internet: `curl http://<ElasticIp>:8790/v1/health` times out.
   The bundler route (the dApp's account setup) needs no stack change: the `/v1/relay/*` behaviour and its origin
   request policy (`Origin`, `content-type`) already cover it; it arrives with the API image. `curl -i -X OPTIONS
   "https://$D/v1/relay/xo/bundler" -H 'Origin: https://xo-markets-explorer.vercel.app' -H
   'Access-Control-Request-Method: POST'` answers 204 with `access-control-allow-methods: POST, OPTIONS`. Do not POST a
   user operation to it by hand.
4. **Point the dApp at it.** Set `MARKETS_API_ORIGIN` in `app/src/core/markets-api.ts` to
   `https://<ApiCloudFrontDomain>`, and add that origin to the dApp's CSP `connect-src` (`app/headers.config.ts`,
   then regenerate `app/vercel.json` and `app/public/_headers` with the app's `headers:write` script); deploy the
   dApp. Until both are done the page says XO trading is not available in this build.
5. **Rolling back.** `sudo systemctl stop pm-api && sudo systemctl disable pm-api` on the host stops the API
   at once (CloudFront then answers 502). To remove the pieces, deploy the previous `stack.yaml` with `up.sh`:
   CloudFormation deletes the distribution, the rule, the Elastic IP (AWS gives the host a new auto-assigned
   public IPv4 within a few minutes; check outbound traffic resumed with `sudo pm-recorder-cmd status`),
   the association and the repository. The `pm-pull` /
   `pm-deploy` the association wrote stay on the host and keep working without an API image.

## Add the Limitless relay

The Limitless relay (`api/limitless-relay.ts`, `API_LIMITLESS_RELAY=on`) forwards the requests the visitor's browser
signed with the visitor's own Limitless API token; like the XO relay it holds no key or token and stores nothing
(`api/README.md`). It needs a stack change: an origin request policy takes at most 10 headers (CloudFront quota
"Headers per origin request policy", 10, read 2026-10-23 with `aws service-quotas`), the XO relay's policy already lists
10, so `stack.yaml` adds a second policy (`LimitlessRelayOriginRequestPolicy`: `Origin`, the two CORS request headers,
`content-type`, `lmts-api-key`, `lmts-timestamp`, `lmts-signature`) and a `/v1/relay/limitless/*` cache behaviour
listed before `/v1/relay/*`, and the `pm-api` unit gains `-e API_LIMITLESS_RELAY=on`. From the repository root:

1. **Update the stack.** `deploy/aws/up.sh`. CloudFormation adds the policy, updates the distribution (about 5 to 15
   minutes) and updates the SSM document, whose association re-runs on the host, rewrites the `pm-api` unit and
   restarts `pm-api` with the new variable (on the image the host already has). Nothing else is stopped.
2. **Push the API image that has the relay.** `deploy/aws/push.sh api`. Until it runs, the restarted container is the
   old image, which does not know `/v1/relay/limitless/` (it answers those paths as the XO relay's 404).
3. **Check it from outside** (no order, cancel or token request; the market read is a public one):

   ```sh
   D="$(aws cloudformation describe-stacks --stack-name pm-workers --query "Stacks[0].Outputs[?OutputKey=='ApiCloudFrontDomain'].OutputValue" --output text)"
   curl -i -X OPTIONS "https://$D/v1/relay/limitless/orders" \
     -H 'Origin: https://xo-markets-explorer.vercel.app' -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: content-type, lmts-api-key, lmts-timestamp, lmts-signature'
   curl -s "https://$D/v1/markets?venue=limitless&limit=1" | head -c 300
   ```

   The first answers 204 with `access-control-allow-origin: https://xo-markets-explorer.vercel.app` and the four
   request headers granted; the second is the markets API's own Limitless list (the dApp's standalone build reads
   Limitless from it). A market's record through the relay: `curl -s -H 'Origin: https://xo-markets-explorer.vercel.app'
   "https://$D/v1/relay/limitless/markets/<a slug from that list>" -D - -o /dev/null` shows `x-limitless-relay: upstream`.
4. **The dApp** needs no change of origin: it already names this API (`MARKETS_API_ORIGIN`, CSP `connect-src`). Deploy
   the dApp build that has the Limitless ticket. Without step 2 the ticket's token check answers 404 from the relay and
   the page says so; nothing reaches Limitless.
5. **Rolling back.** `-e API_LIMITLESS_RELAY=on` removed from the unit (deploy the previous `stack.yaml` with `up.sh`)
   turns the relay off: every `/v1/relay/limitless/` path then answers `403 relay_not_enabled` without contacting
   Limitless. The Limitless reads (`/v1/markets?venue=limitless`) are not part of the relay and keep working.

The container runs with `API_INDEXER=off` to keep the shared `t4g.small` light. To index chains too,
change `-e API_INDEXER=off` to `on` in the `ApiHostDocument` script in `stack.yaml` and run `up.sh` (the
association re-runs and restarts `pm-api`); consider a larger instance first. Other API variables
(`deploy/api/README.md`) go on the same `docker run` line.

## Day to day

```sh
aws ssm start-session --target <InstanceId>          # shell on the host (sudo -i)
aws logs tail /pm-workers/pm-recorder --follow        # what the recorder prints
aws logs tail /pm-workers/pm-linker --since 3h
aws logs tail /pm-workers/pm-api --follow             # route, status, latency per request
sudo pm-recorder-cmd status | verify | gaps | report  # on the host: the read commands against the live volume
sudo systemctl status pm-recorder pm-linker.timer pm-api   # on the host
sudo systemctl start pm-linker                        # on the host: one linker pass now
```

Copy a report out: on the host `pm-recorder-cmd report --format json --out /data/report.json` then
`aws s3 cp /data/recorder/report.json s3://<TransferBucket>/` and `aws s3 cp` it down locally.

Restart policy: systemd restarts the recorder on failure after 15 s, at most 10 times an hour (the
Railway setting was on-failure, 10 retries). A failed linker pass is retried by the next timer tick, not
restarted. The recorder container gets 60 s to finish its step on SIGTERM.

Raise the database cap as on Railway: write `/data/recorder/config.json` on the host and add
`-e RECORDER_CONFIG=/data/config.json` to the `docker run` line in `/etc/systemd/system/pm-recorder.service`
(then `systemctl daemon-reload && systemctl restart pm-recorder`). Grow the volume with `DATA_GIB=20
deploy/aws/up.sh` followed by `sudo xfs_growfs /data` on the host.

## Tearing down

`aws cloudformation delete-stack --stack-name pm-workers` removes the host, repositories (emptied),
log groups, the Elastic IP and the CloudFront distribution. The data volume and the transfer bucket are retained on purpose; delete them by hand when the
study is over (`aws ec2 delete-volume --volume-id <DataVolumeId>`, `aws s3 rb s3://<bucket> --force`).

## Files

| File | Purpose |
|---|---|
| `stack.yaml` | the CloudFormation template: ECR x3, S3 transfer bucket, log groups, IAM role, security group (one ingress rule: the API port from CloudFront's prefix list), EBS volume + attachment, EC2 host with the first-boot script (Docker, mount, systemd units, `pm-pull`, `pm-deploy`, `pm-recorder-cmd`), the Elastic IP, the SSM document and association for `pm-api`, the two relays' origin request policies (XO, Limitless) and the CloudFront distribution with a cache behaviour for each |
| `up.sh` | resolves the default VPC/subnet/AZ and CloudFront's prefix list, guards against a host replacement, and runs `aws cloudformation deploy` |
| `push.sh` | builds the images for arm64 (`both` = recorder and linker, or `recorder`, `linker`, `api`, `all`), pushes to ECR, runs `pm-deploy` over SSM |
| `migrate-volume.sh` | the four-step copy of the Railway volume to the host |
| `transfer/` | git-ignored scratch space for the copied database |

## What was and was not verified

Verified locally: `cfn-lint` passes on the template; the scripts pass `bash -n` and shellcheck; the
recorder and linker images build for `linux/arm64` with the unchanged Dockerfiles, and the recorder container starts
(entrypoint, privilege drop, `node:sqlite`) and answers `status`. Not verified: anything on AWS itself (no credentials were available when this was written):
the first-boot script, the volume appearing under `/dev/disk/by-id/`, SSM command output, CloudWatch log
delivery, the `railway ssh` transport for `migrate-volume.sh` (binary goes through base64 for that reason,
and the sha256 is checked on both sides).

For the API (2026-10-23): the `deploy/api` image builds for `linux/arm64` with `docker buildx` (not pushed), and a
local run of it with `API_XO_RELAY=on API_INDEXER=off` answered `/v1/health`, a relay preflight from the dApp's origin
(204 with the CORS grant) and refused another origin (403) without contacting XO. `cfn-lint` 1.58.0 passes on the template and `aws cloudformation validate-template`
accepts it; `up.sh` and `push.sh` pass `bash -n` and shellcheck; the association's script, rendered with
sample values, passes `bash -n` and shellcheck (only the informational "not following /etc/pm-workers.env").
Read-only checks of the running stack: the host has an auto-assigned public IPv4 whose DNS name has the
`ec2-a-b-c-d.eu-north-1.compute.amazonaws.com` form the origin is built from, the VPC has DNS hostnames on,
no Elastic IP is on the host yet, the security group has no ingress rule (the CloudFront prefix list counts as
55 rules against the quota of 60), and the running host's image is the current Amazon Linux 2023 image, so
`up.sh` would not replace it today. Not verified: nothing was deployed. The association's run on the host,
CloudFront forwarding the `xo-*` headers and `Origin` through the origin request policy, the Elastic IP's DNS
name resolving for CloudFront, and the 10-header quota of an origin request policy being enough (the relay's
policy lists exactly 10) are all unproven until `up.sh` runs.

For the Limitless relay (2026-10-23): `aws cloudformation validate-template` accepts the changed template, and the
quota of 10 headers per origin request policy was read with `aws service-quotas` (hence the second policy). The relay
itself is covered by `test/api/limitless-relay.test.ts` against a fake Limitless. Not verified: nothing was deployed,
and no order, cancel or token request has reached Limitless through it; CloudFront forwarding the `lmts-*` headers is
unproven until `up.sh` and `push.sh api` run.
