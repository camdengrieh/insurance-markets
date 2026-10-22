# pm-recorder and pm-linker on AWS

Replaces the two Railway services (`deploy/recorder`, `deploy/linker`) with one small AWS stack:

| Piece | AWS | Why this shape |
|---|---|---|
| recorder (continuous, SQLite on a volume) | one Graviton EC2 host (`t4g.small`, Amazon Linux 2023), container managed by systemd, **EBS gp3 volume at `/data`** | SQLite needs a real block device: EFS (NFS) breaks its locking, and Fargate's ephemeral or task-scoped storage loses the 30-day series on every redeploy |
| linker (every two hours, exits) | same host, systemd **timer** `*-*-* 00/2:00:00` UTC running the container once | identical to the Railway cron service, no second host |
| images | two **ECR** repositories, built locally for `linux/arm64` by `push.sh` | the Dockerfiles are unchanged; the build context is still the repository root |
| logs | **CloudWatch Logs**, two groups, 30-day retention | `aws logs tail` replaces `railway logs` |
| shell | **SSM Session Manager** | no SSH key, no inbound port; the security group has no ingress at all |
| data moves | a private **S3 transfer bucket**, objects expire after 14 days | used once by `migrate-volume.sh`, later for copying reports out |

Everything is in one CloudFormation template (`stack.yaml`) so there is nothing to install beyond the
AWS CLI. The data volume is a separate resource with `DeletionPolicy: Retain`: deleting the stack or
replacing the instance keeps the recordings.

Cost, on-demand eu-north-1 list prices read 2026-10-22, unmeasured: `t4g.small` about $12/month, the
10 GiB gp3 volume under $1, logs and egress cents. Roughly double Railway's Hobby fee; a `t4g.micro`
(1 GiB RAM, about $6) is enough for the recorder alone but tight when the linker pass overlaps.

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

## Day to day

```sh
aws ssm start-session --target <InstanceId>          # shell on the host (sudo -i)
aws logs tail /pm-workers/pm-recorder --follow        # what the recorder prints
aws logs tail /pm-workers/pm-linker --since 3h
sudo pm-recorder-cmd status | verify | gaps | report  # on the host: the read commands against the live volume
sudo systemctl status pm-recorder pm-linker.timer     # on the host
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

`aws cloudformation delete-stack --stack-name pm-workers` removes the host, repositories (emptied) and
log groups. The data volume and the transfer bucket are retained on purpose; delete them by hand when the
study is over (`aws ec2 delete-volume --volume-id <DataVolumeId>`, `aws s3 rb s3://<bucket> --force`).

## Files

| File | Purpose |
|---|---|
| `stack.yaml` | the CloudFormation template: ECR x2, S3 transfer bucket, log groups, IAM role, security group, EBS volume + attachment, EC2 host with the first-boot script (Docker, mount, systemd units, `pm-pull`, `pm-deploy`, `pm-recorder-cmd`) |
| `up.sh` | resolves the default VPC/subnet/AZ and runs `aws cloudformation deploy` |
| `push.sh` | builds both images for arm64, pushes to ECR, runs `pm-deploy` over SSM |
| `migrate-volume.sh` | the four-step copy of the Railway volume to the host |
| `transfer/` | git-ignored scratch space for the copied database |

## What was and was not verified

Verified locally: `cfn-lint` passes on the template; the scripts pass `bash -n` and shellcheck; the
recorder and linker images build for `linux/arm64` with the unchanged Dockerfiles, and the recorder container starts
(entrypoint, privilege drop, `node:sqlite`) and answers `status`. Not verified: anything on AWS itself (no credentials were available when this was written):
the first-boot script, the volume appearing under `/dev/disk/by-id/`, SSM command output, CloudWatch log
delivery, the `railway ssh` transport for `migrate-volume.sh` (binary goes through base64 for that reason,
and the sha256 is checked on both sides).
