#!/usr/bin/env bash
# Move the recorder's data from the Railway volume to the AWS host, in four steps. Each step is a
# subcommand so a failed step can be re-run on its own.
#
#   deploy/aws/migrate-volume.sh snapshot   # on Railway: consistent copy of the live SQLite db (VACUUM INTO) + targets.json
#   deploy/aws/migrate-volume.sh fetch      # Railway -> ./deploy/aws/transfer/ (base64 over railway ssh), sha256 checked
#   deploy/aws/migrate-volume.sh restore    # local -> S3 transfer bucket -> host (/data/recorder), recorder stopped during the copy
#   deploy/aws/migrate-volume.sh verify     # run `verify` and `status` against the restored database on the host
#
# Needs: `railway login` + `railway link` to the recorder service (for snapshot/fetch); AWS credentials and
# the stack from up.sh (for restore/verify). The Railway service keeps running until you take it down
# yourself (`railway down`); the few minutes of overlap are harmless, the gap after it shows in `gaps`.
set -euo pipefail
cd "$(dirname "$0")/../.."
STACK="${STACK:-pm-workers}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-north-1}}"
export AWS_PROFILE="${AWS_PROFILE:-insurance-markets}"
DIR=deploy/aws/transfer
mkdir -p "$DIR"
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
rssh() { railway ssh -- "$@"; }
ssm_run() { # run a shell script on the host and print its output
  local cmd_id status
  cmd_id="$(aws ssm send-command --instance-ids "$(out InstanceId)" --document-name AWS-RunShellScript \
    --parameters "$(python3 -I -c 'import json,sys; print(json.dumps({"commands":[sys.stdin.read()]}))' <<<"$1")" \
    --query Command.CommandId --output text)"
  for _ in $(seq 1 120); do
    status="$(aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$(out InstanceId)" --query Status --output text 2>/dev/null || echo Pending)"
    case "$status" in Pending|InProgress|Delayed) sleep 5 ;; *) break ;; esac
  done
  aws ssm get-command-invocation --command-id "$cmd_id" --instance-id "$(out InstanceId)" --query '[StandardOutputContent,StandardErrorContent]' --output text
  [ "$status" = Success ]
}

case "${1:-}" in
  snapshot)
    # node:sqlite is in the image; VACUUM INTO writes a consistent single-file copy while the recorder keeps running.
    rssh node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/recorder.sqlite',{readOnly:true});d.exec(\"VACUUM INTO '/data/snapshot.sqlite'\");d.close();console.log('snapshot written')"
    rssh sh -c 'ls -l /data/snapshot.sqlite /data/targets.json; sha256sum /data/snapshot.sqlite /data/targets.json' | tee "$DIR/remote.sha256"
    ;;
  fetch)
    for f in snapshot.sqlite targets.json; do
      echo "fetch $f"
      rssh base64 -w0 "/data/$f" | tr -d '\r\n' | base64 -d > "$DIR/$f"
    done
    (cd "$DIR" && sed 's#/data/##' remote.sha256 | grep -E 'snapshot|targets' | shasum -a 256 -c -)
    ;;
  restore)
    BUCKET="$(out TransferBucket)"
    aws s3 cp "$DIR/snapshot.sqlite" "s3://$BUCKET/recorder/snapshot.sqlite"
    aws s3 cp "$DIR/targets.json" "s3://$BUCKET/recorder/targets.json"
    ssm_run "set -e
systemctl stop pm-recorder || true
mkdir -p /data/recorder
rm -f /data/recorder/recorder.sqlite /data/recorder/recorder.sqlite-wal /data/recorder/recorder.sqlite-shm /data/recorder/recorder.sqlite.lock
aws s3 cp s3://$BUCKET/recorder/snapshot.sqlite /data/recorder/recorder.sqlite --region $AWS_REGION
aws s3 cp s3://$BUCKET/recorder/targets.json /data/recorder/targets.json --region $AWS_REGION
chown 1000:1000 /data/recorder/recorder.sqlite /data/recorder/targets.json
sha256sum /data/recorder/recorder.sqlite /data/recorder/targets.json
systemctl reset-failed pm-recorder || true
systemctl start pm-recorder
systemctl --no-pager status pm-recorder | head -3"
    aws s3 rm "s3://$BUCKET/recorder/" --recursive >/dev/null
    ;;
  verify)
    ssm_run "/usr/local/bin/pm-recorder-cmd verify 2>&1 | tail -20; /usr/local/bin/pm-recorder-cmd status 2>&1 | tail -30"
    ;;
  *) sed -n 2,14p "$0"; exit 2 ;;
esac
